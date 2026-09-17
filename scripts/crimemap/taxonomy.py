"""Loads the shared crime taxonomy and source schema definitions.

Both this module and src/lib/crime/taxonomy.ts read the same JSON files, so the pipeline and
the application can never disagree about which source column belongs to which group, or which
columns are totals that already contain other columns.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, List, Optional, Sequence

from . import config


@dataclass(frozen=True)
class Category:
    name: str
    label: str
    short_label: str
    source_label: str
    group: str
    role: str
    parent: Optional[str]


@dataclass(frozen=True)
class ConsistencyCheck:
    id: str
    total: str
    parts: Sequence[str]
    severity: str
    description: str
    #: "equals" requires total == sum(parts); "contains" requires total >= sum(parts), which is
    #: correct when the listed parts are only some of the parent's subcategories.
    mode: str = "equals"
    #: When set, the check is skipped for financial years starting before this year, because the
    #: source does not maintain the relationship in earlier years.
    applies_from_financial_year_start: Optional[int] = None


@lru_cache(maxsize=1)
def _taxonomy() -> Dict:
    with config.TAXONOMY_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def _source_schema() -> Dict:
    with config.SOURCE_SCHEMA_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def categories() -> List[Category]:
    return [
        Category(
            name=item["name"],
            label=item["label"],
            short_label=item["short_label"],
            source_label=item["source_label"],
            group=item["group"],
            role=item["role"],
            parent=item.get("parent"),
        )
        for item in _taxonomy()["categories"]
    ]


def offence_columns() -> List[str]:
    """Every offence column, in taxonomy order."""
    return [c.name for c in categories()]


def source_offence_variables() -> List[str]:
    """Offence variables as listed in the source dataset schema."""
    return list(_source_schema()["offence_variables"])


def identifier_variables() -> List[Dict]:
    return list(_source_schema()["identifier_variables"])


def geography_variables() -> List[Dict]:
    return list(_source_schema()["geography_variables"])


def required_source_columns() -> List[str]:
    """Source columns that must be present for a file to be usable at all."""
    return [v["name"] for v in identifier_variables() if v.get("required")]


def all_source_columns() -> List[str]:
    return (
        [v["name"] for v in identifier_variables()]
        + [v["name"] for v in geography_variables()]
        + source_offence_variables()
    )


def headline_community_columns() -> List[str]:
    """The 17 community-reported serious crimes."""
    return [
        c.name
        for c in categories()
        if c.role == "headline" and c.group not in ("police_action", "unclassified")
    ]


def consistency_checks() -> List[ConsistencyCheck]:
    return [
        ConsistencyCheck(
            id=item["id"],
            total=item["total"],
            parts=tuple(item["parts"]),
            severity=item["severity"],
            description=item["description"],
            mode=item.get("mode", "equals"),
            applies_from_financial_year_start=item.get("applies_from_financial_year_start"),
        )
        for item in _taxonomy()["consistency_checks"]
    ]


def dataset_metadata() -> Dict:
    return dict(_source_schema()["dataset"])
