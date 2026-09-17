import type { Metadata } from "next";

import { DataUnavailable } from "@/components/data/data-unavailable";
import { MapExplorer, type MapCategoryOption } from "@/components/map/map-explorer";
import { Note } from "@/components/ui/note";
import { Eyebrow, PageHeader } from "@/components/ui/section";
import { CRIME_CATEGORIES, HEADLINE_COMMUNITY_COLUMNS } from "@/lib/crime/taxonomy";
import { getAvailableFinancialYears } from "@/lib/data/aggregates";

export const revalidate = 86_400;

export const metadata: Metadata = {
  title: "Map of recorded crime by police station",
  description:
    "An interactive map of recorded crime for every South African police station precinct, filterable by financial year and crime category.",
  alternates: { canonical: "/map" },
};

/**
 * Categories offered on the map.
 *
 * The headline total plus the 17 community-reported crimes. Subcategories are excluded because
 * mapping both a parent and its subcategory invites the reader to add them together.
 */
function mapCategories(): MapCategoryOption[] {
  const options: MapCategoryOption[] = [
    {
      value: "total_recorded_crime",
      label: "All recorded crime",
      definition:
        "The sum of the 17 community-reported serious crime categories. Crimes detected through police action, such as drug offences, are excluded because they largely reflect police activity.",
    },
  ];

  for (const column of HEADLINE_COMMUNITY_COLUMNS) {
    const category = CRIME_CATEGORIES.find((item) => item.name === column);
    if (!category) continue;

    const hasSubcategories = CRIME_CATEGORIES.some((item) => item.parent === column);

    options.push({
      value: column,
      label: category.shortLabel,
      definition: hasSubcategories
        ? `Cases the source records as ${category.label.toLowerCase()}. This figure already includes the subcategories the source reports separately, which are not offered here so that a case is never counted twice.`
        : `Cases the source records as ${category.label.toLowerCase()}.`,
    });
  }

  return options;
}

export default async function MapPage() {
  const years = await getAvailableFinancialYears();
  const categories = mapCategories();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader>
        <Eyebrow>Explore geographically</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Recorded crime across South Africa
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          Zoomed out, each local municipality is coloured by how many cases were recorded there in
          the year you choose. Green is fewer cases, red is more. Colour is recorded volume, not a
          safety score. Zoom in for each police station. There are no official precinct outlines in
          the source file.
        </p>
      </PageHeader>

      {years.ok && years.data.length > 0 ? (
        <MapExplorer
          years={years.data.map((year) => year.financialYear)}
          categories={categories}
          initialYear={years.data[0]?.financialYear ?? null}
          initialCategory="total_recorded_crime"
        />
      ) : years.ok ? (
        <Note>
          No crime records have been loaded yet, so there are no station precincts to map.
        </Note>
      ) : (
        <DataUnavailable error={years.error} />
      )}
    </div>
  );
}
