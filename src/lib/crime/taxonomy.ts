import taxonomyJson from "../../../data/reference/crime_taxonomy.json";

/**
 * Typed access to data/reference/crime_taxonomy.json.
 *
 * That JSON file is the single source of truth for crime grouping and is read by both this
 * module and the Python pipeline, so the two can never disagree about which source column
 * belongs to which group or which columns are totals that already contain other columns.
 */

export type CrimeGroupKey =
  | "contact"
  | "contact_related"
  | "property_related"
  | "other_serious"
  | "police_action"
  | "unclassified";

export type CrimeRole = "headline" | "subcategory" | "standalone";

export interface CrimeCategory {
  /** Source column name in crime_records. */
  readonly name: string;
  /** SAPS wording, used where precision matters. */
  readonly label: string;
  /** Shorter wording for charts and cards. */
  readonly shortLabel: string;
  /** The label used by the source dataset itself. */
  readonly sourceLabel: string;
  readonly group: CrimeGroupKey;
  readonly role: CrimeRole;
  /** Source column of the parent total, for subcategories. */
  readonly parent: string | null;
  readonly note?: string;
}

export interface CrimeGroup {
  readonly key: CrimeGroupKey;
  readonly label: string;
  readonly description: string;
  readonly inSeventeenCommunityReported: boolean;
}

interface RawCategory {
  name: string;
  label: string;
  short_label: string;
  source_label: string;
  group: string;
  role: string;
  parent: string | null;
  note?: string;
}

const raw = taxonomyJson as unknown as {
  groups: Record<
    string,
    { label: string; description: string; in_17_community_reported: boolean }
  >;
  categories: RawCategory[];
  aggregates: Record<string, { label: string; definition: string; components?: string[] }>;
  featured_series: Record<
    string,
    { label: string; columns: string[]; composite: boolean; definition: string }
  >;
  consistency_checks: {
    id: string;
    total: string;
    parts: string[];
    severity: string;
    description: string;
    /** "equals" requires total == sum(parts); "contains" requires total >= sum(parts). */
    mode?: string;
    /** When set, the check does not apply to financial years starting before this year. */
    applies_from_financial_year_start?: number;
  }[];
};

export const CRIME_CATEGORIES: readonly CrimeCategory[] = raw.categories.map((c) => ({
  name: c.name,
  label: c.label,
  shortLabel: c.short_label,
  sourceLabel: c.source_label,
  group: c.group as CrimeGroupKey,
  role: c.role as CrimeRole,
  parent: c.parent,
  ...(c.note === undefined ? {} : { note: c.note }),
}));

export const CRIME_GROUPS: readonly CrimeGroup[] = Object.entries(raw.groups).map(
  ([key, value]) => ({
    key: key as CrimeGroupKey,
    label: value.label,
    description: value.description,
    inSeventeenCommunityReported: value.in_17_community_reported,
  }),
);

const categoriesByName = new Map(CRIME_CATEGORIES.map((c) => [c.name, c]));

export function getCategory(name: string): CrimeCategory | undefined {
  return categoriesByName.get(name);
}

export function categoryLabel(name: string): string {
  return categoriesByName.get(name)?.shortLabel ?? name;
}

export function groupLabel(key: CrimeGroupKey): string {
  return CRIME_GROUPS.find((g) => g.key === key)?.label ?? key;
}

/** Every source offence column, in taxonomy order. */
export const ALL_CRIME_COLUMNS: readonly string[] = CRIME_CATEGORIES.map((c) => c.name);

/**
 * The 17 community-reported serious crimes. Summing exactly these gives
 * total_recorded_crime with no double counting.
 */
export const HEADLINE_COMMUNITY_COLUMNS: readonly string[] = CRIME_CATEGORIES.filter(
  (c) =>
    c.role === "headline" &&
    c.group !== "police_action" &&
    c.group !== "unclassified",
).map((c) => c.name);

/** The four crimes detected as a result of police action. */
export const POLICE_ACTION_COLUMNS: readonly string[] = CRIME_CATEGORIES.filter(
  (c) => c.group === "police_action",
).map((c) => c.name);

