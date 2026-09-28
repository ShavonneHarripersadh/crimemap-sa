import { track } from "@vercel/analytics";

import type { SearchResult } from "@/lib/data/search-results";

/**
 * Product analytics for Vercel Web Analytics.
 *
 * Events describe which public place or feature was used. They do not include account data,
 * contact details, or a precise coordinate. Vercel records the visit; CrimeMap SA does not
 * write these events into the crime database.
 */
export type AnalyticsEvent =
  | "search_performed"
  | "area_viewed"
  | "crime_category_viewed"
  | "comparison_viewed"
  | "map_viewed"
  | "map_filter_changed";

export type AnalyticsProperties = Record<string, string | number | boolean | null>;

const recent = new Map<string, number>();

export function trackEvent(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  const key = `${event}:${JSON.stringify(properties ?? {})}`;
  const now = Date.now();
  const last = recent.get(key) ?? 0;
  if (now - last < 1000) return;
  recent.set(key, now);
  if (recent.size > 200) {
    const oldest = recent.keys().next().value;
    if (oldest) recent.delete(oldest);
  }

  try {
    track(event, properties);
  } catch {
    // Analytics must never interfere with using the site.
  }
}

/** A completed search that returned nothing. The text is a place query, not a person. */
export function unmatchedSearchProperties(query: string): AnalyticsProperties | null {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  if (normalized.length < 2) return null;
  if (normalized.includes("@") || /\d{7,}/.test(normalized)) return null;
  return {
    search_type: "lookup",
    entity_type: "none",
    result_count: 0,
    unmatched_query: normalized,
  };
}

/** A search result the reader actually chose. Uses the public slug, not an internal id. */
export function searchSelectionProperties(result: SearchResult): AnalyticsProperties {
  const parts = result.href.split("?")[0]?.split("/").filter(Boolean) ?? [];
  const base: AnalyticsProperties = {
    search_type: "lookup",
    entity_type: result.type,
    result_count: 1,
  };

  if (parts[0] === "crime" && parts.length >= 3 && parts[1] && parts[2]) {
    return { ...base, entity: parts[2], province: parts[1] };
  }
  if (parts[0] === "crime" && parts.length === 2 && parts[1]) {
    return { ...base, entity: parts[1], province: parts[1] };
  }
  if (parts[0] === "place" && parts[1]) {
    return { ...base, entity: decodeURIComponent(parts[1]).toLowerCase() };
  }

  return { ...base, entity: result.label.trim().toLowerCase().slice(0, 80) };
}
