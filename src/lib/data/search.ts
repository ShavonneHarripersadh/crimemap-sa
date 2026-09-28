import "server-only";

import { geocodeSouthAfricanPlace } from "@/lib/data/geocode";
import { fail, ok, NOT_CONFIGURED_MESSAGE, type DataResult } from "@/lib/data/result";
import {
  geocodedPlaceResult,
  presentSearchResults,
  type SearchResult,
  type SearchSourceRow,
} from "@/lib/data/search-results";
import { formatDistance } from "@/lib/format";
import { getServerClient } from "@/lib/supabase/server";

export type { SearchResult, SearchResultType } from "@/lib/data/search-results";

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

  const sqlResults = presentSearchResults(data ?? []);
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

  const placeResult = geocodedPlaceResult(place.name, data.length);

  const stations = data.flatMap((row) => {
    const source: SearchSourceRow = {
      result_type: "nearby_station",
      label: row.station_name,
      slug: row.station_slug,
      local_municipality: row.local_municipality,
      district_municipality: row.district_municipality,
      province_name: row.province_name,
      province_slug: row.province_slug,
      station_count: 1,
      entity_id: row.entity_id,
      entity_type: row.entity_type,
    };
    const [result] = presentSearchResults([source]);
    if (!result) return [];

    const distance = formatDistance(row.distance_meters);
    return [{
      ...result,
      context: [
        distance ? `${distance} from ${place.name}` : `Near ${place.name}`,
        "not the official precinct",
        result.context,
      ]
        .filter(Boolean)
        .join(" · "),
    }];
  });

  return [placeResult, ...stations];
}
