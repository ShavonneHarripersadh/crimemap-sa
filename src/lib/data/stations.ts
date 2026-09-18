import "server-only";

import { ALL_CRIME_COLUMNS } from "@/lib/crime/taxonomy";
import { coerceSourceCount } from "@/lib/metrics/change";
import type { StationYearRecord } from "@/lib/metrics/profile";
import { getServerClient } from "@/lib/supabase/server";
import { fail, ok, NOT_CONFIGURED_MESSAGE, type DataResult } from "@/lib/data/result";

export interface Station {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly localMunicipality: string | null;
  readonly districtMunicipality: string | null;
  readonly provinceName: string | null;
  readonly provinceSlug: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface StationProfile {
  readonly station: Station;
  /** Oldest financial year first. */
  readonly records: readonly StationYearRecord[];
}

const STATION_COLUMNS =
  "id, station_slug, station_name, station_name_source, local_municipality, district_municipality, province_name, province_slug, latitude, longitude";

/* eslint-disable @typescript-eslint/no-explicit-any -- narrow, local shape mapping of query rows */

function toStation(row: any): Station {
  return {
    id: row.id as number,
    slug: row.station_slug as string,
    name: row.station_name as string,
    localMunicipality: (row.local_municipality as string | null) ?? null,
    districtMunicipality: (row.district_municipality as string | null) ?? null,
    provinceName: (row.province_name as string | null) ?? null,
    provinceSlug: (row.province_slug as string | null) ?? null,
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
  };
}

function toYearRecord(row: any): StationYearRecord {
  const counts: Record<string, number | null> = {};
  for (const column of ALL_CRIME_COLUMNS) {
    const value = row[column];
    // A missing column stays null and is never coerced to zero. coerceSourceCount also treats
    // the source's negative values as unavailable rather than as counts.
    counts[column] =
      value === null || value === undefined ? null : coerceSourceCount(Number(value));
  }

  return {
    financialYear: row.financial_year as string,
    financialYearStart: Number(row.financial_year_start),
    counts,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getLatestFinancialYear(): Promise<DataResult<string>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { data, error } = await client
    .from("crime_records")
    .select("financial_year, financial_year_start")
    .order("financial_year_start", { ascending: false })
    .limit(1);

  if (error) return fail("query_failed", error.message);

  const latest = data?.[0]?.financial_year;
  if (!latest) return fail("not_found", "No crime records have been loaded yet.");

  return ok(latest);
}

export async function getStationProfileBySlug(
  slug: string,
): Promise<DataResult<StationProfile>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { data: stationRows, error: stationError } = await client
    .from("police_stations")
    .select(STATION_COLUMNS)
    .eq("station_slug", slug)
    .limit(1);

  if (stationError) return fail("query_failed", stationError.message);

  const stationRow = stationRows?.[0];
  if (!stationRow) return fail("not_found", `No police station matches "${slug}".`);

  const station = toStation(stationRow);

  const { data: recordRows, error: recordError } = await client
    .from("crime_records")
    .select("*")
    .eq("station_id", station.id)
    .order("financial_year_start", { ascending: true });

  if (recordError) return fail("query_failed", recordError.message);

  return ok({
    station,
    records: (recordRows ?? []).map(toYearRecord),
  });
}

export async function getStationProfilesBySlugs(
  slugs: readonly string[],
): Promise<DataResult<StationProfile[]>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);
  if (slugs.length === 0) return ok([]);

  const { data: stationRows, error: stationError } = await client
    .from("police_stations")
    .select(STATION_COLUMNS)
    .in("station_slug", [...slugs]);

  if (stationError) return fail("query_failed", stationError.message);

  const stations = (stationRows ?? []).map(toStation);
  if (stations.length === 0) return ok([]);

  const { data: recordRows, error: recordError } = await client
    .from("crime_records")
    .select("*")
    .in(
      "station_id",
      stations.map((s) => s.id),
    )
    .order("financial_year_start", { ascending: true });

  if (recordError) return fail("query_failed", recordError.message);

  const recordsByStation = new Map<number, StationYearRecord[]>();
  for (const row of recordRows ?? []) {
    const stationId = Number(row.station_id);
    const list = recordsByStation.get(stationId) ?? [];
    list.push(toYearRecord(row));
    recordsByStation.set(stationId, list);
  }

  // Preserve the order the caller asked for so a comparison table's columns are predictable.
  const bySlug = new Map(stations.map((s) => [s.slug, s]));
  const ordered: StationProfile[] = [];
  for (const slug of slugs) {
    const station = bySlug.get(slug);
    if (!station) continue;
    ordered.push({ station, records: recordsByStation.get(station.id) ?? [] });
  }

  return ok(ordered);
}

export interface NearbyStation {
  readonly slug: string;
  readonly name: string;
  readonly localMunicipality: string | null;
  readonly provinceName: string | null;
  readonly provinceSlug: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly distanceMeters: number;
}

export async function getNearbyStations(
  longitude: number,
  latitude: number,
  limit = 5,
  excludeSlug?: string,
): Promise<DataResult<NearbyStation[]>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { data, error } = await client.rpc("stations_nearest", {
    p_lng: longitude,
    p_lat: latitude,
    p_limit: Math.min(Math.max(limit + (excludeSlug ? 1 : 0), 1), 10),
  });

  if (error) return fail("query_failed", error.message);

  const stations: NearbyStation[] = (data ?? [])
    .filter((row) => row.station_slug !== excludeSlug)
    .slice(0, limit)
    .map((row) => ({
      slug: row.station_slug,
      name: row.station_name,
      localMunicipality: row.local_municipality,
      provinceName: row.province_name,
      provinceSlug: row.province_slug,
      latitude: row.latitude,
      longitude: row.longitude,
      distanceMeters: Number(row.distance_meters),
    }));

  return ok(stations);
}

/** Station slugs and provinces for the sitemap and static params. */
export async function getAllStationRoutes(): Promise<
  DataResult<{ slug: string; provinceSlug: string | null; updatedAt: string | null }[]>
> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { data, error } = await client
    .from("police_stations")
    .select("station_slug, province_slug, updated_at")
    .order("station_slug", { ascending: true });

  if (error) return fail("query_failed", error.message);

  return ok(
    (data ?? []).map((row) => ({
      slug: row.station_slug,
      provinceSlug: row.province_slug ?? null,
      updatedAt: row.updated_at ?? null,
    })),
  );
}