/**
 * Categories eligible for the "What's changing?" panel.
 *
 * Restricted to the 17 community-reported serious crimes plus categories the source records
 * outside the 17 and the 4. Subcategories are excluded because they are already counted inside
 * their parent, and crimes detected as a result of police action are excluded because a change
 * there reflects police activity rather than what the public reported.
 */
export const CHANGE_HIGHLIGHT_COLUMNS: readonly string[] = CRIME_CATEGORIES.filter(
  (c) =>
    (c.role === "headline" && c.group !== "police_action") || c.role === "standalone",
).map((c) => c.name);

export function subcategoriesOf(parentName: string): readonly CrimeCategory[] {
  return CRIME_CATEGORIES.filter((c) => c.parent === parentName);
}

export function categoriesInGroup(group: CrimeGroupKey): readonly CrimeCategory[] {
  return CRIME_CATEGORIES.filter((c) => c.group === group);
}

// --- Aggregate definitions, surfaced on /methodology --------------------------

export interface AggregateDefinition {
  readonly key: string;
  readonly label: string;
  readonly definition: string;
  readonly components?: readonly string[];
}

export const AGGREGATE_DEFINITIONS: readonly AggregateDefinition[] = Object.entries(
  raw.aggregates,
).map(([key, value]) => ({
  key,
  label: value.label,
  definition: value.definition,
  ...(value.components === undefined ? {} : { components: value.components }),
}));

// --- Trend chart category selector -------------------------------------------

export const TOTAL_SERIES_TOKEN = "__total_recorded_crime__";

export interface FeaturedSeries {
  readonly key: string;
  readonly label: string;
  /** Source columns to sum, or TOTAL_SERIES_TOKEN for the headline total. */
  readonly columns: readonly string[];
  /** True when CrimeMap SA groups several source columns rather than using one directly. */
  readonly composite: boolean;
  readonly definition: string;
}

export const FEATURED_SERIES: readonly FeaturedSeries[] = Object.entries(
  raw.featured_series,
)
  .filter(([key]) => key !== "$comment")
  .map(([key, value]) => ({
    key,
    label: value.label,
    columns: value.columns,
    composite: value.composite,
    definition: value.definition,
  }));

export function getFeaturedSeries(key: string): FeaturedSeries | undefined {
  return FEATURED_SERIES.find((s) => s.key === key);
}

/**
 * Featured-series key that best represents a source column on charts and category pages.
 * Headline totals stay on "all"; a column that belongs to a CrimeMap SA grouping (robbery,
 * burglary, assault) maps to that grouping rather than to a single source column.
 */
export function featuredSeriesKeyForColumn(column: string): string {
  if (column === "total_recorded_crime") return "all";
  const grouped = FEATURED_SERIES.find(
    (series) =>
      series.key !== "all" &&
      !series.columns.includes(TOTAL_SERIES_TOKEN) &&
      series.columns.includes(column),
  );
  if (grouped) return grouped.key;
  if (FEATURED_SERIES.some((series) => series.key === column)) return column;
  return "all";
}

/**
 * Categories with a dedicated deep-dive page: featured groupings plus any headline source
 * column that is not already covered by a grouping.
 */
export function explorableCategories(): FeaturedSeries[] {
  const featured = FEATURED_SERIES.filter((series) => series.key !== "all");
  const covered = new Set(featured.flatMap((series) => series.columns));
  const extras: FeaturedSeries[] = HEADLINE_COMMUNITY_COLUMNS.filter(
    (column) => !covered.has(column),
  ).flatMap((column) => {
    const category = getCategory(column);
    if (!category) return [];
    return [
      {
        key: column,
        label: category.shortLabel,
        columns: [column],
        composite: false,
        definition: `Cases the source records as ${category.label.toLowerCase()}.`,
      },
    ];
  });

  return [...featured, ...extras];
}

export function getExplorableCategory(slug: string): FeaturedSeries | undefined {
  return explorableCategories().find((series) => series.key === slug);
}

export const CONSISTENCY_CHECKS = raw.consistency_checks;
