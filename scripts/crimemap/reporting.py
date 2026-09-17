"""Validation findings and report output.

A finding never modifies the data. The original source value is recorded in observed_value so an
anomaly can be investigated against the source rather than silently corrected.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from . import config

ERROR = "error"
WARNING = "warning"
INFO = "info"


@dataclass
class Finding:
    severity: str
    check_id: str
    message: str
    station_name: Optional[str] = None
    financial_year: Optional[str] = None
    column_name: Optional[str] = None
    observed_value: Optional[str] = None
    expected_value: Optional[str] = None


@dataclass
class ValidationReport:
    findings: List[Finding] = field(default_factory=list)
    counts: Dict[str, int] = field(default_factory=dict)

    def add(
        self,
        severity: str,
        check_id: str,
        message: str,
        *,
        station_name: Optional[str] = None,
        financial_year: Optional[str] = None,
        column_name: Optional[str] = None,
        observed_value: object = None,
        expected_value: object = None,
    ) -> None:
        self.findings.append(
            Finding(
                severity=severity,
                check_id=check_id,
                message=message,
                station_name=station_name,
                financial_year=financial_year,
                column_name=column_name,
                observed_value=None if observed_value is None else str(observed_value),
                expected_value=None if expected_value is None else str(expected_value),
            )
        )

    @property
    def errors(self) -> List[Finding]:
        return [f for f in self.findings if f.severity == ERROR]

    @property
    def warnings(self) -> List[Finding]:
        return [f for f in self.findings if f.severity == WARNING]

    @property
    def has_errors(self) -> bool:
        return any(f.severity == ERROR for f in self.findings)

    def summary_by_check(self) -> Dict[str, int]:
        summary: Dict[str, int] = {}
        for finding in self.findings:
            summary[finding.check_id] = summary.get(finding.check_id, 0) + 1
        return summary

    def write(self, name: str = "validation-report.json") -> Path:
        output_dir = config.ensure_output_dir()
        path = output_dir / name
        payload = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "counts": self.counts,
            "totals": {
                "findings": len(self.findings),
                "errors": len(self.errors),
                "warnings": len(self.warnings),
            },
            "by_check": self.summary_by_check(),
            "findings": [asdict(f) for f in self.findings],
        }
        with path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
        return path

    def print_summary(self) -> None:
        print("\nValidation summary")
        print("-" * 60)
        for key, value in self.counts.items():
            print("  {0:<34} {1}".format(key, value))
        print("  {0:<34} {1}".format("findings", len(self.findings)))
        print("  {0:<34} {1}".format("errors", len(self.errors)))
        print("  {0:<34} {1}".format("warnings", len(self.warnings)))

        by_check = self.summary_by_check()
        if by_check:
            print("\nBy check")
            print("-" * 60)
            for check_id, count in sorted(by_check.items(), key=lambda kv: (-kv[1], kv[0])):
                print("  {0:<34} {1}".format(check_id, count))

        for finding in self.errors[:10]:
            print("  ERROR  [{0}] {1}".format(finding.check_id, finding.message))
        if len(self.errors) > 10:
            print("  ... and {0} further errors".format(len(self.errors) - 10))
