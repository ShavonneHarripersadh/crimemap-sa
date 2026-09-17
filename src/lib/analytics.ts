import { track } from "@vercel/analytics";

/**
 * Product analytics events.
 *
 * Only interaction shape is recorded: which feature was used and with what kind of option.
 * No search text, no station identity tied to a person, and no identifiers of any kind, so
 * nothing here can describe an individual visitor.
 */
export type AnalyticsEvent =
  | "search_performed"
  | "search_result_selected"
  | "map_category_changed"
  | "map_year_changed"
  | "map_station_opened"
  | "map_province_jumped"
  | "trend_category_changed"
  | "trend_window_changed"
  | "comparison_area_added"
  | "comparison_viewed"
  | "methodology_opened";

export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean | null>,
): void {
  try {
    track(event, properties);
  } catch {
    // Analytics must never interfere with using the site.
  }
}
