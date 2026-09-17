"""Stage 4 - load.

Writes stations and crime records into Supabase using deterministic upserts, so running the
pipeline twice updates the same rows instead of creating duplicates.

Two modes:
  default      write over the Supabase REST API using SUPABASE_SERVICE_ROLE_KEY
  --emit-sql   write an idempotent .sql file instead, for environments where the service role
               key is not available to this process

The load refuses to proceed when validation produced errors, unless --allow-errors is passed,
so a file with rejected rows cannot be loaded unnoticed.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from crimemap import config  # noqa: E402
from crimemap.reporting import ValidationReport  # noqa: E402
from crimemap.taxonomy import dataset_metadata, offence_columns  # noqa: E402

RECORD_COLUMNS = [
    "financial_year",
    "financial_year_source",
    "financial_year_start",
    "raw_source_id",
] + sorted(offence_columns())


def _sql_literal(value: object) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


#: Station names beginning with this word are development fixture data. Detecting it by name as
#: well as by file path means a fixture copied elsewhere still cannot be loaded as if it were real.
SYNTHETIC_NAME_PREFIX = "DEMO"


def contains_synthetic_stations(stations: Sequence["StationRow"]) -> bool:  # type: ignore[name-defined]
    return any(
        str(station.station_name).upper().startswith(SYNTHETIC_NAME_PREFIX)
        for station in stations
    )


def purge_synthetic_stations() -> int:
    """Remove development fixture stations and their records.

    Called before a real load so demo rows cannot survive alongside genuine data. Crime records
    are removed by the cascade on police_stations.
    """
    from crimemap.supabase_client import SupabaseWriter

    writer = SupabaseWriter()
    existing = writer.select(
        "police_stations",
        columns="id,station_slug,station_name",
        params={"station_name": "like.{0}*".format(SYNTHETIC_NAME_PREFIX)},
    )
    if not existing:
        return 0

    writer.session.delete(
        "{0}/rest/v1/police_stations".format(writer.url),
        params={"station_name": "like.{0}*".format(SYNTHETIC_NAME_PREFIX)},
        headers={"Prefer": "return=minimal"},
        timeout=120,
    )
    return len(existing)


def data_source_payload(*, is_synthetic: bool) -> Dict[str, object]:
    metadata = dataset_metadata()
    return {
        "source_key": config.SOURCE_KEY,
        "organisation": metadata["producer"],
        "distributor": metadata["distributor"],
        "dataset_name": metadata["title"],
        "dataset_version": metadata["version"],
        "dataset_url": metadata["catalogue_url"],
        "doi": metadata["doi"],
        "licence": metadata["licence"],
        "unit_of_observation": metadata["unit_of_observation"],
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "earliest_period": None,
        "latest_period": None,
    }


def load_over_rest(
    *,
    stations: Sequence["StationRow"],  # type: ignore[name-defined]
    records: Sequence["CrimeRecordRow"],  # type: ignore[name-defined]
    report: ValidationReport,
    input_file: str,
    input_sha256: str,
    is_synthetic: bool,
    earliest_period: Optional[str],
    latest_period: Optional[str],
) -> None:
    from crimemap.supabase_client import SupabaseWriter

    writer = SupabaseWriter()
    metadata = dataset_metadata()

    source = data_source_payload(is_synthetic=is_synthetic)
    source["earliest_period"] = earliest_period
    source["latest_period"] = latest_period
    writer.upsert("data_sources", [source], on_conflict="source_key")

    run_id = writer.start_ingest_run(
        source_key=config.SOURCE_KEY,
        dataset_version=metadata["version"],
        input_file=input_file,
        input_sha256=input_sha256,
        is_synthetic=is_synthetic,
        notes="Synthetic development fixture. Not real crime data."
        if is_synthetic
        else None,
    )

    try:
        writer.upsert(
            "police_stations",
            [station.to_payload() for station in stations],
            on_conflict="station_slug",
        )

        station_ids = writer.station_ids_by_slug()

        payloads: List[Dict[str, object]] = []
        for record in records:
            station_id = station_ids.get(record.station_slug)
            if station_id is None:
                continue
            payload = record.to_payload(station_id)
            payload["ingest_run_id"] = run_id
            payloads.append(payload)

        writer.upsert(
            "crime_records",
            payloads,
            on_conflict="station_id,financial_year",
        )

        if report.findings:
            writer.insert(
                "validation_warnings",
                [
                    {
                        "ingest_run_id": run_id,
                        "severity": finding.severity,
                        "check_id": finding.check_id,
                        "station_name": finding.station_name,
                        "financial_year": finding.financial_year,
                        "column_name": finding.column_name,
                        "observed_value": finding.observed_value,
                        "expected_value": finding.expected_value,
                        "message": finding.message,
                    }
                    for finding in report.findings
                ],
            )

        writer.finish_ingest_run(
            run_id,
            status="succeeded",
            rows_read=int(report.counts.get("source_rows_read", 0)),
            stations_upserted=len(stations),
            records_upserted=len(payloads),
            error_count=len(report.errors),
            warning_count=len(report.warnings),
        )
        print("Loaded {0} stations and {1} records.".format(len(stations), len(payloads)))

    except Exception as exc:  # noqa: BLE001 - the run must be marked failed before re-raising
        writer.finish_ingest_run(
            run_id,
            status="failed",
            rows_read=int(report.counts.get("source_rows_read", 0)),
            stations_upserted=0,
            records_upserted=0,
            error_count=len(report.errors) + 1,
            warning_count=len(report.warnings),
            notes=str(exc)[:500],
        )
        raise


def emit_sql(
    *,
    stations: Sequence["StationRow"],  # type: ignore[name-defined]
    records: Sequence["CrimeRecordRow"],  # type: ignore[name-defined]
    report: ValidationReport,
    input_file: str,
    input_sha256: str,
    is_synthetic: bool,
    earliest_period: Optional[str],
    latest_period: Optional[str],
    filename: str,
) -> Path:
    metadata = dataset_metadata()
    lines: List[str] = []

    lines.append("-- Generated by scripts/seed/run.py --emit-sql. Idempotent: safe to re-run.")
    lines.append("-- Source file: {0}".format(input_file))
    lines.append("-- SHA-256: {0}".format(input_sha256))
    if is_synthetic:
        lines.append("-- SYNTHETIC DEVELOPMENT FIXTURE. These are not real crime figures.")
    lines.append("begin;")

    source = data_source_payload(is_synthetic=is_synthetic)
    source["earliest_period"] = earliest_period
    source["latest_period"] = latest_period
    source_columns = list(source.keys())
    lines.append(
        "insert into data_sources ({0}) values ({1})\non conflict (source_key) do update set {2};".format(
            ", ".join(source_columns),
            ", ".join(_sql_literal(source[c]) for c in source_columns),
            ", ".join(
                "{0} = excluded.{0}".format(c) for c in source_columns if c != "source_key"
            ),
        )
    )

    lines.append(
        "insert into ingest_runs (source_key, dataset_version, input_file, input_sha256, status, "
        "is_synthetic, rows_read, stations_upserted, records_upserted, error_count, warning_count, "
        "finished_at, notes) values ({0}, {1}, {2}, {3}, 'succeeded', {4}, {5}, {6}, {7}, {8}, {9}, "
        "now(), {10});".format(
            _sql_literal(config.SOURCE_KEY),
            _sql_literal(metadata["version"]),
            _sql_literal(input_file),
            _sql_literal(input_sha256),
            _sql_literal(is_synthetic),
            len(records) and int(report.counts.get("source_rows_read", 0)),
            len(stations),
            len(records),
            len(report.errors),
            len(report.warnings),
            _sql_literal(
                "Synthetic development fixture. Not real crime data."
                if is_synthetic
                else "Loaded from emitted SQL."
            ),
        )
    )

    station_columns = [
        "station_slug",
        "station_name",
        "district_municipality",
        "local_municipality",
        "province_code",
        "province_name",
        "province_slug",
        "latitude",
        "longitude",
    ]
    station_values = ",\n".join(
        "({0})".format(
            ", ".join(_sql_literal(station.to_payload()[column]) for column in station_columns)
        )
        for station in stations
    )
    lines.append(
        "insert into police_stations ({0}) values\n{1}\non conflict (station_slug) do update set {2};".format(
            ", ".join(station_columns),
            station_values,
            ", ".join(
                "{0} = excluded.{0}".format(c) for c in station_columns if c != "station_slug"
            ),
        )
    )

    value_columns = ["station_slug"] + RECORD_COLUMNS
    record_values = ",\n".join(
        "({0})".format(
            ", ".join(
                [_sql_literal(record.station_slug)]
                + [
                    _sql_literal(
                        getattr(record, column)
                        if column in {"financial_year", "financial_year_source", "financial_year_start", "raw_source_id"}
                        else record.counts.get(column)
                    )
                    for column in RECORD_COLUMNS
                ]
            )
        )
        for record in records
    )

    lines.append(
        "insert into crime_records (station_id, {0}, ingest_run_id)\n"
        "select s.id, {1}, (select max(id) from ingest_runs)\n"
        "from (values\n{2}\n) as v({3})\n"
        "join police_stations s on s.station_slug = v.station_slug\n"
        "on conflict (station_id, financial_year) do update set {4};".format(
            ", ".join(RECORD_COLUMNS),
            ", ".join("v.{0}".format(c) for c in RECORD_COLUMNS),
            record_values,
            ", ".join(value_columns),
            ", ".join("{0} = excluded.{0}".format(c) for c in RECORD_COLUMNS),
        )
    )

    lines.append("commit;")

    output_dir = config.ensure_output_dir()
    path = output_dir / filename
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def main() -> int:
    from ingest.run import find_source_file, ingest  # type: ignore[import-not-found]
    from transform.run import transform  # type: ignore[import-not-found]
    from validate.run import validate  # type: ignore[import-not-found]

    parser = argparse.ArgumentParser(description="Load the source dataset into Supabase.")
    parser.add_argument("--input")
    parser.add_argument(
        "--emit-sql",
        action="store_true",
        help="Write an idempotent SQL file to data/output/ instead of writing over the REST API.",
    )
    parser.add_argument("--sql-filename", default="seed.sql")
    parser.add_argument(
        "--allow-errors",
        action="store_true",
        help="Load even though validation reported errors. Rejected rows are still excluded.",
    )
    args = parser.parse_args()

    report = ValidationReport()
    path = find_source_file(args.input)
    data = ingest(path, report)
    result = transform(data.rows, report)
    validate(result.stations, result.records, report)

    years = sorted({record.financial_year for record in result.records})
    earliest = years[0] if years else None
    latest = years[-1] if years else None

    report_path = report.write()
    report.print_summary()
    print("\nReport written to {0}".format(report_path))

    if report.has_errors and not args.allow_errors:
        print(
            "\nLoad stopped: validation reported {0} error(s). Review the report above, then "
            "re-run with --allow-errors if the rejected rows are understood.".format(
                len(report.errors)
            )
        )
        return 1

    relative_input = str(path.relative_to(config.REPO_ROOT)) if config.REPO_ROOT in path.parents else str(path)

    if args.emit_sql:
        sql_path = emit_sql(
            stations=result.stations,
            records=result.records,
            report=report,
            input_file=relative_input,
            input_sha256=data.sha256,
            is_synthetic=data.is_synthetic,
            earliest_period=earliest,
            latest_period=latest,
            filename=args.sql_filename,
        )
        print("SQL written to {0}".format(sql_path))
        return 0

    load_over_rest(
        stations=result.stations,
        records=result.records,
        report=report,
        input_file=relative_input,
        input_sha256=data.sha256,
        is_synthetic=data.is_synthetic,
        earliest_period=earliest,
        latest_period=latest,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
