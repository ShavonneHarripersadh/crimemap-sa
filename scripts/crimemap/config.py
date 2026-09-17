"""Paths and environment configuration for the CrimeMap SA pipeline."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[2]

DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
FIXTURE_DIR = DATA_DIR / "fixtures"
REFERENCE_DIR = DATA_DIR / "reference"
OUTPUT_DIR = DATA_DIR / "output"

SOURCE_SCHEMA_PATH = REFERENCE_DIR / "source_schema.json"
TAXONOMY_PATH = REFERENCE_DIR / "crime_taxonomy.json"
PROVINCE_LOOKUP_PATH = REFERENCE_DIR / "province_by_district.csv"

SOURCE_KEY = "datafirst-saps-annual-crime-records"


def load_env() -> None:
    """Load .env.local then .env, without overriding variables already set."""
    try:
        from dotenv import load_dotenv
    except ImportError:  # pragma: no cover - dotenv is declared in requirements.txt
        return

    for name in (".env.local", ".env"):
        path = REPO_ROOT / name
        if path.exists():
            load_dotenv(path, override=False)


def supabase_url() -> Optional[str]:
    load_env()
    value = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    return value or None


def supabase_service_role_key() -> Optional[str]:
    load_env()
    value = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    return value or None


def ensure_output_dir() -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    return OUTPUT_DIR
