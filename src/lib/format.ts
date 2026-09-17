import type { Change, TrendDirection } from "@/lib/metrics/change";

/**
 * Group thousands with a non-breaking space, South African style.
 *
 * Intl.NumberFormat("en-ZA") is not used: Node and Safari disagree on the grouping character,
 * which hydrates the homepage as a mismatch and can cover the page with an error overlay.
 */
function formatGroupedInteger(value: number): string {
  return Math.round(Math.abs(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

/**
 * Format a count. Missing values render as an explicit "Not available" rather than as 0,
 * because the two mean different things.
 */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not available";
  const grouped = formatGroupedInteger(value);
  return value < 0 ? `−${grouped}` : grouped;
}

/** Short labels for map hexes and circles, e.g. 1.5m, 12k, 482. */
export function formatCompactCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Math.round(Math.abs(value));
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    return `${millions >= 10 ? millions.toFixed(0) : millions.toFixed(1)}m`;
  }
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Format a percentage with an explicit sign, e.g. "+18.4%". */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not available";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

/**
 * Text indicator of direction. Paired with the percentage everywhere so that direction is never
 * communicated by colour alone, which WCAG 2.1 AA requires.
 */
export function directionIndicator(direction: TrendDirection): string {
  switch (direction) {
    case "increase":
      return "↑";
    case "decrease":
      return "↓";
    case "broadly_unchanged":
      return "→";
    case "unavailable":
      return "–";
  }
}

export function directionWord(direction: TrendDirection): string {
  switch (direction) {
    case "increase":
      return "increased";
    case "decrease":
      return "decreased";
    case "broadly_unchanged":
      return "was broadly unchanged";
    case "unavailable":
      return "could not be compared";
  }
}

/**
 * The user-facing summary of a change, covering every state the calculation can produce.
 */
export function formatChange(change: Change): string {
  switch (change.state) {
    case "ok":
      return formatPercent(change.percentChange);
    case "newly_recorded":
      return "Newly recorded";
    case "none_in_either_year":
      return "None recorded";
    case "unavailable":
      return "Not available";
  }
}

/** Longer explanation of a change state, used in tooltips and screen-reader text. */
export function describeChangeState(change: Change): string {
  switch (change.state) {
    case "ok":
      return change.lowBase
        ? "Percentage based on a small number of recorded cases in the previous year."
        : "Compared with the previous financial year.";
    case "newly_recorded":
      return "None were recorded in the previous financial year, so a percentage change cannot be calculated.";
    case "none_in_either_year":
      return "None were recorded in either financial year.";
    case "unavailable":
      return "The source data does not provide a figure for one or both years.";
  }
}

export function formatAbsoluteChange(change: Change): string {
  if (change.absoluteChange === null) return "Not available";
  const sign = change.absoluteChange > 0 ? "+" : change.absoluteChange < 0 ? "−" : "";
  return `${sign}${formatGroupedInteger(change.absoluteChange)}`;
}

/** Straight-line distance for nearest-station search hints. */
export function formatDistance(meters: number | null | undefined): string | null {
  if (meters === null || meters === undefined || !Number.isFinite(meters) || meters < 0) {
    return null;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}
