"""Stage 2 - transform.

Converts raw source strings into typed station and crime-record rows.

Rules applied here:
  * A blank or non-numeric offence value becomes NULL, never 0, and is reported.
  * Station identity is the source station name. Where the source gives a station different
    district or coordinate values in different years, the most recent non-empty value is used
    and the change is reported rather than merged silently.
  * Province is derived from the district municipality via the reference lookup. An unmatched
    district leaves province empty and is reported; it is never guessed.
  * Identifiers are pure functions of source values, so a second run upserts the same rows.
"""

from __future__ import annotations

import hashlib
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from crimemap import config  # noqa: E402
from crimemap.provinces import province_for_district  # noqa: E402
from crimemap.reporting import ERROR, INFO, WARNING, ValidationReport  # noqa: E402
from crimemap.taxonomy import offence_columns, source_offence_variables  # noqa: E402
from crimemap.text import (  # noqa: E402
    canonical_financial_year,
    display_station_name,
    slugify,
)

# Distance beyond which a station's coordinates changing between years is worth flagging.
COORDINATE_DRIFT_KM = 10.0


@dataclass
class StationRow:
    station_slug: str
    station_name: str
    station_name_source: str
    district_municipality: Optional[str]
    local_municipality: Optional[str]
    province_code: Optional[str]
    province_name: Optional[str]
    province_slug: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]

    def to_payload(self) -> Dict[str, object]:
        return {
            "station_slug": self.station_slug,
            "station_name": self.station_name,
            "station_name_source": self.station_name_source,
            "district_municipality": self.district_municipality,
            "local_municipality": self.local_municipality,
            "province_code": self.province_code,
            "province_name": self.province_name,
            "province_slug": self.province_slug,
            "latitude": self.latitude,
            "longitude": self.longitude,
        }


@dataclass
class CrimeRecordRow:
    station_slug: str
    financial_year: str
    financial_year_source: str
    financial_year_start: int
    counts: Dict[str, Optional[int]]
    raw_source_id: str

    def to_payload(self, station_id: int) -> Dict[str, object]:
        payload: Dict[str, object] = {
            "station_id": station_id,
            "financial_year": self.financial_year,
            "financial_year_source": self.financial_year_source,
            "financial_year_start": self.financial_year_start,
            "raw_source_id": self.raw_source_id,
        }
        payload.update(self.counts)
        return payload


@dataclass
class TransformResult:
    stations: List[StationRow] = field(default_factory=list)
    records: List[CrimeRecordRow] = field(default_factory=list)


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if text == "" or text.lower() in {"na", "n/a", "nan", "none", "null", "."}:
        return None
    return text


def parse_count(
    value: Optional[str],
    *,
    report: ValidationReport,
    station_name: str,
    financial_year: Optional[str],
    column: str,
) -> Optional[int]:
    """Parse an offence count. Anything unparseable becomes NULL and is reported."""
    text = _clean(value)
    if text is None:
        return None

    try:
        number = float(text)
    except ValueError:
        report.add(
            WARNING,
            "values.non_numeric",
            "Value for '{0}' is not numeric and has been recorded as not available.".format(column),
            station_name=station_name,
            financial_year=financial_year,
            column_name=column,
            observed_value=text,
        )
        return None

    if math.isnan(number):
        return None

    if not float(number).is_integer():
        report.add(
            WARNING,
            "values.non_integer",
            "Value for '{0}' is not a whole number. The source value is preserved by rounding "
            "to the nearest whole number for storage in an integer column.".format(column),
            station_name=station_name,
            financial_year=financial_year,
            column_name=column,
            observed_value=text,
        )

    return int(round(number))


def parse_coordinate(value: Optional[str]) -> Optional[float]:
    text = _clean(value)
    if text is None:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    if math.isnan(number):
        return None
    return number


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * radius * math.asin(min(1.0, math.sqrt(a)))


def raw_source_id(station_slug: str, financial_year: str) -> str:
    """Deterministic identifier for a source observation, used for idempotent upserts."""
    material = "{0}|{1}|{2}".format(config.SOURCE_KEY, station_slug, financial_year)
    return hashlib.sha1(material.encode("utf-8")).hexdigest()


