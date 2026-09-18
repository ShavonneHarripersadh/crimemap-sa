import { formatCount, formatPercent } from "@/lib/format";
import {
  calculateChange,
  isHighlightableChange,
  TREND_BAND_PERCENT,
  type Change,
} from "@/lib/metrics/change";
import {
  buildSeries,
  buildYearTotals,
  type SeriesPoint,
  type StationYearRecord,
} from "@/lib/metrics/profile";
import { FEATURED_SERIES, TOTAL_SERIES_TOKEN, type FeaturedSeries } from "@/lib/crime/taxonomy";

/**
 * Historical context, crime-history milestones and unusual-movement classification.
 *
 * Every figure is a deterministic function of the same source counts already used on area pages.
 * Missing years stay missing. A zero previous-year count never produces a percentage.
 */

/** Last N financial years inclusive of the latest, counting calendar slots not present values. */
export const HISTORY_WINDOWS = [5, 10] as const;

/**
 * Unusual-movement rules, published on /methodology.
 *
 * A latest year-on-year percentage is compared with earlier comparable percentages for the
 * same station (or category), not with a national ranking.
 */
export const UNUSUAL_MOVEMENT_RULES = {
  /** Earlier comparable year-on-year movements required before anything is called unusual. */
  minimumPriorObservations: 5,
  /**
   * A latest movement that is not the series extreme is "notable" when its absolute percentage
   * is at least this multiple of the median of earlier absolute percentages.
   */
  notableMultipleOfMedian: 1.5,
} as const;

export interface WindowAverage {
  readonly windowYears: number;
  readonly average: number | null;
  readonly presentCount: number;
  readonly missingCount: number;
  readonly fromYear: string | null;
  readonly toYear: string | null;
}

export interface HistoricalExtremes {
  readonly high: { readonly financialYear: string; readonly value: number } | null;
  readonly low: { readonly financialYear: string; readonly value: number } | null;
}

export type RangeRelation =
  | "historical_high"
  | "historical_low"
  | "only_value"
  | "inside_range"
  | "unavailable";

export interface HistoricalContext {
  readonly latestYear: string;
  readonly latestValue: number | null;
  readonly missingInLatest: number;
  readonly fiveYear: WindowAverage;
  readonly tenYear: WindowAverage;
  readonly extremes: HistoricalExtremes;
  readonly rangeRelation: RangeRelation;
  /** (latest − min) / (max − min), or null when the range is unavailable or a single value. */
  readonly rangePosition: number | null;
  readonly vsFiveYear: Change;
  readonly vsTenYear: Change;
}

export interface YearOnYearPoint {
  readonly financialYear: string;
  readonly previousYear: string;
  readonly value: number | null;
  readonly previousValue: number | null;
  readonly change: Change;
}

export interface CrimeHistoryMilestones {
  readonly highest: { readonly financialYear: string; readonly value: number } | null;
  readonly lowest: { readonly financialYear: string; readonly value: number } | null;
  readonly largestIncrease: YearOnYearPoint | null;
  readonly largestDecrease: YearOnYearPoint | null;
}

export type UnusualClassification =
  | "normal"
  | "notable"
  | "largest_increase"
  | "largest_decrease"
  | "insufficient"
  | "unavailable";

export interface UnusualMovement {
  readonly classification: UnusualClassification;
  readonly latest: YearOnYearPoint | null;
  readonly priorComparableCount: number;
  readonly medianPriorAbsolutePercent: number | null;
  readonly reason: string;
}

function orderedPoints(points: readonly SeriesPoint[]): SeriesPoint[] {
  return [...points].sort((a, b) => a.financialYearStart - b.financialYearStart);
}

function presentValues(
  points: readonly SeriesPoint[],
): { financialYear: string; financialYearStart: number; value: number }[] {
  return orderedPoints(points).flatMap((point) =>
    point.value === null
      ? []
      : [
          {
            financialYear: point.financialYear,
            financialYearStart: point.financialYearStart,
            value: point.value,
          },
        ],
  );
}

