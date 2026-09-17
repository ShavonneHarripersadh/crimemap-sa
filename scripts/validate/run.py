"""Stage 3 - validate.

Checks the transformed data before it is loaded. Nothing here alters a value: each check either
records a finding or lets the data through. An unusual figure is flagged and preserved, because a
source value that looks strange may simply be correct.

Checks:
  geography      coordinates present, numeric and inside South Africa's bounds
  values         no negative counts, extreme year-on-year movements flagged
  consistency    published totals compared against the sum of their subcategories
  uniqueness     one observation per station and financial year
  referential    every record points at a station that will exist
  coverage       how much of the documented schema the file actually provided
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from crimemap.reporting import ERROR, INFO, WARNING, ValidationReport  # noqa: E402
from crimemap.taxonomy import consistency_checks, headline_community_columns  # noqa: E402

# Generous bounding box for South Africa including the Prince Edward Islands' longitude range is
# deliberately not used; these are the mainland and territorial bounds the station data should
# fall inside. Anything outside is flagged, not corrected.
SA_BOUNDS = {
    "min_latitude": -35.0,
    "max_latitude": -22.0,
    "min_longitude": 16.0,
    "max_longitude": 33.1,
}

# A single category moving by more than this multiple of the previous year is flagged for
# investigation. It does not stop the load.
EXTREME_MULTIPLE = 10
EXTREME_MINIMUM_BASE = 20


def validate(
    stations: List["StationRow"],  # type: ignore[name-defined]
    records: List["CrimeRecordRow"],  # type: ignore[name-defined]
    report: ValidationReport,
) -> None:
    _validate_geography(stations, report)
    _validate_referential_integrity(stations, records, report)
    _validate_uniqueness(records, report)
    _validate_values(records, report)
    _validate_consistency(records, report)
    _validate_coverage(records, report)


def _validate_geography(stations: List["StationRow"], report: ValidationReport) -> None:  # type: ignore[name-defined]
    missing_coordinates = 0

    for station in stations:
        if station.latitude is None or station.longitude is None:
            missing_coordinates += 1
            report.add(
                WARNING,
                "geography.missing_coordinates",
                "{0} has no usable coordinates in the source data, so it cannot be placed on the "
                "map. Its crime figures are still loaded and shown on its profile.".format(
                    station.station_name
                ),
                station_name=station.station_name,
            )
            continue

        outside = (
            station.latitude < SA_BOUNDS["min_latitude"]
            or station.latitude > SA_BOUNDS["max_latitude"]
            or station.longitude < SA_BOUNDS["min_longitude"]
            or station.longitude > SA_BOUNDS["max_longitude"]
        )
        if outside:
            report.add(
                WARNING,
                "geography.outside_south_africa",
                "Coordinates for {0} fall outside South Africa's expected bounds. The source "
                "values are stored unchanged and flagged for investigation.".format(
                    station.station_name
                ),
                station_name=station.station_name,
                observed_value="{0},{1}".format(station.latitude, station.longitude),
                expected_value="latitude {0} to {1}, longitude {2} to {3}".format(
                    SA_BOUNDS["min_latitude"],
                    SA_BOUNDS["max_latitude"],
                    SA_BOUNDS["min_longitude"],
                    SA_BOUNDS["max_longitude"],
                ),
            )

    report.counts["stations_without_coordinates"] = missing_coordinates


def _validate_referential_integrity(
    stations: List["StationRow"],  # type: ignore[name-defined]
    records: List["CrimeRecordRow"],  # type: ignore[name-defined]
    report: ValidationReport,
) -> None:
    known = {station.station_slug for station in stations}
    orphans = 0

    for record in records:
        if record.station_slug not in known:
            orphans += 1
            report.add(
                ERROR,
                "referential.unknown_station",
                "A crime record references station '{0}', which has no station row. The record "
                "cannot be loaded.".format(record.station_slug),
                station_name=record.station_slug,
                financial_year=record.financial_year,
            )

    report.counts["orphan_records"] = orphans


def _validate_uniqueness(
    records: List["CrimeRecordRow"], report: ValidationReport  # type: ignore[name-defined]
) -> None:
    seen: Dict[Tuple[str, str], int] = {}
    duplicates = 0

    for record in records:
        key = (record.station_slug, record.financial_year)
        if key in seen:
            duplicates += 1
            report.add(
                ERROR,
                "uniqueness.duplicate_after_transform",
                "More than one observation exists for {0} in {1} after transformation.".format(
                    record.station_slug, record.financial_year
                ),
                station_name=record.station_slug,
                financial_year=record.financial_year,
            )
        seen[key] = seen.get(key, 0) + 1

    report.counts["duplicate_observations"] = duplicates


def _validate_values(
    records: List["CrimeRecordRow"], report: ValidationReport  # type: ignore[name-defined]
) -> None:
    negatives = 0

    for record in records:
        for column, value in sorted(record.counts.items()):
            if value is None:
                continue
            if value < 0:
                negatives += 1
                # Recorded as a warning rather than an error so that a small number of bad source
                # values cannot block an otherwise good file. The value is stored exactly as
                # distributed; the application excludes negatives from calculations and shows them
                # as not available, and says so on the methodology page.
                report.add(
                    WARNING,
                    "values.negative",
                    "A negative count was found for '{0}'. A count of recorded crimes cannot be "
                    "negative, so this value is stored unchanged but excluded from totals and "
                    "shown as not available.".format(column),
                    station_name=record.station_slug,
                    financial_year=record.financial_year,
                    column_name=column,
                    observed_value=value,
                )

    report.counts["negative_values"] = negatives

    _flag_extreme_movements(records, report)


def _flag_extreme_movements(
    records: List["CrimeRecordRow"], report: ValidationReport  # type: ignore[name-defined]
) -> None:
    """Flag implausibly large single-year movements without changing any value."""
    by_station: Dict[str, List["CrimeRecordRow"]] = {}  # type: ignore[name-defined]
    for record in records:
        by_station.setdefault(record.station_slug, []).append(record)

    flagged = 0

    for station_slug, station_records in sorted(by_station.items()):
        ordered = sorted(station_records, key=lambda r: r.financial_year_start)
        for previous, current in zip(ordered, ordered[1:]):
            for column, value in sorted(current.counts.items()):
                before = previous.counts.get(column)
                if value is None or before is None:
                    continue
                if before < EXTREME_MINIMUM_BASE:
                    continue
                if value > before * EXTREME_MULTIPLE or (
                    value * EXTREME_MULTIPLE < before and value >= 0
                ):
                    flagged += 1
                    report.add(
                        WARNING,
                        "values.extreme_movement",
                        "'{0}' changed from {1} to {2} between {3} and {4}. The source values are "
                        "kept exactly as distributed and flagged for investigation.".format(
                            column,
                            before,
                            value,
                            previous.financial_year,
                            current.financial_year,
                        ),
                        station_name=station_slug,
                        financial_year=current.financial_year,
                        column_name=column,
                        observed_value=value,
                        expected_value=before,
                    )

    report.counts["extreme_movements_flagged"] = flagged


def _validate_consistency(
    records: List["CrimeRecordRow"], report: ValidationReport  # type: ignore[name-defined]
) -> None:
    """Compare published totals against the sum of their subcategories.

    Neither figure is adjusted. A mismatch is reported so the taxonomy assumption can be checked
    against the source documentation.
    """
    mismatches: Dict[str, int] = {}

    for check in consistency_checks():
        for record in records:
            if (
                check.applies_from_financial_year_start is not None
                and record.financial_year_start < check.applies_from_financial_year_start
            ):
                continue

            total = record.counts.get(check.total)
            parts = [record.counts.get(part) for part in check.parts]

            if total is None or any(part is None for part in parts):
                continue

            part_sum = sum(int(part) for part in parts if part is not None)

            if check.mode == "contains":
                # The published subcategories are only some of the parent's subcategories, so the
                # parent must be at least their sum. Being larger is expected and correct.
                if int(total) >= part_sum:
                    continue
                complaint = (
                    "'{0}' is {1}, which is less than the {2} recorded across its own published "
                    "subcategories. A total cannot be smaller than its parts. {3}"
                ).format(check.total, total, part_sum, check.description)
            else:
                if part_sum == int(total):
                    continue
                complaint = (
                    "'{0}' is {1} but its published subcategories sum to {2}. {3}"
                ).format(check.total, total, part_sum, check.description)

            mismatches[check.id] = mismatches.get(check.id, 0) + 1

            # Only the first few of each kind are recorded individually; the count is what matters.
            if mismatches[check.id] <= 5:
                report.add(
                    check.severity if check.severity in {ERROR, WARNING, INFO} else WARNING,
                    "consistency.{0}".format(check.id),
                    complaint,
                    station_name=record.station_slug,
                    financial_year=record.financial_year,
                    column_name=check.total,
                    observed_value=total,
                    expected_value=part_sum,
                )

    for check_id, count in sorted(mismatches.items()):
        report.counts["consistency_mismatch_{0}".format(check_id)] = count
        if count > 5:
            report.add(
                INFO,
                "consistency.{0}".format(check_id),
                "{0} records in total show this mismatch. Only the first five are listed "
                "individually.".format(count),
            )


def _validate_coverage(
    records: List["CrimeRecordRow"], report: ValidationReport  # type: ignore[name-defined]
) -> None:
    """Report how complete the loaded data is, so a partial file is obvious."""
    headline = headline_community_columns()
    if not records:
        report.add(ERROR, "coverage.no_records", "No crime records were produced from the source file.")
        return

    fully_missing: List[str] = []
    for column in headline:
        if all(record.counts.get(column) is None for record in records):
            fully_missing.append(column)

    for column in fully_missing:
        report.add(
            WARNING,
            "coverage.category_entirely_missing",
            "No record provides a figure for '{0}'. Totals will be reported as covering fewer "
            "than the full set of categories rather than treating it as zero.".format(column),
            column_name=column,
        )

    years = sorted({record.financial_year for record in records})
    report.counts["financial_years"] = len(years)
    if years:
        report.counts["earliest_financial_year"] = years[0]  # type: ignore[assignment]
        report.counts["latest_financial_year"] = years[-1]  # type: ignore[assignment]


def main() -> int:
    import argparse

    from ingest.run import find_source_file, ingest  # type: ignore[import-not-found]
    from transform.run import transform  # type: ignore[import-not-found]

    parser = argparse.ArgumentParser(description="Validate the source dataset without loading it.")
    parser.add_argument("--input")
    parser.add_argument(
        "--report",
        default="validation-report.json",
        help="Report filename written to data/output/.",
    )
    args = parser.parse_args()

    report = ValidationReport()
    data = ingest(find_source_file(args.input), report)
    result = transform(data.rows, report)
    validate(result.stations, result.records, report)

    path = report.write(args.report)
    report.print_summary()
    print("\nReport written to {0}".format(path))

    return 1 if report.has_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