def transform(rows: List[Dict[str, Optional[str]]], report: ValidationReport) -> TransformResult:
    source_columns = source_offence_variables()
    known_columns = set(offence_columns())

    # station_slug -> newest observation of its attributes
    station_state: Dict[str, Dict[str, object]] = {}
    # (station_slug, financial_year) -> index of the first record seen
    seen_keys: Dict[Tuple[str, str], int] = {}
    records: List[CrimeRecordRow] = []

    skipped_rows = 0

    for row_number, row in enumerate(rows, start=2):  # header is line 1
        station_name = _clean(row.get("station"))
        if station_name is None:
            report.add(
                ERROR,
                "schema.missing_station",
                "Row {0} has no police station name and cannot be loaded.".format(row_number),
            )
            skipped_rows += 1
            continue

        year_source = _clean(row.get("year"))
        financial_year, year_start = canonical_financial_year(year_source)
        if financial_year is None or year_start is None:
            report.add(
                ERROR,
                "schema.unparseable_financial_year",
                "Row {0} has a financial year that could not be interpreted, so the row was not "
                "loaded. The source value is preserved here for investigation.".format(row_number),
                station_name=station_name,
                observed_value=year_source,
            )
            skipped_rows += 1
            continue

        station_slug = slugify(station_name)
        if not station_slug:
            report.add(
                ERROR,
                "schema.unusable_station_name",
                "Row {0} has a station name that produces an empty identifier.".format(row_number),
                station_name=station_name,
                observed_value=station_name,
            )
            skipped_rows += 1
            continue

        key = (station_slug, financial_year)
        if key in seen_keys:
            report.add(
                ERROR,
                "uniqueness.duplicate_station_year",
                "Row {0} repeats {1} for {2}, which already appeared on row {3}. The duplicate "
                "was rejected and the first observation kept.".format(
                    row_number, station_name, financial_year, seen_keys[key]
                ),
                station_name=station_name,
                financial_year=financial_year,
            )
            skipped_rows += 1
            continue
        seen_keys[key] = row_number

        counts: Dict[str, Optional[int]] = {}
        for column in known_columns:
            if column not in source_columns:
                # Documented in the taxonomy but absent from the source file.
                counts[column] = None
                continue
            counts[column] = parse_count(
                row.get(column),
                report=report,
                station_name=station_name,
                financial_year=financial_year,
                column=column,
            )

        records.append(
            CrimeRecordRow(
                station_slug=station_slug,
                financial_year=financial_year,
                financial_year_source=year_source or financial_year,
                financial_year_start=year_start,
                counts=counts,
                raw_source_id=raw_source_id(station_slug, financial_year),
            )
        )

        _update_station_state(
            station_state,
            station_slug=station_slug,
            station_name=station_name,
            year_start=year_start,
            district=_clean(row.get("dc_mn")),
            local=_clean(row.get("loc_mn")),
            latitude=parse_coordinate(row.get("latitude")),
            longitude=parse_coordinate(row.get("longitude")),
            report=report,
        )

    stations = _finalise_stations(station_state, report)

    report.counts["rows_skipped"] = skipped_rows
    report.counts["stations_built"] = len(stations)
    report.counts["records_built"] = len(records)

    return TransformResult(stations=stations, records=records)


