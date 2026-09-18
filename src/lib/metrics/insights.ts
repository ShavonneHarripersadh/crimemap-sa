import { HEADLINE_COMMUNITY_COLUMNS } from "@/lib/crime/taxonomy";
import {
  isHighlightableChange,
  rankChanges,
  trendDirection,
  TREND_BAND_PERCENT,
  type CategoryChange,
  type Change,
} from "@/lib/metrics/change";
import { formatCount, formatPercent } from "@/lib/format";
import type { HistoricalContext, UnusualMovement } from "@/lib/metrics/history";
import { historicalContextSentences } from "@/lib/metrics/history";
import type { BreakdownRow } from "@/lib/metrics/profile";

/**
 * Deterministic, evidence-backed observations.
 *
 * Each insight is a sentence template filled from a named calculation. The same inputs always
 * produce the same output. There is no model involved, and no insight is emitted without the
 * underlying figure.
 *
 * These sentences must never:
 *   - draw conclusions about personal safety or risk of victimisation
 *   - predict or forecast anything
 *   - attribute a cause, including police performance or policy
 *   - offer political commentary
 *   - describe an area as safe, unsafe, best or worst
 *   - state anything not directly derivable from the recorded figures
 */

export type InsightType =
  | "yoy_movement"
  | "historical_high"
  | "historical_low"
  | "unusual_movement"
  | "category_composition"
  | "long_term_trend"
  | "category_movement";

export interface Insight {
  readonly id: string;
  readonly type: InsightType;
  readonly text: string;
  readonly entityId: string;
  readonly category: string;
  readonly period: string;
  readonly value: number | null;
  readonly comparisonPeriod: string | null;
  readonly comparisonValue: number | null;
  readonly sourceField: string;
  readonly calculation: string;
  readonly priority: number;
}

export interface InsightInput {
  readonly entityId: string;
  readonly financialYear: string;
  readonly previousFinancialYear: string | null;
  readonly totalRecordedCrime: number | null;
  readonly previousTotalRecordedCrime: number | null;
  readonly missingCategories: number;
  readonly totalChange: Change;
  readonly categoryChanges: readonly CategoryChange[];
  readonly historical: HistoricalContext;
  readonly unusual: UnusualMovement;
  readonly breakdown: readonly BreakdownRow[];
}

/** Keep the list short. Empty is allowed — the page still shows the figures. */
export const MAX_INSIGHTS = 4;

const PRIORITY = {
  yoy_movement: 1,
  historical_high: 2,
  historical_low: 2,
  unusual_movement: 3,
  category_composition: 4,
  long_term_trend: 5,
  category_movement: 6,
} as const;

export function buildInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [
    ...yoyInsight(input),
    ...historicalExtremeInsights(input),
    ...unusualInsight(input),
    ...compositionInsight(input),
    ...longTermInsight(input),
    ...categoryMovementInsight(input),
  ];

  const seen = new Set<InsightType>();
  const selected: Insight[] = [];

  for (const insight of insights.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
    if (selected.length >= MAX_INSIGHTS) break;
    // One observation per type keeps the list from repeating the same fact.
    if (seen.has(insight.type)) continue;
    seen.add(insight.type);
    selected.push(insight);
  }

  return selected;
}

function yoyInsight(input: InsightInput): Insight[] {
  const { totalChange: change, financialYear, previousFinancialYear, entityId } = input;
  if (!previousFinancialYear) return [];

  const direction = trendDirection(change);
  if (change.state !== "ok" || change.percentChange === null) return [];
  if (direction === "broadly_unchanged") return [];
  if (!isHighlightableChange(change)) return [];

  const directionPhrase = direction === "increase" ? "increased" : "decreased";
  const magnitude = formatPercent(change.percentChange).replace(/^[+−]/, "");

  return [
    {
      id: "yoy_movement",
      type: "yoy_movement",
      text: `Recorded crime ${directionPhrase} ${magnitude} year-on-year, from ${formatCount(change.previous)} in ${previousFinancialYear} to ${formatCount(change.current)} in ${financialYear}.`,
      entityId,
      category: "total_recorded_crime",
      period: financialYear,
      value: change.current,
      comparisonPeriod: previousFinancialYear,
      comparisonValue: change.previous,
      sourceField: "total_recorded_crime",
      calculation: "year_on_year_percent",
      priority: PRIORITY.yoy_movement,
    },
  ];
}

