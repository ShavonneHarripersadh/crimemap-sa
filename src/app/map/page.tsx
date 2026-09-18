import type { Metadata } from "next";

import { DataUnavailable } from "@/components/data/data-unavailable";
import { MapExplorer } from "@/components/map/map-explorer";
import { Note } from "@/components/ui/note";
import { Eyebrow, PageHeader } from "@/components/ui/section";
import { getAvailableFinancialYears } from "@/lib/data/aggregates";
import { mapCategories } from "@/lib/map/categories";

export const revalidate = 86_400;

export const metadata: Metadata = {
  title: "Map of recorded crime by police station",
  description:
    "An interactive map of recorded crime for every South African police station precinct, filterable by financial year and crime category.",
  alternates: { canonical: "/map" },
};

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
          safety score. Zoom in for each police station.
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