def _update_station_state(
    state: Dict[str, Dict[str, object]],
    *,
    station_slug: str,
    station_name: str,
    year_start: int,
    district: Optional[str],
    local: Optional[str],
    latitude: Optional[float],
    longitude: Optional[float],
    report: ValidationReport,
) -> None:
    existing = state.get(station_slug)

    if existing is None:
        state[station_slug] = {
            "station_name": station_name,
            "district": district,
            "local": local,
            "latitude": latitude,
            "longitude": longitude,
            "district_year": year_start if district else None,
            "local_year": year_start if local else None,
            "coord_year": year_start if latitude is not None else None,
            "name_year": year_start,
        }
        return

    # Flag a station whose coordinates move a long way between years.
    prev_lat = existing.get("latitude")
    prev_lon = existing.get("longitude")
    if (
        latitude is not None
        and longitude is not None
        and isinstance(prev_lat, float)
        and isinstance(prev_lon, float)
    ):
        distance = haversine_km(prev_lat, prev_lon, latitude, longitude)
        if distance > COORDINATE_DRIFT_KM:
            report.add(
                WARNING,
                "geography.station_coordinates_moved",
                "Coordinates for {0} differ by {1:.0f} km between financial years. Both source "
                "values are preserved; the most recent year's coordinates are used for the map "
                "and this difference is flagged for investigation.".format(station_name, distance),
                station_name=station_name,
                observed_value="{0},{1} vs {2},{3}".format(prev_lat, prev_lon, latitude, longitude),
            )

    prev_district = existing.get("district")
    if district and prev_district and district != prev_district:
        report.add(
            INFO,
            "geography.district_changed",
            "{0} appears under more than one district municipality across years. The most recent "
            "value is used for navigation and both remain visible in the source data.".format(
                station_name
            ),
            station_name=station_name,
            observed_value="{0} vs {1}".format(prev_district, district),
        )

    # Keep the most recent non-empty value for each attribute.
    if district and year_start >= int(existing.get("district_year") or -1):
        existing["district"] = district
        existing["district_year"] = year_start
    if local and year_start >= int(existing.get("local_year") or -1):
        existing["local"] = local
        existing["local_year"] = year_start
    if latitude is not None and longitude is not None and year_start >= int(
        existing.get("coord_year") or -1
    ):
        existing["latitude"] = latitude
        existing["longitude"] = longitude
        existing["coord_year"] = year_start
    if year_start >= int(existing.get("name_year") or -1):
        existing["station_name"] = station_name
        existing["name_year"] = year_start


def _finalise_stations(
    state: Dict[str, Dict[str, object]], report: ValidationReport
) -> List[StationRow]:
    stations: List[StationRow] = []
    unmatched_districts: Dict[str, int] = {}

    for station_slug in sorted(state):
        attributes = state[station_slug]
        district = attributes.get("district")
        district_text = str(district) if district else None

        province = province_for_district(district_text)
        if province is None and district_text:
            unmatched_districts[district_text] = unmatched_districts.get(district_text, 0) + 1

        latitude = attributes.get("latitude")
        longitude = attributes.get("longitude")

        source_name = str(attributes.get("station_name"))

        stations.append(
            StationRow(
                station_slug=station_slug,
                station_name=display_station_name(source_name),
                station_name_source=source_name,
                district_municipality=district_text,
                local_municipality=str(attributes["local"]) if attributes.get("local") else None,
                province_code=province.code if province else None,
                province_name=province.name if province else None,
                province_slug=province.slug if province else None,
                latitude=float(latitude) if isinstance(latitude, float) else None,
                longitude=float(longitude) if isinstance(longitude, float) else None,
            )
        )

    for district_text, count in sorted(unmatched_districts.items()):
        report.add(
            WARNING,
            "geography.unmatched_district",
            "District municipality '{0}' is not in data/reference/province_by_district.csv, so "
            "province is left unavailable for {1} station(s). Add the spelling to that file "
            "rather than guessing a province.".format(district_text, count),
            observed_value=district_text,
        )

    missing_district = sum(1 for s in stations if not s.district_municipality)
    if missing_district:
        # Distinct from an unmatched district: here the source itself gives no district, so
        # there is nothing to look up and province is legitimately unavailable.
        report.add(
            INFO,
            "geography.missing_district",
            "{0} station(s) have no district municipality in the source data, so province cannot "
            "be derived for them. They are reachable by search and by their station page, but not "
            "through a province URL.".format(missing_district),
            observed_value=missing_district,
        )

    missing_province = sum(1 for s in stations if s.province_slug is None)
    if missing_province:
        report.counts["stations_without_province"] = missing_province

    return stations


def main() -> int:
    import argparse

    from ingest.run import find_source_file, ingest  # type: ignore[import-not-found]

    parser = argparse.ArgumentParser(description="Ingest and transform the source dataset.")
    parser.add_argument("--input")
    args = parser.parse_args()

    report = ValidationReport()
    data = ingest(find_source_file(args.input), report)
    result = transform(data.rows, report)

    print("Stations {0}".format(len(result.stations)))
    print("Records  {0}".format(len(result.records)))
    report.print_summary()
    return 1 if report.has_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
