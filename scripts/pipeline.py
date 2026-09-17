"""CrimeMap SA data pipeline.

    Raw source
        -> schema validation      (ingest)
        -> data cleaning          (transform)
        -> station normalisation  (transform)
        -> crime category mapping (transform)
        -> geographic validation  (validate)
        -> duplicate validation   (validate)
        -> derived metrics        (computed in SQL views and src/lib/metrics, not stored here)
        -> database load          (seed)

Usage:
    python scripts/pipeline.py                    # ingest, validate and load
    python scripts/pipeline.py --validate-only    # report without touching the database
    python scripts/pipeline.py --emit-sql         # write data/output/seed.sql instead of loading
    python scripts/pipeline.py --input path/to/file.dta

The pipeline is repeatable: identifiers are derived from source values and all writes are
upserts, so running it twice updates rows rather than creating duplicates.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from crimemap import config  # noqa: E402
from crimemap.reporting import ValidationReport  # noqa: E402
from ingest.run import find_source_file, ingest  # noqa: E402
from seed.run import (  # noqa: E402
    contains_synthetic_stations,
    emit_sql,
    load_over_rest,
    purge_synthetic_stations,
)
from transform.run import transform  # noqa: E402
from validate.run import validate  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the CrimeMap SA data pipeline.")
    parser.add_argument("--input", help="Source file path. Defaults to the newest file in data/raw.")
    parser.add_argument("--validate-only", action="store_true", help="Report only; do not load.")
    parser.add_argument("--emit-sql", action="store_true", help="Write SQL instead of loading.")
    parser.add_argument("--sql-filename", default="seed.sql")
    parser.add_argument("--allow-errors", action="store_true")
    parser.add_argument(
        "--keep-synthetic",
        action="store_true",
        help="Keep development fixture rows already in the database. By default a real load "
        "removes them so demo figures cannot sit alongside genuine data.",
    )
    args = parser.parse_args()

    report = ValidationReport()

    path = find_source_file(args.input)
    print("Source file       {0}".format(path))

    data = ingest(path, report)
    print("Rows read         {0}".format(len(data.rows)))
    is_synthetic = data.is_synthetic
    if is_synthetic:
        print("\n" + "!" * 72)
        print("SYNTHETIC DEVELOPMENT FIXTURE - these are not real crime figures.")
        print("Place the real DataFirst file in data/raw/ to load actual data.")
        print("!" * 72 + "\n")

    result = transform(data.rows, report)
    print("Stations          {0}".format(len(result.stations)))
    print("Records           {0}".format(len(result.records)))

    # A fixture copied outside data/fixtures is still fixture data. Detecting the DEMO station
    # prefix as well as the path means synthetic figures can never be recorded as real.
    if not is_synthetic and contains_synthetic_stations(result.stations):
        is_synthetic = True
        print("Detected DEMO station names: this load is being recorded as synthetic.")

    validate(result.stations, result.records, report)

    report_path = report.write()
    report.print_summary()
    print("\nReport written to {0}".format(report_path))

    if args.validate_only:
        return 1 if report.has_errors else 0

    if report.has_errors and not args.allow_errors:
        print(
            "\nLoad stopped: validation reported {0} error(s). Nothing was written. Review the "
            "report, then re-run with --allow-errors if the rejected rows are understood.".format(
                len(report.errors)
            )
        )
        return 1

    years = sorted({record.financial_year for record in result.records})
    earliest = years[0] if years else None
    latest = years[-1] if years else None
    relative_input = (
        str(path.relative_to(config.REPO_ROOT)) if config.REPO_ROOT in path.parents else str(path)
    )

    if args.emit_sql:
        sql_path = emit_sql(
            stations=result.stations,
            records=result.records,
            report=report,
            input_file=relative_input,
            input_sha256=data.sha256,
            is_synthetic=is_synthetic,
            earliest_period=earliest,
            latest_period=latest,
            filename=args.sql_filename,
        )
        print("SQL written to {0}".format(sql_path))
        return 0

    if not is_synthetic and not args.keep_synthetic:
        removed = purge_synthetic_stations()
        if removed:
            print("Removed {0} development fixture station(s) before loading real data.".format(removed))

    load_over_rest(
        stations=result.stations,
        records=result.records,
        report=report,
        input_file=relative_input,
        input_sha256=data.sha256,
        is_synthetic=is_synthetic,
        earliest_period=earliest,
        latest_period=latest,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