function historicalExtremeInsights(input: InsightInput): Insight[] {
  const { historical, entityId } = input;
  if (historical.latestValue === null) return [];

  if (historical.rangeRelation === "historical_low" && historical.extremes.low) {
    return [
      {
        id: "historical_low",
        type: "historical_low",
        text: `The latest figure is the lowest recorded in the available dataset (${formatCount(historical.extremes.low.value)} in ${historical.extremes.low.financialYear}).`,
        entityId,
        category: "total_recorded_crime",
        period: historical.latestYear,
        value: historical.latestValue,
        comparisonPeriod: null,
        comparisonValue: null,
        sourceField: "total_recorded_crime",
        calculation: "minimum",
        priority: PRIORITY.historical_low,
      },
    ];
  }

  if (historical.rangeRelation === "historical_high" && historical.extremes.high) {
    return [
      {
        id: "historical_high",
        type: "historical_high",
        text: `The latest figure is the highest recorded in the available dataset (${formatCount(historical.extremes.high.value)} in ${historical.extremes.high.financialYear}).`,
        entityId,
        category: "total_recorded_crime",
        period: historical.latestYear,
        value: historical.latestValue,
        comparisonPeriod: null,
        comparisonValue: null,
        sourceField: "total_recorded_crime",
        calculation: "maximum",
        priority: PRIORITY.historical_high,
      },
    ];
  }

  return [];
}

function unusualInsight(input: InsightInput): Insight[] {
  const { unusual, entityId, financialYear } = input;
  if (
    unusual.classification !== "notable" &&
    unusual.classification !== "largest_increase" &&
    unusual.classification !== "largest_decrease"
  ) {
    return [];
  }

  const label =
    unusual.classification === "largest_increase"
      ? "Recorded crime recorded its largest annual increase in the available dataset."
      : unusual.classification === "largest_decrease"
        ? "Recorded crime recorded its largest annual decrease in the available dataset."
        : unusual.reason;

  const text =
    unusual.classification === "notable"
      ? unusual.reason
      : `${label} ${unusual.reason}`;

  return [
    {
      id: `unusual_${unusual.classification}`,
      type: "unusual_movement",
      text,
      entityId,
      category: "total_recorded_crime",
      period: unusual.latest?.financialYear ?? financialYear,
      value: unusual.latest?.value ?? null,
      comparisonPeriod: unusual.latest?.previousYear ?? null,
      comparisonValue: unusual.latest?.previousValue ?? null,
      sourceField: "total_recorded_crime",
      calculation: unusual.classification,
      priority: PRIORITY.unusual_movement,
    },
  ];
}

function compositionInsight(input: InsightInput): Insight[] {
  const largest = input.breakdown.find((row) => row.value !== null && row.shareOfTotal !== null);
  if (!largest || largest.shareOfTotal === null || largest.shareOfTotal < 20) return [];

  return [
    {
      id: "category_composition",
      type: "category_composition",
      text: `${largest.label} accounted for ${largest.shareOfTotal.toFixed(1)}% of recorded incidents in ${input.financialYear} (${formatCount(largest.value)} of ${formatCount(input.totalRecordedCrime)}).`,
      entityId: input.entityId,
      category: largest.column,
      period: input.financialYear,
      value: largest.value,
      comparisonPeriod: null,
      comparisonValue: input.totalRecordedCrime,
      sourceField: largest.column,
      calculation: "share_of_total",
      priority: PRIORITY.category_composition,
    },
  ];
}

