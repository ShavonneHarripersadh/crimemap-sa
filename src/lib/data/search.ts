import "server-only";

import { geocodeSouthAfricanPlace } from "@/lib/data/geocode";
import { fail, ok, NOT_CONFIGURED_MESSAGE, type DataResult } from "@/lib/data/result";
import { formatDistance } from "@/lib/format";
import { getServerClient } from "@/lib/supabase/server";

export type SearchResultType =
  | "station"
  | "local_municipality"
  | "district_municipality"
  | "province"
  | "nearby_station"
  | "place";

export interface SearchResult {
  readonly type: SearchResultType;
  readonly typeLabel: string;
  readonly label: string;
  /** Secondary line giving the result its geographic context. */
  readonly context: string;
  readonly href: string;
  readonly stationCount: number;
}

const TYPE_LABELS: Record<SearchResultType, string> = {
  station: "Police station",
  local_municipality: "Local municipality",
  district_municipality: "District municipality",
  province: "Province",
  nearby_station: "Nearest station",
  place: "Place",
};

function contextLine(row: {
  result_type: string;
  local_municipality: string | null;
  district_municipality: string | null;
  province_name: string | null;
  station_count: number;
}): string {
  const parts: string[] = [];

  if (row.result_type === "station" || row.result_type === "nearby_station") {
    if (row.local_municipality) parts.push(row.local_municipality);
    if (row.province_name) parts.push(row.province_name);
  } else if (row.result_type === "local_municipality") {
    if (row.district_municipality) parts.push(row.district_municipality);
    if (row.province_name) parts.push(row.province_name);
  } else if (row.result_type === "district_municipality") {
    if (row.province_name) parts.push(row.province_name);
  }

  if (row.result_type !== "station" && row.result_type !== "nearby_station") {
    parts.push(
      `${row.station_count} police station${row.station_count === 1 ? "" : "s"}`,
    );
  }

  return parts.length > 0 ? parts.join(" · ") : "South Africa";
}

function href(row: {
  result_type: string;
  slug: string | null;
  province_slug: string | null;
  local_municipality: string | null;
  district_municipality: string | null;
}): string {
  switch (row.result_type) {
    case "station":
    case "nearby_station":
      return row.province_slug && row.slug
        ? `/crime/${row.province_slug}/${row.slug}`
        : `/station/${row.slug ?? ""}`;
    case "local_municipality":
      return row.province_slug
        ? `/crime/${row.province_slug}?municipality=${encodeURIComponent(row.local_municipality ?? "")}`
        : "/";
    case "district_municipality":
      return row.province_slug
        ? `/crime/${row.province_slug}?district=${encodeURIComponent(row.district_municipality ?? "")}`
        : "/";
    case "province":
      return row.slug ? `/crime/${row.slug}` : "/";
    default:
      return "/";
  }
}

function toSearchResult(row: {
  result_type: string;
  label: string;
  slug: string | null;
  local_municipality: string | null;
  district_municipality: string | null;
  province_name: string | null;
  province_slug: string | null;
  station_count: number | null;
}): SearchResult {
  return {
    type: (row.result_type as SearchResultType) ?? "station",
    typeLabel: TYPE_LABELS[row.result_type as SearchResultType] ?? "Result",
    label: row.label,
    context: contextLine({
      result_type: row.result_type,
      local_municipality: row.local_municipality,
      district_municipality: row.district_municipality,
      province_name: row.province_name,
      station_count: row.station_count ?? 0,
    }),
    href: href({
      result_type: row.result_type,
      slug: row.slug,
      province_slug: row.province_slug,
      local_municipality: row.local_municipality,
      district_municipality: row.district_municipality,
    }),
    stationCount: row.station_count ?? 0,
  };
}

/**
 * Autocomplete across stations, municipalities, districts and provinces.
 * Ordering is decided in SQL and is deterministic for a given query.
 *
 * When the source has no matching name, the query is geocoded and the nearest stations are
 * offered, labelled as nearest rather than as the official precinct.
 */
export async function searchLocations(
  query: string,
  limit = 10,
): Promise<DataResult<SearchResult[]>> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return ok([]);

  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { data, error } = await client.rpc("search_locations", {
    q: trimmed,
    max_results: Math.min(Math.max(limit, 1), 25),
  });

  if (error) return fail("query_failed", error.message);

  const sqlResults = (data ?? []).map(toSearchResult);
  const needle = normalised(trimmed);
  const hasSubstringHit = sqlResults.some((row) => normalised(row.label).includes(needle));

  // A trigram near-miss such as Bloemhof for "Bromhof" is not a real match. Only trust SQL
  // when the typed text appears in the name; otherwise look up the nearest stations.
  if (sqlResults.length > 0 && hasSubstringHit) {
    return ok(sqlResults);
  }

  const nearby = await nearestStationsToPlace(trimmed, Math.min(Math.max(limit, 1), 5));
  if (nearby.length > 0) return ok(nearby);

  return ok(sqlResults);
}

function normalised(value: string): string {
  return value.trim().toLowerCase();
}

async function nearestStationsToPlace(
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  const client = getServerClient();
  if (!client) return [];

  const place = await geocodeSouthAfricanPlace(query);
  if (!place) return [];

  const { data, error } = await client.rpc("stations_nearest", {
    p_lng: place.longitude,
    p_lat: place.latitude,
    p_limit: limit,
  });

  if (error || !data) return [];

  const placeResult: SearchResult = {
    type: "place",
    typeLabel: TYPE_LABELS.place,
    label: place.name,
    context: "No SAPS precinct boundary · nearby stations",
    href: `/place/${encodeURIComponent(place.name)}`,
    stationCount: data.length,
  };

  const stations = data.map((row) => {
    const result = toSearchResult({
      result_type: "nearby_station",
      label: row.station_name,
      slug: row.station_slug,
      local_municipality: row.local_municipality,
      district_municipality: row.district_municipality,
      province_name: row.province_name,
      province_slug: row.province_slug,
      station_count: 1,
    });

    const distance = formatDistance(row.distance_meters);
    return {
      ...result,
      context: [
        distance ? `${distance} from ${place.name}` : `Near ${place.name}`,
        "not the official precinct",
        result.context,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  return [placeResult, ...stations];
}
