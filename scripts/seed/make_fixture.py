"""Generate the development fixture.

WHY THIS EXISTS
The real source dataset (DataFirst SAPS Annual Crime Records) requires a free account to
download, so it cannot be committed or fetched automatically. This script produces a synthetic
file with the same shape as the real one so the interface and the pipeline can be exercised
end to end before the real file is available.

THESE ARE NOT REAL CRIME FIGURES.
  * Every station name is prefixed "DEMO" so it cannot be confused with a real police station.
  * The load is recorded in ingest_runs with is_synthetic = true.
  * The application reads that flag and shows a persistent banner on every page.

The numbers are produced by hashing the station, year and category, so the file is byte-for-byte
reproducible and contains no randomness.

To replace it with real data:
  1. Download the dataset from https://datafirst.uct.ac.za/dataportal/index.php/catalog/1012
  2. Put the data file in data/raw/
  3. Run: python scripts/pipeline.py
The pipeline prefers data/raw over this fixture automatically.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from crimemap import config  # noqa: E402
from crimemap.taxonomy import all_source_columns  # noqa: E402

FIRST_YEAR = 2013
LAST_YEAR = 2024  # 2024/25 is the final financial year in the fixture

# (station name, local municipality, district municipality, latitude, longitude, size)
# Coordinates are approximate real locations so the map renders sensibly; the crime figures
# attached to them are invented.
FIXTURE_STATIONS: List[Tuple[str, str, str, float, float, float]] = [
    ("DEMO Northgate", "City of Johannesburg", "City of Johannesburg", -26.0664, 27.9459, 1.3),
    ("DEMO Sandhurst", "City of Johannesburg", "City of Johannesburg", -26.1076, 28.0567, 1.1),
    ("DEMO Bryanpark", "City of Johannesburg", "City of Johannesburg", -26.0525, 28.0212, 0.8),
    ("DEMO Fourways Gate", "City of Johannesburg", "City of Johannesburg", -26.0136, 28.0114, 0.9),
    ("DEMO Soweto Central", "City of Johannesburg", "City of Johannesburg", -26.2678, 27.8585, 1.8),
    ("DEMO Roodeplaat", "City of Tshwane", "City of Tshwane", -25.6167, 28.3500, 0.7),
    ("DEMO Pretoria North East", "City of Tshwane", "City of Tshwane", -25.7069, 28.2294, 1.4),
    ("DEMO Centurion West", "City of Tshwane", "City of Tshwane", -25.8603, 28.1894, 1.0),
    ("DEMO Kempton East", "Ekurhuleni", "Ekurhuleni", -26.1000, 28.2333, 1.2),
    ("DEMO Benoni South", "Ekurhuleni", "Ekurhuleni", -26.1885, 28.3208, 1.1),
    ("DEMO Vereeniging North", "Emfuleni", "Sedibeng", -26.6731, 27.9261, 0.9),
    ("DEMO Krugersdorp West", "Mogale City", "West Rand", -26.1000, 27.7667, 0.8),
    ("DEMO Table Bay", "City of Cape Town", "City of Cape Town", -33.9066, 18.4200, 1.5),
    ("DEMO Bellhaven", "City of Cape Town", "City of Cape Town", -33.8903, 18.6292, 1.2),
    ("DEMO Stellenkloof", "Stellenbosch", "Cape Winelands", -33.9321, 18.8602, 0.6),
    ("DEMO Durban Point", "eThekwini", "eThekwini", -29.8687, 31.0218, 1.6),
    ("DEMO Pinetown North", "eThekwini", "eThekwini", -29.8167, 30.8667, 1.0),
    ("DEMO Msunduzi East", "Msunduzi", "uMgungundlovu", -29.6006, 30.3794, 0.9),
    ("DEMO Nelson Bay Central", "Nelson Mandela Bay", "Nelson Mandela Bay", -33.9608, 25.6022, 1.1),
    ("DEMO Buffalo Central", "Buffalo City", "Buffalo City", -32.9783, 27.8546, 0.9),
    ("DEMO Mangaung West", "Mangaung", "Mangaung", -29.0852, 26.1596, 0.8),
    ("DEMO Polokwane South", "Polokwane", "Capricorn", -23.9045, 29.4689, 0.7),
    ("DEMO Mbombela East", "City of Mbombela", "Ehlanzeni", -25.4753, 30.9694, 0.7),
    ("DEMO Rustenburg North", "Rustenburg", "Bojanala Platinum", -25.6545, 27.2559, 0.8),
    ("DEMO Kimberley East", "Sol Plaatje", "Frances Baard", -28.7282, 24.7499, 0.6),
]

# Typical annual counts per category at size 1.0, chosen only to give the interface a realistic
# distribution to render. They carry no claim about real crime levels anywhere.
BASE_RATES: Dict[str, float] = {
    "murder": 18,
    "attempted_murder": 22,
    "assault_gbh": 260,
    "common_assault": 300,
    "common_robbery": 130,
    "arson": 12,
    "malicious_damage": 210,
    "burglary_res": 390,
    "burglary_nonres": 140,
    "vehicle_theft": 150,
    "theft_from_vehicle": 320,
    "stock_theft": 20,
    "other_theft": 520,
    "commercial_crime": 160,
    "shoplifting": 90,
    "illegal_firearms": 14,
    "drug_crime": 260,
    "dui": 110,
    "police_detected_sexoff": 4,
    "kidnapping": 9,
    # Subcategories of aggravated robbery; aggr_robbery is their sum.
    "carjacking": 34,
    "robbery_res": 46,
    "robbery_nonres": 24,
    "cash_transit_robbery": 1,
    "bank_robbery": 0.4,
    "truck_hijacking": 3,
    # Subcategories of sexual offences; sexual_offences is their sum.
    "rape": 46,
    "sexual_assault": 12,
    "attempted_sexoff": 5,
    "contact_sexoff": 3,
}

AGGR_ROBBERY_PARTS = [
    "carjacking",
    "robbery_res",
    "robbery_nonres",
    "cash_transit_robbery",
    "bank_robbery",
    "truck_hijacking",
]
SEXUAL_OFFENCE_PARTS = ["rape", "sexual_assault", "attempted_sexoff", "contact_sexoff"]


def unit(*parts: object) -> float:
    """Deterministic value in [0, 1) derived from the given parts."""
    material = "|".join(str(p) for p in parts)
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) / 0x100000000


def count_for(station: str, size: float, year: int, column: str) -> Optional[int]:
    """Deterministic count for one station, year and category.

    Deliberately includes cases the interface must handle correctly:
      * a category the source does not report for one station (NULL, not zero)
      * a category that is zero for several years and then recorded (the "newly recorded" state)
      * very small counts, so small-base percentage rules are exercised
    """
    base = BASE_RATES.get(column, 10) * size

    # One station has no commercial crime figures at all, to exercise missing-value handling.
    if column == "commercial_crime" and station == "DEMO Stellenkloof":
        return None

    # One station is missing a single year, to exercise a gap in a series.
    if column == "vehicle_theft" and station == "DEMO Polokwane South" and year == 2019:
        return None

    # Truck hijacking starts at zero for this station and then appears, producing the
    # "Newly recorded" state rather than an infinite percentage.
    if column == "truck_hijacking" and station == "DEMO Kimberley East":
        return 0 if year < 2022 else 2 + int(unit(station, year, column) * 3)

    years_elapsed = year - FIRST_YEAR
    # A gentle per-station, per-category drift so trends differ across the fixture.
    drift_direction = 1.0 if unit(station, column, "drift") > 0.45 else -1.0
    drift = 1.0 + drift_direction * 0.02 * years_elapsed
    wobble = 0.88 + 0.24 * unit(station, year, column)

    value = base * drift * wobble
    if value < 1:
        # Small categories round to a small whole number, sometimes zero.
        return 1 if unit(station, year, column, "tiny") > 0.6 else 0
    return int(round(value))


def build_rows() -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []

    for station, local, district, latitude, longitude, size in FIXTURE_STATIONS:
        for year in range(FIRST_YEAR, LAST_YEAR + 1):
            row: Dict[str, object] = {
                "year": "{0}-{1}".format(year, year + 1),
                "station": station,
                "loc_mn": local,
                "dc_mn": district,
                "latitude": latitude,
                "longitude": longitude,
            }

            for column in BASE_RATES:
                value = count_for(station, size, year, column)
                row[column] = "" if value is None else value

            # Published totals must equal the sum of their subcategories, matching how SAPS
            # reports them. The pipeline's consistency checks verify this.
            row["aggr_robbery"] = sum(int(row[part] or 0) for part in AGGR_ROBBERY_PARTS)
            row["sexual_offences"] = sum(int(row[part] or 0) for part in SEXUAL_OFFENCE_PARTS)

            rows.append(row)

    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the synthetic development fixture.")
    parser.add_argument(
        "--output",
        default=str(config.FIXTURE_DIR / "dev-fixture.csv"),
        help="Destination CSV path.",
    )
    args = parser.parse_args()

    columns = all_source_columns()
    rows = build_rows()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column, "") for column in columns})

    print("Wrote {0} synthetic rows to {1}".format(len(rows), output))
    print("These are NOT real crime figures. Every station name is prefixed DEMO.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