function longTermInsight(input: InsightInput): Insight[] {
  const extra = historicalContextSentences(input.historical).filter((sentence) => {
    if (input.historical.rangeRelation === "historical_high") return !sentence.includes("highest");
    if (input.historical.rangeRelation === "historical_low") return !sentence.includes("lowest");
    return true;
  });

  const text = extra[0];
  if (!text) return [];
  if (
    input.historical.vsTenYear.state !== "ok" ||
    input.historical.vsTenYear.percentChange === null ||
    Math.abs(input.historical.vsTenYear.percentChange) <= TREND_BAND_PERCENT
  ) {
    if (
      input.historical.vsFiveYear.state !== "ok" ||
      input.historical.vsFiveYear.percentChange === null ||
      Math.abs(input.historical.vsFiveYear.percentChange) <= TREND_BAND_PERCENT
    ) {
      return [];
    }
  }

  return [
    {
      id: "long_term_trend",
      type: "long_term_trend",
      text,
      entityId: input.entityId,
      category: "total_recorded_crime",
      period: input.financialYear,
      value: input.historical.latestValue,
      comparisonPeriod: input.historical.tenYear.toYear,
      comparisonValue: input.historical.tenYear.average,
      sourceField: "total_recorded_crime",
      calculation:
        input.historical.vsTenYear.state === "ok" ? "vs_ten_year_average" : "vs_five_year_average",
      priority: PRIORITY.long_term_trend,
    },
  ];
}

function categoryMovementInsight(input: InsightInput): Insight[] {
  const increases = rankChanges(input.categoryChanges, "increase", 1);
  const decreases = rankChanges(input.categoryChanges, "decrease", 1);
  const topIncrease = increases[0];
  const topDecrease = decreases[0];

  if (topIncrease && topDecrease) {
    return [
      {
        id: "category_movement",
        type: "category_movement",
        text: `${topIncrease.label} increased ${formatPercent(topIncrease.percentChange)} while ${lowerFirst(topDecrease.label)} decreased ${formatPercent(topDecrease.percentChange)}.`,
        entityId: input.entityId,
        category: topIncrease.column,
        period: input.financialYear,
        value: topIncrease.current,
        comparisonPeriod: input.previousFinancialYear,
        comparisonValue: topIncrease.previous,
        sourceField: topIncrease.column,
        calculation: "rank_highlightable_category_changes",
        priority: PRIORITY.category_movement,
      },
    ];
  }

  if (topIncrease) {
    return [
      {
        id: "category_movement",
        type: "category_movement",
        text: `${topIncrease.label} recorded the largest increase among the major categories, from ${formatCount(topIncrease.previous)} to ${formatCount(topIncrease.current)} (${formatPercent(topIncrease.percentChange)}).`,
        entityId: input.entityId,
        category: topIncrease.column,
        period: input.financialYear,
        value: topIncrease.current,
        comparisonPeriod: input.previousFinancialYear,
        comparisonValue: topIncrease.previous,
        sourceField: topIncrease.column,
        calculation: "rank_highlightable_category_changes",
        priority: PRIORITY.category_movement,
      },
    ];
  }

  if (topDecrease) {
    return [
      {
        id: "category_movement",
        type: "category_movement",
        text: `${topDecrease.label} recorded the largest decrease among the major categories, from ${formatCount(topDecrease.previous)} to ${formatCount(topDecrease.current)} (${formatPercent(topDecrease.percentChange)}).`,
        entityId: input.entityId,
        category: topDecrease.column,
        period: input.financialYear,
        value: topDecrease.current,
        comparisonPeriod: input.previousFinancialYear,
        comparisonValue: topDecrease.previous,
        sourceField: topDecrease.column,
        calculation: "rank_highlightable_category_changes",
        priority: PRIORITY.category_movement,
      },
    ];
  }

  return [];
}

function lowerFirst(value: string): string {
  const first = value.charAt(0);
  if (value.length > 1 && value.charAt(1) === value.charAt(1).toUpperCase()) return value;
  return first.toLowerCase() + value.slice(1);
}

export function missingTotalNote(missingCategories: number): string | null {
  if (missingCategories <= 0) return null;
  const reported = HEADLINE_COMMUNITY_COLUMNS.length - missingCategories;
  return `This total covers ${reported} of the ${HEADLINE_COMMUNITY_COLUMNS.length} community-reported serious crime categories. The source data does not provide a figure for the remaining ${missingCategories}, which are shown as not available rather than as zero.`;
}
