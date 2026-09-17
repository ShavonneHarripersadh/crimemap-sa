"""Deterministic text helpers: slugs, financial years and district normalisation.

Every identifier the pipeline generates is a pure function of the source values, so running the
pipeline twice produces exactly the same identifiers and therefore updates rows rather than
duplicating them.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional, Tuple

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")
_DISTRICT_NOISE = re.compile(
    r"\b(district|metropolitan|metro|municipality|municipalities|local|dm|dc|mm|lm)\b"
)


def strip_accents(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def slugify(value: str) -> str:
    """Lowercase, accent-free, hyphen-separated slug used in URLs."""
    cleaned = strip_accents(str(value)).lower()
    cleaned = _SLUG_STRIP.sub("-", cleaned)
    return cleaned.strip("-")


def normalise_place(value: Optional[str]) -> str:
    """Normalise a place name for matching: accent-free, lowercase, single spaces."""
    if value is None:
        return ""
    cleaned = strip_accents(str(value)).lower()
    cleaned = re.sub(r"[^a-z0-9\s]", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def normalise_district(value: Optional[str]) -> str:
    """Normalise a district name by also dropping administrative noise words.

    "City of Johannesburg Metropolitan Municipality" and "City of Johannesburg" both reduce to
    "city of johannesburg", so the province lookup matches either spelling.
    """
    base = normalise_place(value)
    without_noise = _DISTRICT_NOISE.sub(" ", base)
    return re.sub(r"\s+", " ", without_noise).strip()


# Province and region tokens that appear inside station names as disambiguators, e.g.
# "heidelberg (gp)" and "hilton-kzn". They are upper-cased rather than title-cased.
_REGION_TOKENS = {
    "gp": "GP",
    "ec": "EC",
    "wc": "WC",
    "nc": "NC",
    "nw": "NW",
    "fs": "FS",
    "kzn": "KZN",
    "mp": "MP",
    "lp": "LP",
    "c": "C",
    "saps": "SAPS",
}


def display_station_name(value: str) -> str:
    """Derive a readable station name from the source's lower-case spelling.

    The source stores station names entirely in lower case, for example "king william's town"
    and "heidelberg(gp)". This produces "King William's Town" and "Heidelberg (GP)".

    This is presentation only. The exact source spelling is stored alongside it in
    police_stations.station_name_source so the original is never lost.
    """
    text = re.sub(r"\s+", " ", str(value).strip())
    # Give a bracketed qualifier its own space: "middelburg(ec)" -> "middelburg (ec)".
    text = re.sub(r"\s*\(\s*", " (", text)
    text = re.sub(r"\s*\)", ")", text)

    def cap_token(token: str) -> str:
        stripped = token.strip("()")
        lowered = stripped.lower()
        if lowered in _REGION_TOKENS:
            replacement = _REGION_TOKENS[lowered]
        elif "'" in stripped:
            # Capitalise the first letter only, so "william's" does not become "William'S".
            head, _, tail = stripped.partition("'")
            replacement = head.capitalize() + "'" + tail
        else:
            replacement = stripped.capitalize()
        return token.replace(stripped, replacement, 1) if stripped else token

    words = []
    for word in text.split(" "):
        # Hyphenated names capitalise each part: "bela-bela" -> "Bela-Bela".
        words.append("-".join(cap_token(part) for part in word.split("-")))

    return " ".join(words)


def canonical_financial_year(value: object) -> Tuple[Optional[str], Optional[int]]:
    """Convert a source financial-year value to canonical form.

    Returns (label, start_year), for example ("2024/25", 2024). Returns (None, None) when the
    value cannot be parsed, so the caller records a validation error instead of guessing.

    Accepted source spellings:
        2024/2025, 2024-2025, 2024/25, 2024_2025, 2024 (start year alone), 20242025
    """
    if value is None:
        return None, None

    text = strip_accents(str(value)).strip()
    if not text:
        return None, None

    # Two explicit years separated by any non-digit run, e.g. 2024/2025 or 2024-2025.
    match = re.fullmatch(r"(\d{4})\D+(\d{4})", text)
    if match:
        start = int(match.group(1))
        end = int(match.group(2))
        if end == start + 1:
            return _label(start), start
        return None, None

    # Four-digit start with two-digit end, e.g. 2024/25.
    match = re.fullmatch(r"(\d{4})\D+(\d{2})", text)
    if match:
        start = int(match.group(1))
        if (start + 1) % 100 == int(match.group(2)):
            return _label(start), start
        return None, None

    # Eight digits, e.g. 20242025.
    match = re.fullmatch(r"(\d{4})(\d{4})", text)
    if match:
        start = int(match.group(1))
        if int(match.group(2)) == start + 1:
            return _label(start), start
        return None, None

    # Start year alone.
    match = re.fullmatch(r"(\d{4})", text)
    if match:
        start = int(match.group(1))
        return _label(start), start

    return None, None


def _label(start_year: int) -> str:
    return "{0}/{1:02d}".format(start_year, (start_year + 1) % 100)
