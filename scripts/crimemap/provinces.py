"""Province derivation.

The source dataset has no province variable. Province is derived from the district municipality
using data/reference/province_by_district.csv, and this derivation is disclosed on /methodology.

A district that does not match the lookup table is never guessed: province is left empty and the
caller records a validation warning naming the unmatched district, so the fix is to add the
spelling to the reference file.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, Optional

from . import config
from .text import normalise_district


@dataclass(frozen=True)
class Province:
    code: str
    name: str
    slug: str


@lru_cache(maxsize=1)
def _lookup() -> Dict[str, Province]:
    table: Dict[str, Province] = {}

    with config.PROVINCE_LOOKUP_PATH.open(encoding="utf-8") as handle:
        rows = [line for line in handle if not line.lstrip().startswith("#")]

    for row in csv.DictReader(rows):
        district = (row.get("district_value") or "").strip()
        if not district:
            continue
        key = normalise_district(district)
        if not key:
            continue
        table[key] = Province(
            code=(row.get("province_code") or "").strip(),
            name=(row.get("province_name") or "").strip(),
            slug=(row.get("province_slug") or "").strip(),
        )

    return table


def province_for_district(district: Optional[str]) -> Optional[Province]:
    """Look up a province, or None when the district is missing or unrecognised."""
    key = normalise_district(district)
    if not key:
        return None
    return _lookup().get(key)


def known_district_count() -> int:
    return len(_lookup())
