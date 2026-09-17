import "server-only";

import { calculateChange, type Change } from "@/lib/metrics/change";
import { getServerClient } from "@/lib/supabase/server";
import { fail, ok, NOT_CONFIGURED_MESSAGE, type DataResult } from "@/lib/data/result";

export interface BoundingBox {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

export interface MapStation {
  readonly slug: string;
  readonly name: string;
  readonly localMunicipality: string | null;
  readonly provinceName: string | null;
  readonly provinceSlug: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly financialYear: string;
  /** Count for the selected category, or the headline total when the total is selected. */
  readonly value: number | null;
  readonly previousValue: number | null;
  readonly totalRecordedCrime: number | null;
  readonly change: Change;
}

/** Supabase API responses are capped at 1,000 rows, even when the SQL limit is higher. */
const SUPABASE_ROW_CAP = 1000;

type StationBboxRow = {
  station_slug: string;
  station_name: string;
  local_municipality: string | null;
  province_name: string | null;
  province_slug: string | null;
  latitude: number | null;
  longitude: number | null;
  financial_year: string;
  category_value: number | null;
  previous_value: number | null;
  total_recorded_crime: number | null;
};

async function fetchStationsInBbox(
  client: NonNullable<ReturnType<typeof getServerClient>>,
  options: {
    bbox: BoundingBox;
    financialYear: string | null;
    category: string;
    limit: number;
    depth?: number;
  },
): Promise<{ data: StationBboxRow[]; error: { message: string } | null }> {
  const { bbox, financialYear, category, limit, depth = 0 } = options;
  const { data, error } = await client.rpc("stations_in_bbox", {
    p_west: bbox.west,
    p_south: bbox.south,
    p_east: bbox.east,
    p_north: bbox.north,
    p_year: financialYear ?? undefined,
    p_category: category,
    p_limit: limit,
  });

  if (error) return { data: [], error };
  const rows = (data ?? []) as StationBboxRow[];
  if (rows.length < SUPABASE_ROW_CAP || depth >= 3) {
    return { data: rows, error: null };
  }

  const width = bbox.east - bbox.west;
  const height = bbox.north - bbox.south;
  const firstBbox =
    width >= height
      ? { ...bbox, east: (bbox.west + bbox.east) / 2 }
      : { ...bbox, north: (bbox.south + bbox.north) / 2 };
  const secondBbox =
    width >= height
      ? { ...bbox, west: (bbox.west + bbox.east) / 2 }
      : { ...bbox, south: (bbox.south + bbox.north) / 2 };

  const [first, second] = await Promise.all([
    fetchStationsInBbox(client, { ...options, bbox: firstBbox, depth: depth + 1 }),
    fetchStationsInBbox(client, { ...options, bbox: secondBbox, depth: depth + 1 }),
  ]);
  if (first.error) return first;
  if (second.error) return second;

  const seen = new Set<string>();
  const merged: StationBboxRow[] = [];
  for (const row of [...first.data, ...second.data]) {
    if (seen.has(row.station_slug)) continue;
    seen.add(row.station_slug);
    merged.push(row);
  }

  merged.sort((a, b) => {
    const av = a.category_value ?? -1;
    const bv = b.category_value ?? -1;
    if (bv !== av) return bv - av;
    return a.station_name.localeCompare(b.station_name);
  });

  return { data: merged.slice(0, limit), error: null };
}

/**
 * Stations inside a bounding box for one financial year and one category.
 *
 * The query runs in PostGIS against a spatial index, so the browser only ever receives the
 * stations that are currently in view rather than the national dataset.
 */
export async function getMapStations(options: {
  bbox: BoundingBox;
  financialYear?: string | null;
  category?: string;
  limit?: number;
}): Promise<DataResult<MapStation[]>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { bbox, financialYear = null, category = "total_recorded_crime", limit = 2000 } =
    options;

  const { data, error } = await fetchStationsInBbox(client, {
    bbox,
    financialYear,
    category,
    limit: Math.min(Math.max(limit, 1), 2000),
  });

  if (error) return fail("query_failed", error.message);

  const stations: MapStation[] = data
    .filter((row) => row.latitude !== null && row.longitude !== null)
    .map((row) => {
      const value = row.category_value === null ? null : Number(row.category_value);
      const previousValue = row.previous_value === null ? null : Number(row.previous_value);

      return {
        slug: row.station_slug,
        name: row.station_name,
        localMunicipality: row.local_municipality,
        provinceName: row.province_name,
        provinceSlug: row.province_slug,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        financialYear: row.financial_year,
        value,
        previousValue,
        totalRecordedCrime:
          row.total_recorded_crime === null ? null : Number(row.total_recorded_crime),
        change: calculateChange(value, previousValue),
      };
    });

  return ok(stations);
}
