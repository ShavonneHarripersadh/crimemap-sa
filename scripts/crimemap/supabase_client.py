"""Minimal Supabase REST writer for the pipeline.

Uses the service role key, which is read from the environment and never written to disk or
logged. All writes are upserts keyed on a deterministic natural key, so running the pipeline
twice updates rows instead of creating duplicates.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Sequence

import requests

from . import config

BATCH_SIZE = 500
TIMEOUT_SECONDS = 120


class SupabaseError(RuntimeError):
    pass


class SupabaseWriter:
    def __init__(self, url: Optional[str] = None, service_role_key: Optional[str] = None):
        self.url = (url or config.supabase_url() or "").rstrip("/")
        self.key = service_role_key or config.supabase_service_role_key() or ""

        if not self.url:
            raise SupabaseError(
                "NEXT_PUBLIC_SUPABASE_URL is not set. Copy .env.example to .env.local and fill it in."
            )
        if not self.key:
            raise SupabaseError(
                "SUPABASE_SERVICE_ROLE_KEY is not set. Copy it from the Supabase dashboard "
                "(Project Settings -> API keys -> service_role) into .env.local. "
                "It must never be committed or exposed to the browser."
            )

        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": self.key,
                "Authorization": "Bearer {0}".format(self.key),
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )

    # --- low level ---------------------------------------------------------

    def _rest(self, path: str) -> str:
        return "{0}/rest/v1/{1}".format(self.url, path.lstrip("/"))

    def _check(self, response: requests.Response, context: str) -> None:
        if response.status_code >= 400:
            raise SupabaseError(
                "{0} failed with HTTP {1}: {2}".format(context, response.status_code, response.text)
            )

    def select(
        self,
        table: str,
        columns: str = "*",
        params: Optional[Dict[str, str]] = None,
    ) -> List[Dict]:
        query: Dict[str, str] = {"select": columns}
        if params:
            query.update(params)
        response = self.session.get(self._rest(table), params=query, timeout=TIMEOUT_SECONDS)
        self._check(response, "select from {0}".format(table))
        return response.json()

    def upsert(
        self,
        table: str,
        rows: Sequence[Dict],
        on_conflict: str,
        returning: str = "minimal",
    ) -> List[Dict]:
        """Insert or update rows, resolving conflicts on the given key."""
        results: List[Dict] = []

        for batch in _chunks(rows, BATCH_SIZE):
            headers = {
                "Prefer": "resolution=merge-duplicates,return={0}".format(returning),
            }
            response = self.session.post(
                self._rest(table),
                params={"on_conflict": on_conflict},
                json=list(batch),
                headers=headers,
                timeout=TIMEOUT_SECONDS,
            )
            self._check(response, "upsert into {0}".format(table))
            if returning != "minimal" and response.text.strip():
                results.extend(response.json())

        return results

    def insert(self, table: str, rows: Sequence[Dict], returning: str = "minimal") -> List[Dict]:
        results: List[Dict] = []

        for batch in _chunks(rows, BATCH_SIZE):
            response = self.session.post(
                self._rest(table),
                json=list(batch),
                headers={"Prefer": "return={0}".format(returning)},
                timeout=TIMEOUT_SECONDS,
            )
            self._check(response, "insert into {0}".format(table))
            if returning != "minimal" and response.text.strip():
                results.extend(response.json())

        return results

    def update(self, table: str, values: Dict, params: Dict[str, str]) -> None:
        response = self.session.patch(
            self._rest(table),
            params=params,
            json=values,
            headers={"Prefer": "return=minimal"},
            timeout=TIMEOUT_SECONDS,
        )
        self._check(response, "update {0}".format(table))

    def rpc(self, name: str, params: Optional[Dict] = None) -> object:
        response = self.session.post(
            "{0}/rest/v1/rpc/{1}".format(self.url, name),
            json=params or {},
            timeout=TIMEOUT_SECONDS,
        )
        self._check(response, "rpc {0}".format(name))
        return response.json()

    # --- pipeline specific -------------------------------------------------

    def start_ingest_run(
        self,
        *,
        source_key: str,
        dataset_version: Optional[str],
        input_file: str,
        input_sha256: Optional[str],
        is_synthetic: bool,
        notes: Optional[str] = None,
    ) -> int:
        rows = self.insert(
            "ingest_runs",
            [
                {
                    "source_key": source_key,
                    "dataset_version": dataset_version,
                    "input_file": input_file,
                    "input_sha256": input_sha256,
                    "status": "running",
                    "is_synthetic": is_synthetic,
                    "notes": notes,
                }
            ],
            returning="representation",
        )
        if not rows:
            raise SupabaseError("Could not create an ingest_runs row.")
        return int(rows[0]["id"])

    def finish_ingest_run(
        self,
        run_id: int,
        *,
        status: str,
        rows_read: int,
        stations_upserted: int,
        records_upserted: int,
        error_count: int,
        warning_count: int,
        notes: Optional[str] = None,
    ) -> None:
        values: Dict[str, object] = {
            "status": status,
            "rows_read": rows_read,
            "stations_upserted": stations_upserted,
            "records_upserted": records_upserted,
            "error_count": error_count,
            "warning_count": warning_count,
            "finished_at": "now()",
        }
        if notes is not None:
            values["notes"] = notes

        self.update("ingest_runs", values, {"id": "eq.{0}".format(run_id)})

    def station_ids_by_slug(self) -> Dict[str, int]:
        mapping: Dict[str, int] = {}
        offset = 0
        page_size = 1000

        while True:
            rows = self.select(
                "police_stations",
                columns="id,station_slug",
                params={
                    "order": "id.asc",
                    "limit": str(page_size),
                    "offset": str(offset),
                },
            )
            if not rows:
                break
            for row in rows:
                mapping[row["station_slug"]] = int(row["id"])
            if len(rows) < page_size:
                break
            offset += page_size

        return mapping


def _chunks(items: Sequence[Dict], size: int) -> Iterable[Sequence[Dict]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]