function windowAverage(points: readonly SeriesPoint[], windowYears: number): WindowAverage {
  const ordered = orderedPoints(points);
  const latest = ordered.at(-1);
  if (!latest) {
    return {
      windowYears,
      average: null,
      presentCount: 0,
      missingCount: 0,
      fromYear: null,
      toYear: null,
    };
  }

  const minStart = latest.financialYearStart - (windowYears - 1);
  const window = ordered.filter((point) => point.financialYearStart >= minStart);
  const present = window.filter((point) => point.value !== null);
  const sum = present.reduce((total, point) => total + (point.value ?? 0), 0);

  return {
    windowYears,
    average: present.length === 0 ? null : Math.round(sum / present.length),
    presentCount: present.length,
    missingCount: window.length - present.length,
    fromYear: window[0]?.financialYear ?? null,
    toYear: latest.financialYear,
  };
}

function extremesOf(points: readonly SeriesPoint[]): HistoricalExtremes {
  const present = presentValues(points);
  if (present.length === 0) return { high: null, low: null };

  // Ties take the most recent year so "latest is the high" is well-defined.
  let high = present[0]!;
  let low = present[0]!;
  for (const point of present) {
    if (point.value > high.value || (point.value === high.value && point.financialYearStart > high.financialYearStart)) {
      high = point;
    }
    if (point.value < low.value || (point.value === low.value && point.financialYearStart > low.financialYearStart)) {
      low = point;
    }
  }

  return {
    high: { financialYear: high.financialYear, value: high.value },
    low: { financialYear: low.financialYear, value: low.value },
  };
}

function rangeRelation(
  latest: SeriesPoint | undefined,
  extremes: HistoricalExtremes,
): { relation: RangeRelation; position: number | null } {
  if (!latest || latest.value === null || !extremes.high || !extremes.low) {
    return { relation: "unavailable", position: null };
  }

  if (extremes.high.value === extremes.low.value) {
    return { relation: "only_value", position: null };
  }

  const position =
    Math.round(
      ((latest.value - extremes.low.value) / (extremes.high.value - extremes.low.value)) * 1000,
    ) / 1000;

  if (latest.financialYear === extremes.high.financialYear && latest.value === extremes.high.value) {
    return { relation: "historical_high", position };
  }
  if (latest.financialYear === extremes.low.financialYear && latest.value === extremes.low.value) {
    return { relation: "historical_low", position };
  }
  return { relation: "inside_range", position };
}

/** Headline-total series for a station, oldest year first. */
export function totalSeries(records: readonly StationYearRecord[]): SeriesPoint[] {
  const series = FEATURED_SERIES.find((item) => item.columns.includes(TOTAL_SERIES_TOKEN));
  if (!series) {
    return [...records]
      .sort((a, b) => a.financialYearStart - b.financialYearStart)
      .map((record) => {
        const totals = buildYearTotals(record);
        return {
          financialYear: record.financialYear,
          financialYearStart: record.financialYearStart,
          value: totals.totalRecordedCrime,
          missingCount: totals.missingCategories,
        };
      });
  }
  return buildSeries(records, series);
}

/** Keep years up to and including the selected financial year. Later years are omitted. */
export function seriesThroughYear(
  points: readonly SeriesPoint[],
  year: string | null,
): SeriesPoint[] {
  const ordered = orderedPoints(points);
  if (!year) return ordered;
  const index = ordered.findIndex((point) => point.financialYear === year);
  if (index < 0) return ordered;
  return ordered.slice(0, index + 1);
}

export function buildHistoricalContext(points: readonly SeriesPoint[]): HistoricalContext {
  const ordered = orderedPoints(points);
  const latest = ordered.at(-1);
  const fiveYear = windowAverage(ordered, 5);
  const tenYear = windowAverage(ordered, 10);
  const extremes = extremesOf(ordered);
  const range = rangeRelation(latest, extremes);

  return {
    latestYear: latest?.financialYear ?? "",
    latestValue: latest?.value ?? null,
    missingInLatest: latest?.missingCount ?? 0,
    fiveYear,
    tenYear,
    extremes,
    rangeRelation: range.relation,
    rangePosition: range.position,
    vsFiveYear: calculateChange(latest?.value ?? null, fiveYear.average),
    vsTenYear: calculateChange(latest?.value ?? null, tenYear.average),
  };
}

