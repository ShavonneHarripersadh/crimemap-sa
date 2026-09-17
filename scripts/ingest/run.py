"""Stage 1 - ingest.

Reads the source file exactly as distributed and hands on raw string values. Nothing is cleaned,
coerced or dropped here; that happens in later stages so that every change to a source value is
traceable to a named step.

Supported formats: .csv and .tab (standard library), .dta and .xlsx (via pandas, imported only
when needed so a CSV run has no third-party dependency).
"""

from __future__ import annotations

import csv
import hashlib
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from crimemap import config  # noqa: E402
from crimemap.reporting import ERROR, INFO, WARNING, ValidationReport  # noqa: E402
from crimemap.taxonomy import all_source_columns, required_source_columns  # noqa: E402

CSV_SUFFIXES = {".csv", ".tab", ".tsv", ".txt"}
PANDAS_SUFFIXES = {".dta", ".xlsx", ".xls", ".sav"}


@dataclass
class SourceData:
    rows: List[Dict[str, Optional[str]]]
    columns: List[str]
    path: Path
    sha256: str
    is_synthetic: bool
    unexpected_columns: List[str] = field(default_factory=list)
    missing_columns: List[str] = field(default_factory=list)


def find_source_file(explicit: Optional[str] = None) -> Path:
    """Locate the source file.

    Preference order: an explicit path, then the newest readable file in data/raw, then the
    development fixture. The fixture is only ever used when data/raw is empty.
    """
    if explicit:
        path = Path(explicit).expanduser()
        if not path.is_absolute():
            path = (config.REPO_ROOT / path).resolve()
        if not path.exists():
            raise FileNotFoundError("Source file not found: {0}".format(path))
        return path

    candidates: List[Path] = []
    if config.RAW_DIR.exists():
        for item in sorted(config.RAW_DIR.iterdir()):
            if item.is_file() and item.suffix.lower() in CSV_SUFFIXES | PANDAS_SUFFIXES:
                candidates.append(item)

    if candidates:
        return max(candidates, key=lambda p: p.stat().st_mtime)

    fixture = config.FIXTURE_DIR / "dev-fixture.csv"
    if fixture.exists():
        return fixture

    raise FileNotFoundError(
        "No source file found.\n"
        "  Download the SAPS Annual Crime Records from DataFirst\n"
        "  (https://datafirst.uct.ac.za/dataportal/index.php/catalog/1012) and place the\n"
        "  data file in data/raw/, or generate the development fixture with:\n"
        "    python scripts/seed/make_fixture.py"
    )


def is_fixture(path: Path) -> bool:
    return config.FIXTURE_DIR in path.parents or path.name.startswith("dev-fixture")


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def _normalise_header(name: str) -> str:
    return str(name).strip().lstrip("\ufeff").lower()


def _read_delimited(path: Path) -> tuple[List[Dict[str, Optional[str]]], List[str]]:
    delimiter = "\t" if path.suffix.lower() in {".tab", ".tsv"} else ","

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle, delimiter=delimiter)
        try:
            header = next(reader)
        except StopIteration:
            return [], []

        columns = [_normalise_header(h) for h in header]
        rows: List[Dict[str, Optional[str]]] = []

        for values in reader:
            if not any(str(v).strip() for v in values):
                continue
            row: Dict[str, Optional[str]] = {}
            for index, column in enumerate(columns):
                raw = values[index] if index < len(values) else None
                row[column] = None if raw is None else str(raw)
            rows.append(row)

    return rows, columns


def _read_with_pandas(path: Path) -> tuple[List[Dict[str, Optional[str]]], List[str]]:
    try:
        import pandas as pd
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "Reading {0} requires pandas. Install the pipeline dependencies:\n"
            "  pip install -r scripts/requirements.txt".format(path.suffix)
        ) from exc

    suffix = path.suffix.lower()
    if suffix == ".dta":
        frame = pd.read_stata(path, convert_categoricals=False)
    elif suffix in {".xlsx", ".xls"}:
        frame = pd.read_excel(path)
    else:
        raise SystemExit("Unsupported source format: {0}".format(suffix))

    frame.columns = [_normalise_header(c) for c in frame.columns]
    columns = list(frame.columns)

    rows: List[Dict[str, Optional[str]]] = []
    for record in frame.to_dict(orient="records"):
        row: Dict[str, Optional[str]] = {}
        for column in columns:
            value = record.get(column)
            if value is None or (isinstance(value, float) and value != value):  # NaN
                row[column] = None
            else:
                row[column] = str(value)
        rows.append(row)

    return rows, columns


def ingest(path: Path, report: ValidationReport) -> SourceData:
    suffix = path.suffix.lower()

    if suffix in CSV_SUFFIXES:
        rows, columns = _read_delimited(path)
    elif suffix in PANDAS_SUFFIXES:
        rows, columns = _read_with_pandas(path)
    else:
        raise SystemExit("Unsupported source format: {0}".format(suffix))

    expected = all_source_columns()
    missing = [c for c in expected if c not in columns]
    unexpected = [c for c in columns if c not in expected]

    for column in required_source_columns():
        if column not in columns:
            report.add(
                ERROR,
                "schema.required_column_missing",
                "Required source column '{0}' is not present in {1}.".format(column, path.name),
                column_name=column,
            )

    for column in missing:
        if column in required_source_columns():
            continue
        report.add(
            WARNING,
            "schema.expected_column_missing",
            "Source column '{0}' from the documented schema is not present in this file. "
            "Values for it will be recorded as not available.".format(column),
            column_name=column,
        )

    for column in unexpected:
        report.add(
            INFO,
            "schema.unexpected_column",
            "Column '{0}' is present in the file but not in the documented schema. It is "
            "ignored rather than loaded, so no undocumented field enters the database.".format(
                column
            ),
            column_name=column,
        )

    report.counts["source_rows_read"] = len(rows)
    report.counts["source_columns"] = len(columns)

    return SourceData(
        rows=rows,
        columns=columns,
        path=path,
        sha256=sha256_of(path),
        is_synthetic=is_fixture(path),
        unexpected_columns=unexpected,
        missing_columns=missing,
    )


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Read and describe the source dataset.")
    parser.add_argument("--input", help="Path to the source file. Defaults to the newest file in data/raw.")
    args = parser.parse_args()

    report = ValidationReport()
    path = find_source_file(args.input)
    data = ingest(path, report)

    print("Source file       {0}".format(data.path))
    print("SHA-256           {0}".format(data.sha256))
    print("Rows              {0}".format(len(data.rows)))
    print("Columns           {0}".format(len(data.columns)))
    print("Synthetic fixture {0}".format(data.is_synthetic))
    if data.missing_columns:
        print("Missing columns   {0}".format(", ".join(data.missing_columns)))
    if data.unexpected_columns:
        print("Extra columns     {0}".format(", ".join(data.unexpected_columns)))

    report.print_summary()
    return 1 if report.has_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
