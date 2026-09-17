import {
  CHANGE_HIGHLIGHT_COLUMNS,
  CRIME_CATEGORIES,
  CRIME_GROUPS,
  HEADLINE_COMMUNITY_COLUMNS,
  POLICE_ACTION_COLUMNS,
  TOTAL_SERIES_TOKEN,
  categoriesInGroup,
  categoryLabel,
  type CrimeGroupKey,
  type FeaturedSeries,
} from "@/lib/crime/taxonomy";
import {
  calculateChange,
  sumPreservingMissing,
  type CategoryChange,
  type Change,
} from "@/lib/metrics/change";

/**
 * Turns source records into the figures the interface displays.
 *
 * Nothing here invents or imputes a value. Where the source is missing a figure the result
 * carries a missing count so the interface can say the total is partial.
 */

/** One financial year of source counts for one station, keyed by source column name. */
export interface StationYearRecord {
  readonly financialYear: string;
  readonly financialYearStart: number;
  readonly counts: Readonly<Record<string, number | null>>;
}

export interface YearTotals {
  readonly financialYear: string;
  readonly financialYearStart: number;
  /** The 17 community-reported serious crimes. */
  readonly totalRecordedCrime: number | null;
  /** How many of the 17 the source did not provide. */
  readonly missingCategories: number;
  readonly groupTotals: Readonly<Record<CrimeGroupKey, number | null>>;
  readonly policeActionTotal: number | null;
}

export function buildYearTotals(record: StationYearRecord): YearTotals {
  const headline = sumPreservingMissing(
    HEADLINE_COMMUNITY_COLUMNS.map((column) => record.counts[column] ?? null),
  );

  const groupTotals = {} as Record<CrimeGroupKey, number | null>;
  for (const group of CRIME_GROUPS) {
    // Only headline categories contribute, so a parent total and its subcategories are
    // never added together.
    const columns = categoriesInGroup(group.key)
      .filter((c) => c.role === "headline" || c.role === "standalone")
      .map((c) => record.counts[c.name] ?? null);
    groupTotals[group.key] = sumPreservingMissing(columns).total;
  }

  const policeAction = sumPreservingMissing(
    POLICE_ACTION_COLUMNS.map((column) => record.counts[column] ?? null),
  );

  return {
    financialYear: record.financialYear,
    financialYearStart: record.financialYearStart,
    totalRecordedCrime: headline.total,
    missingCategories: headline.missingCount,
    groupTotals,
    policeActionTotal: policeAction.total,
  };
}

export interface SeriesPoint {
  readonly financialYear: string;
  readonly financialYearStart: number;
  readonly value: number | null;
  /** How many contributing source columns were missing for this year. */
  readonly missingCount: number;
}

/**
 * Build a chart series for one of the featured categories, oldest year first.
 */
export function buildSeries(
  records: readonly StationYearRecord[],
  series: FeaturedSeries,
): SeriesPoint[] {
  const ordered = [...records].sort(
    (a, b) => a.financialYearStart - b.financialYearStart,
  );

  return ordered.map((record) => {
    const columns = series.columns.includes(TOTAL_SERIES_TOKEN)
      ? HEADLINE_COMMUNITY_COLUMNS
      : series.columns;

    const { total, missingCount } = sumPreservingMissing(
      columns.map((column) => record.counts[column] ?? null),
    );

    return {
      financialYear: record.financialYear,
      financialYearStart: record.financialYearStart,
      value: total,
      missingCount,
    };
  });
}

export interface BreakdownRow {
  readonly column: string;
  readonly label: string;
  readonly group: CrimeGroupKey;
  readonly value: number | null;
  /** Share of total_recorded_crime, or null when either figure is unavailable. */
  readonly shareOfTotal: number | null;
  readonly hasSubcategories: boolean;
}

/**
 * Composition of recorded crime for one year, largest first.
 * Only the 17 community-reported serious crimes are included, so shares sum to 100%.
 */
export function buildBreakdown(record: StationYearRecord): BreakdownRow[] {
  const totals = buildYearTotals(record);
  const total = totals.totalRecordedCrime;

  return HEADLINE_COMMUNITY_COLUMNS.map((column) => {
    const category = CRIME_CATEGORIES.find((c) => c.name === column);
    const value = record.counts[column] ?? null;
    const shareOfTotal =
      value === null || total === null || total === 0
        ? null
        : Math.round((value / total) * 1000) / 10;

    return {
      column,
      label: categoryLabel(column),
      group: category?.group ?? "unclassified",
      value,
      shareOfTotal,
      hasSubcategories: CRIME_CATEGORIES.some((c) => c.parent === column),
    };
  }).sort((a, b) => {
    if (a.value === b.value) return a.label.localeCompare(b.label);
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return b.value - a.value;
  });
}

/**
 * Compare every highlightable category between two years.
 * Returns one entry per category regardless of whether the change is notable; filtering and
 * ranking is the caller's job via rankChanges.
 */
export function buildCategoryChanges(
  current: StationYearRecord,
  previous: StationYearRecord | null,
): CategoryChange[] {
  return CHANGE_HIGHLIGHT_COLUMNS.map((column) => {
    const change = calculateChange(
      current.counts[column] ?? null,
      previous ? previous.counts[column] ?? null : null,
    );
    return { ...change, column, label: categoryLabel(column) };
  });
}

/** Year-over-year change in total recorded crime. */
export function totalChange(
  current: StationYearRecord,
  previous: StationYearRecord | null,
): Change {
  const currentTotal = buildYearTotals(current).totalRecordedCrime;
  const previousTotal = previous ? buildYearTotals(previous).totalRecordedCrime : null;
  return calculateChange(currentTotal, previousTotal);
}

/**
 * Change in total recorded crime over five financial years, when a record exists for the year
 * five years earlier. No interpolation is performed if that year is absent.
 */
export function fiveYearChange(
  records: readonly StationYearRecord[],
  currentYearStart: number,
): { change: Change; comparisonYear: string | null } {
  const current = records.find((r) => r.financialYearStart === currentYearStart);
  const prior = records.find((r) => r.financialYearStart === currentYearStart - 5);

  if (!current) {
    return { change: calculateChange(null, null), comparisonYear: null };
  }

  const currentTotal = buildYearTotals(current).totalRecordedCrime;
  const priorTotal = prior ? buildYearTotals(prior).totalRecordedCrime : null;

  return {
    change: calculateChange(currentTotal, priorTotal),
    comparisonYear: prior?.financialYear ?? null,
  };
}