export function yearOnYearPoints(points: readonly SeriesPoint[]): YearOnYearPoint[] {
  const ordered = orderedPoints(points);
  const pairs: YearOnYearPoint[] = [];

  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index]!;
    const previous = ordered[index - 1]!;
    pairs.push({
      financialYear: current.financialYear,
      previousYear: previous.financialYear,
      value: current.value,
      previousValue: previous.value,
      change: calculateChange(current.value, previous.value),
    });
  }

  return pairs;
}

function comparableMovements(points: readonly YearOnYearPoint[]): YearOnYearPoint[] {
  return points.filter(
    (point) =>
      point.change.state === "ok" &&
      !point.change.lowBase &&
      point.change.percentChange !== null,
  );
}

export function buildCrimeHistory(points: readonly SeriesPoint[]): CrimeHistoryMilestones {
  const extremes = extremesOf(points);
  const comparable = comparableMovements(yearOnYearPoints(points));

  let largestIncrease: YearOnYearPoint | null = null;
  let largestDecrease: YearOnYearPoint | null = null;

  for (const point of comparable) {
    const percent = point.change.percentChange;
    if (percent === null) continue;
    if (percent > TREND_BAND_PERCENT) {
      if (
        !largestIncrease ||
        percent > (largestIncrease.change.percentChange ?? Number.NEGATIVE_INFINITY) ||
        (percent === largestIncrease.change.percentChange &&
          point.financialYear > largestIncrease.financialYear)
      ) {
        largestIncrease = point;
      }
    }
    if (percent < -TREND_BAND_PERCENT) {
      if (
        !largestDecrease ||
        percent < (largestDecrease.change.percentChange ?? Number.POSITIVE_INFINITY) ||
        (percent === largestDecrease.change.percentChange &&
          point.financialYear > largestDecrease.financialYear)
      ) {
        largestDecrease = point;
      }
    }
  }

  return {
    highest: extremes.high,
    lowest: extremes.low,
    largestIncrease,
    largestDecrease,
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
  return Math.round(value * 10) / 10;
}

export function classifyUnusualMovement(points: readonly SeriesPoint[]): UnusualMovement {
  const pairs = yearOnYearPoints(points);
  const latest = pairs.at(-1) ?? null;

  if (!latest) {
    return {
      classification: "unavailable",
      latest: null,
      priorComparableCount: 0,
      medianPriorAbsolutePercent: null,
      reason: "There are not two consecutive financial years to compare.",
    };
  }

  if (latest.change.state !== "ok" || latest.change.percentChange === null) {
    return {
      classification: "unavailable",
      latest,
      priorComparableCount: 0,
      medianPriorAbsolutePercent: null,
      reason:
        latest.change.state === "newly_recorded"
          ? "The previous year recorded none, so a percentage change cannot be calculated."
          : latest.change.state === "none_in_either_year"
            ? "None were recorded in either year, so there is no movement to classify."
            : "A figure is missing for one or both years, so the latest movement is not classified.",
    };
  }

  if (latest.change.lowBase) {
    return {
      classification: "unavailable",
      latest,
      priorComparableCount: 0,
      medianPriorAbsolutePercent: null,
      reason:
        "The previous-year count is below the small-base threshold, so a percentage movement is not classified as unusual.",
    };
  }

  const comparable = comparableMovements(pairs);
  const prior = comparable.filter((point) => point.financialYear !== latest.financialYear);
  const latestPercent = latest.change.percentChange;
  const priorPercents = prior.map((point) => point.change.percentChange ?? 0);
  const medianAbs = median(prior.map((point) => Math.abs(point.change.percentChange ?? 0)));

  if (prior.length < UNUSUAL_MOVEMENT_RULES.minimumPriorObservations) {
    return {
      classification: "insufficient",
      latest,
      priorComparableCount: prior.length,
      medianPriorAbsolutePercent: medianAbs,
      reason: `At least ${UNUSUAL_MOVEMENT_RULES.minimumPriorObservations} earlier comparable year-on-year movements are required before a latest movement is described as unusual. This series has ${prior.length}.`,
    };
  }

  const priorMax = Math.max(...priorPercents);
  const priorMin = Math.min(...priorPercents);

  if (latestPercent > TREND_BAND_PERCENT && latestPercent > priorMax) {
    return {
      classification: "largest_increase",
      latest,
      priorComparableCount: prior.length,
      medianPriorAbsolutePercent: medianAbs,
      reason: `The ${formatPercent(latestPercent)} rise in ${latest.financialYear} is larger than every earlier comparable annual increase in this series.`,
    };
  }

  if (latestPercent < -TREND_BAND_PERCENT && latestPercent < priorMin) {
    return {
      classification: "largest_decrease",
      latest,
      priorComparableCount: prior.length,
      medianPriorAbsolutePercent: medianAbs,
      reason: `The ${formatPercent(latestPercent)} fall in ${latest.financialYear} is larger than every earlier comparable annual decrease in this series.`,
    };
  }

  const notableFloor =
    medianAbs === null ? null : medianAbs * UNUSUAL_MOVEMENT_RULES.notableMultipleOfMedian;

  if (
    notableFloor !== null &&
    notableFloor > TREND_BAND_PERCENT &&
    Math.abs(latestPercent) >= notableFloor &&
    isHighlightableChange(latest.change)
  ) {
    return {
      classification: "notable",
      latest,
      priorComparableCount: prior.length,
      medianPriorAbsolutePercent: medianAbs,
      reason: `The ${formatPercent(latestPercent)} movement in ${latest.financialYear} is at least ${UNUSUAL_MOVEMENT_RULES.notableMultipleOfMedian} times the median of earlier comparable year-on-year movements (${formatPercent(medianAbs)} in absolute terms).`,
    };
  }

  return {
    classification: "normal",
    latest,
    priorComparableCount: prior.length,
    medianPriorAbsolutePercent: medianAbs,
    reason: `The ${formatPercent(latestPercent)} movement in ${latest.financialYear} sits within the range of earlier comparable year-on-year changes for this series.`,
  };
}

export function historicalContextSentences(context: HistoricalContext): string[] {
  const sentences: string[] = [];
  const latest = context.latestValue;
  if (latest === null) return sentences;

  if (context.rangeRelation === "historical_low") {
    sentences.push(
      `The latest figure, ${formatCount(latest)} in ${context.latestYear}, is the lowest recorded in the available dataset.`,
    );
  } else if (context.rangeRelation === "historical_high") {
    sentences.push(
      `The latest figure, ${formatCount(latest)} in ${context.latestYear}, is the highest recorded in the available dataset.`,
    );
  }

  if (
    context.vsTenYear.state === "ok" &&
    context.vsTenYear.percentChange !== null &&
    context.tenYear.average !== null
  ) {
    const percent = context.vsTenYear.percentChange;
    if (percent < -TREND_BAND_PERCENT) {
      sentences.push(
        `The latest figure is ${formatPercent(Math.abs(percent)).replace(/^[+−]/, "")} below the ten-year average of ${formatCount(context.tenYear.average)}.`,
      );
    } else if (percent > TREND_BAND_PERCENT) {
      sentences.push(
        `The latest figure is ${formatPercent(percent).replace(/^[+−]/, "")} above the ten-year average of ${formatCount(context.tenYear.average)}.`,
      );
    }
  } else if (
    context.vsFiveYear.state === "ok" &&
    context.vsFiveYear.percentChange !== null &&
    context.fiveYear.average !== null
  ) {
    const percent = context.vsFiveYear.percentChange;
    if (Math.abs(percent) > TREND_BAND_PERCENT) {
      sentences.push(
        `The latest figure is ${formatPercent(Math.abs(percent)).replace(/^[+−]/, "")} ${
          percent < 0 ? "below" : "above"
        } the five-year average of ${formatCount(context.fiveYear.average)}.`,
      );
    }
  }

  return sentences;
}

export function seriesForKey(
  records: readonly StationYearRecord[],
  key: string,
): { series: FeaturedSeries | null; points: SeriesPoint[] } {
  const series = FEATURED_SERIES.find((item) => item.key === key) ?? null;
  if (!series) return { series: null, points: [] };
  return { series, points: buildSeries(records, series) };
}
