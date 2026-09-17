/**
 * Every percentage change, trend label and change-ranking rule in CrimeMap SA lives here.
 *
 * Documented calculations (also published on /methodology):
 *
 *   Year-over-year change = (current - previous) / previous * 100
 *
 * Rules this module enforces, and why:
 *
 *   Missing stays missing. If either value is NULL the change is unavailable. A missing value
 *   is never treated as zero, because "the source did not report a number" and "the source
 *   reported zero" are different facts.
 *
 *   A zero baseline has no percentage. Dividing by zero cannot produce a meaningful percentage,
 *   so a rise from 0 is reported as "Newly recorded" rather than as an infinite increase.
 *
 *   A small baseline is flagged. A move from 1 to 2 is a 100% increase but is not comparable to
 *   a move from 500 to 550. Small-base changes carry a flag so the UI can show the absolute
 *   counts and keep them out of headline rankings.
 */

/**
 * Interpret a raw source count.
 *
 * The source dataset contains 1,203 negative values, almost all in the sexual offence breakdown
 * columns for 2005/06 to 2007/08. A count of recorded crimes cannot be negative, so a negative
 * value cannot be used in a calculation or shown as a count. It is stored in the database exactly
 * as distributed and reported by the pipeline; here it becomes unavailable rather than being
 * silently turned into a zero, which would misrepresent it as "none recorded".
 */
export function coerceSourceCount(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}

export type ChangeState =
  /** Both values present and the previous value is above zero: a percentage is meaningful. */
  | "ok"
  /** Previous value is zero and the current value is above zero. */
  | "newly_recorded"
  /** Both values are zero: nothing was recorded in either year. */
  | "none_in_either_year"
  /** At least one value is missing from the source. */
  | "unavailable";

export interface Change {
  readonly state: ChangeState;
  readonly current: number | null;
  readonly previous: number | null;
  /** current - previous, or null when either value is missing. */
  readonly absoluteChange: number | null;
  /** Percentage change to one decimal place. Null unless state is "ok". */
  readonly percentChange: number | null;
  /** True when the previous value is too small for a percentage to be informative. */
  readonly lowBase: boolean;
}

/**
 * Below this previous-year count a percentage change is flagged as a low base. Ten is used
 * because a single additional recorded case moves a base of ten by ten percent, which is the
 * point at which a percentage stops being a useful summary on its own.
 */
export const LOW_BASE_THRESHOLD = 10;

/** Thresholds a change must clear before it can be highlighted as notable. */
export const CHANGE_HIGHLIGHT_RULES = {
  /** The previous year must have enough recorded cases for a percentage to mean something. */
  minimumPreviousValue: 10,
  /** The movement must be large enough in absolute terms, not only in percentage terms. */
  minimumAbsoluteChange: 5,
  /** The movement must also be large enough proportionally. */
  minimumPercentChange: 5,
} as const;

/** Percentage band within which a change is described as broadly unchanged rather than a rise or fall. */
export const TREND_BAND_PERCENT = 2;

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Compare two counts. Pass null for a value the source did not provide.
 */
export function calculateChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): Change {
  const cur = current ?? null;
  const prev = previous ?? null;

  if (cur === null || prev === null) {
    return {
      state: "unavailable",
      current: cur,
      previous: prev,
      absoluteChange: null,
      percentChange: null,
      lowBase: false,
    };
  }

  const absoluteChange = cur - prev;

  if (prev === 0) {
    return {
      state: cur === 0 ? "none_in_either_year" : "newly_recorded",
      current: cur,
      previous: prev,
      absoluteChange,
      percentChange: null,
      lowBase: true,
    };
  }

  return {
    state: "ok",
    current: cur,
    previous: prev,
    absoluteChange,
    percentChange: roundToOneDecimal((absoluteChange / prev) * 100),
    lowBase: prev < LOW_BASE_THRESHOLD,
  };
}

export type TrendDirection = "increase" | "decrease" | "broadly_unchanged" | "unavailable";

/**
 * Describe the direction of a change. Movements inside TREND_BAND_PERCENT are reported as
 * broadly unchanged so that ordinary year-to-year variation is not presented as a trend.
 */
export function trendDirection(change: Change): TrendDirection {
  switch (change.state) {
    case "unavailable":
      return "unavailable";
    case "none_in_either_year":
      return "broadly_unchanged";
    case "newly_recorded":
      return "increase";
    case "ok": {
      const percent = change.percentChange;
      if (percent === null) return "unavailable";
      if (percent > TREND_BAND_PERCENT) return "increase";
      if (percent < -TREND_BAND_PERCENT) return "decrease";
      return "broadly_unchanged";
    }
  }
}

/**
 * Whether a change clears the thresholds required to be highlighted as notable.
 * Keeps "1 to 2, up 100%" out of the "What's changing?" panel.
 */
export function isHighlightableChange(change: Change): boolean {
  if (change.state !== "ok") return false;
  if (change.previous === null || change.absoluteChange === null) return false;
  if (change.percentChange === null) return false;

  return (
    change.previous >= CHANGE_HIGHLIGHT_RULES.minimumPreviousValue &&
    Math.abs(change.absoluteChange) >= CHANGE_HIGHLIGHT_RULES.minimumAbsoluteChange &&
    Math.abs(change.percentChange) >= CHANGE_HIGHLIGHT_RULES.minimumPercentChange
  );
}

export interface CategoryChange extends Change {
  /** Source column name. */
  readonly column: string;
  readonly label: string;
}

/**
 * Rank category changes for the "What's changing?" panel.
 *
 * Only changes that clear the highlight rules are returned, so a large percentage built on a
 * tiny base can never outrank a substantial movement. Ties are broken by absolute movement and
 * then by label, which keeps the output deterministic.
 */
export function rankChanges(
  changes: readonly CategoryChange[],
  direction: "increase" | "decrease",
  limit = 5,
): CategoryChange[] {
  const sign = direction === "increase" ? 1 : -1;

  return changes
    .filter(isHighlightableChange)
    .filter((c) => c.percentChange !== null && Math.sign(c.percentChange) === sign)
    .sort((a, b) => {
      const byPercent =
        sign * ((b.percentChange ?? 0) - (a.percentChange ?? 0));
      if (byPercent !== 0) return byPercent;
      const byAbsolute =
        sign * ((b.absoluteChange ?? 0) - (a.absoluteChange ?? 0));
      if (byAbsolute !== 0) return byAbsolute;
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
}

/**
 * Sum counts while keeping missing values visible.
 *
 * Returns null only when every value is missing. When some values are present and others are
 * not, the total is the sum of what exists and missingCount records how many were unavailable,
 * so the UI can disclose that the figure is partial instead of implying it is complete.
 */
export function sumPreservingMissing(
  values: readonly (number | null | undefined)[],
): { total: number | null; missingCount: number; presentCount: number } {
  let total = 0;
  let missingCount = 0;
  let presentCount = 0;

  for (const value of values) {
    if (value === null || value === undefined) {
      missingCount += 1;
      continue;
    }
    total += value;
    presentCount += 1;
  }

  return {
    total: presentCount === 0 ? null : total,
    missingCount,
    presentCount,
  };
}
