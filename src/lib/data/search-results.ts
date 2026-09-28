/**
 * Pure search-result assembly.
 *
 * SQL returns one row per geo entity. This module does not merge rows that
 * share a name. When two municipalities have the same name, the context names
 * the province so the results can be told apart. The label stays the source
 * name, because existing map search matches that name and the public URL
 * query still uses it.
 */

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
  /** Canonical geo entity, when this result was resolved to one. Null for a geocoded place name. */
  readonly entityType: string | null;
  readonly entityId: number | null;
}

export interface SearchSourceRow {
  readonly result_type: string;
  readonly label: string;
  readonly slug: string | null;
  readonly local_municipality: string | null;
  readonly district_municipality: string | null;
  readonly province_name: string | null;
  readonly province_slug: string | null;
  readonly station_count: number | null;
  readonly entity_id?: number | null;
  readonly entity_type?: string | null;
}

const TYPE_LABELS: Record<SearchResultType, string> = {
  station: "Police precinct",
  local_municipality: "Municipality",
  district_municipality: "District",
  province: "Province",
  nearby_station: "Nearby precinct",
  place: "Area",
};

function normalised(value: string): string {
  return value.trim().toLowerCase();
}

function stationCountLabel(count: number): string {
  return `${count} police station${count === 1 ? "" : "s"}`;
}

function contextLine(row: SearchSourceRow): string {
  const parts: string[] = [];
  const stationCount = row.station_count ?? 0;

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
    parts.push(stationCountLabel(stationCount));
  }

  return parts.length > 0 ? parts.join(" · ") : "South Africa";
}

function href(row: SearchSourceRow): string {
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

function mapSearchRow(row: SearchSourceRow): SearchResult {
  return {
    type: (row.result_type as SearchResultType) ?? "station",
    typeLabel: TYPE_LABELS[row.result_type as SearchResultType] ?? "Result",
    label: row.label,
    context: contextLine(row),
    href: href(row),
    stationCount: row.station_count ?? 0,
    entityType: row.entity_type ?? null,
    entityId: row.entity_id ?? null,
  };
}

function sharedNameKey(row: SearchSourceRow): string | null {
  if (row.result_type !== "local_municipality" && row.result_type !== "district_municipality") {
    return null;
  }
  return `${row.result_type}\0${normalised(row.label)}`;
}

/**
 * One result per source row. Municipality names that occur more than once in
 * this set keep their own entity id and gain a "Name — Province" context.
 */
export function presentSearchResults(rows: readonly SearchSourceRow[]): SearchResult[] {
  const nameCounts = new Map<string, number>();
  for (const row of rows) {
    const key = sharedNameKey(row);
    if (!key) continue;
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  return rows.map((row) => {
    const result = mapSearchRow(row);
    const key = sharedNameKey(row);
    if (!key || (nameCounts.get(key) ?? 0) < 2 || !row.province_name) return result;

    const stationCount = row.station_count ?? 0;
    const parts = [`${row.label} — ${row.province_name}`];
    if (row.result_type === "local_municipality" && row.district_municipality) {
      parts.push(row.district_municipality);
    }
    parts.push(stationCountLabel(stationCount));

    return { ...result, context: parts.join(" · ") };
  });
}

/** A geocoded suburb or town is not a stored geo entity. */
export function geocodedPlaceResult(name: string, stationCount: number): SearchResult {
  return {
    type: "place",
    typeLabel: TYPE_LABELS.place,
    label: name,
    context: "Suburb or town · figures come from a nearby police precinct",
    href: `/place/${encodeURIComponent(name.trim().toLowerCase())}`,
    stationCount,
    entityType: null,
    entityId: null,
  };
}
