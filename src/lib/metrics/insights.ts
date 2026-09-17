import { HEADLINE_COMMUNITY_COLUMNS } from "@/lib/crime/taxonomy";
import {
  rankChanges,
  trendDirection,
  type CategoryChange,
  type Change,
} from "@/lib/metrics/change";
import { formatCount, formatPercent } from "@/lib/format";

/**
 * Deterministic plain-English summaries.
 *
 * These are sentence templates filled from the numbers already computed elsewhere. The same
 * inputs always produce the same output. There is no model involved.
 *
 * What these sentences must never do, per the product rules:
 *   - draw conclusions about personal safety or risk of victimisation
 *   - predict or forecast anything
 *   - attribute a cause, including police performance or policy
 *   - offer political commentary
 *   - describe an area as safe, unsafe, best or worst
 *   - state anything not directly derivable from the recorded figures
 */

export interface Insight {
  readonly id: string;
  readonly text: string;
}

export interface InsightInput {
  readonly financialYear: string;
  readonly previousFinancialYear: string | null;
  readonly totalRecordedCrime: number | null;
  readonly previousTotalRecordedCrime: number | null;
  readonly missingCategories: number;
  readonly totalChange: Change;
  readonly categoryChanges: readonly CategoryChange[];
}

export function buildInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  insights.push(...totalSentence(input));

  const increases = rankChanges(input.categoryChanges, "increase", 1);
  const decreases = rankChanges(input.categoryChanges, "decrease", 1);
  const topIncrease = increases[0];
  const topDecrease = decreases[0];

  if (topIncrease && topDecrease) {
    insights.push({
      id: "mixed-categories",
      text:
        `${topIncrease.label} increased while ${lowerFirst(topDecrease.label)} decreased. ` +
        `${topIncrease.label} recorded the largest increase among the major categories, ` +
        `rising from ${formatCount(topIncrease.previous)} to ${formatCount(topIncrease.current)}.`,
    });
  } else if (topIncrease) {
    insights.push({
      id: "top-increase",
      text:
        `${topIncrease.label} recorded the largest increase among the major categories, ` +
        `rising from ${formatCount(topIncrease.previous)} to ${formatCount(topIncrease.current)} ` +
        `(${formatPercent(topIncrease.percentChange)}).`,
    });
  } else if (topDecrease) {
    insights.push({
      id: "top-decrease",
      text:
        `${topDecrease.label} recorded the largest decrease among the major categories, ` +
        `falling from ${formatCount(topDecrease.previous)} to ${formatCount(topDecrease.current)} ` +
        `(${formatPercent(topDecrease.percentChange)}).`,
    });
  } else if (input.previousFinancialYear) {
    insights.push({
      id: "no-notable-change",
      text:
        "No individual crime category changed by enough to be reported as a notable movement, " +
        "using CrimeMap SA's thresholds for the size of the change and the size of the previous year's count.",
    });
  }

  if (input.missingCategories > 0) {
    const reported = HEADLINE_COMMUNITY_COLUMNS.length - input.missingCategories;
    insights.push({
      id: "partial-total",
      text:
        `This total covers ${reported} of the ${HEADLINE_COMMUNITY_COLUMNS.length} community-reported ` +
        "serious crime categories. The source data does not provide a figure for the remaining " +
        `${input.missingCategories}, which are shown as not available rather than as zero.`,
    });
  }

  return insights;
}

function totalSentence(input: InsightInput): Insight[] {
  const { totalChange: change, financialYear, previousFinancialYear } = input;

  if (change.state === "unavailable" || previousFinancialYear === null) {
    if (input.totalRecordedCrime === null) {
      return [
        {
          id: "total",
          text: `The source data does not provide recorded crime figures for ${financialYear}.`,
        },
      ];
    }
    return [
      {
        id: "total",
        text:
          `${formatCount(input.totalRecordedCrime)} crimes in the 17 community-reported serious crime ` +
          `categories were recorded in ${financialYear}. There is no earlier year available for comparison.`,
      },
    ];
  }

  const direction = trendDirection(change);

  const directionPhrase =
    direction === "increase"
      ? "increased"
      : direction === "decrease"
        ? "decreased"
        : "was broadly unchanged";

  const magnitude =
    change.state === "ok" && change.percentChange !== null && direction !== "broadly_unchanged"
      ? ` by ${formatPercent(change.percentChange).replace(/^[+−]/, "")}`
      : "";

  return [
    {
      id: "total",
      text:
        `Recorded crime ${directionPhrase}${magnitude} in ${financialYear} compared with ` +
        `${previousFinancialYear}, from ${formatCount(change.previous)} to ${formatCount(change.current)} ` +
        "recorded crimes across the 17 community-reported serious crime categories.",
    },
  ];
}

function lowerFirst(value: string): string {
  const first = value.charAt(0);
  // Keep acronyms and proper nouns intact; only lowercase an ordinary capitalised word.
  if (value.length > 1 && value.charAt(1) === value.charAt(1).toUpperCase()) return value;
  return first.toLowerCase() + value.slice(1);
}
