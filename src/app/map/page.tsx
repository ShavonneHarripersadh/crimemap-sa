import type { Metadata } from "next";

import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { DataUnavailable } from "@/components/data/data-unavailable";
import { MapExplorer } from "@/components/map/map-explorer";
import { Note } from "@/components/ui/note";
import { Eyebrow, PageHeader } from "@/components/ui/section";
import { getAvailableFinancialYears } from "@/lib/data/aggregates";
import { mapCategories } from "@/lib/map/categories";

export const revalidate = 86_400;

export const metadata: Metadata = {
  title: { absolute: "South African Crime Map | CrimeMap SA" },
  description:
    "Map of recorded crime for South African police station precincts, by financial year and crime category. Colour shows the count, not a safety rating.",
  alternates: { canonical: "/map" },
  openGraph: {
    title: "South African Crime Map | CrimeMap SA",
    description:
      "Recorded crime for South African police station precincts, by financial year and crime category.",
    url: "/map",
  },
};

export default async function MapPage() {
  const years = await getAvailableFinancialYears();
  const categories = mapCategories();

  return (
    <div className="map-page mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <TrackOnMount event="map_viewed" />
      <PageHeader>
        <Eyebrow>Map</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Recorded crime across South Africa
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          The map starts in a simple view of how many cases were recorded. Colour follows that
          count. It does not mark a place as safe or dangerous. Zoom in for each police station.
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
