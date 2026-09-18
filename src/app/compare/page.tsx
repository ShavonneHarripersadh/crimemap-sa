import type { Metadata } from "next";

import { ComparePicker } from "@/components/compare/compare-picker";
import { CompareTable } from "@/components/compare/compare-table";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { DataUnavailable } from "@/components/data/data-unavailable";
import { Note } from "@/components/ui/note";
import { Eyebrow, PageHeader } from "@/components/ui/section";
import { getStationProfilesBySlugs } from "@/lib/data/stations";

export const revalidate = 86_400;

export const metadata: Metadata = {
  title: "Compare recorded crime across police stations",
  description:
    "Put two or three South African police station precincts side by side on the same recorded-crime measures. CrimeMap SA does not rank areas.",
  alternates: { canonical: "/compare" },
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseAreaSlugs(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const seen = new Set<string>();
  const slugs: string[] = [];

  for (const part of value.split(",")) {
    const slug = part.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
    if (slugs.length === 3) break;
  }

  return slugs;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ areas?: string | string[] }>;
}) {
  const slugs = parseAreaSlugs((await searchParams).areas);
  const result = await getStationProfilesBySlugs(slugs);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <PageHeader>
          <Eyebrow>Compare</Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Compare police station precincts
          </h1>
        </PageHeader>
        <DataUnavailable error={result.error} />
      </div>
    );
  }

  const selected = result.data.map((profile) => ({
    slug: profile.station.slug,
    name: profile.station.name,
    href: profile.station.provinceSlug
      ? `/crime/${profile.station.provinceSlug}/${profile.station.slug}`
      : `/station/${profile.station.slug}`,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader>
        <Eyebrow>Compare</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Compare police station precincts
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          Choose two or three stations to see the same recorded-crime measures side by side.
          Larger totals usually reflect larger precincts. This is not a ranking and not a safety
          score.
        </p>
      </PageHeader>

      <ComparePicker selected={selected} />

      {result.data.length >= 2 ? <TrackOnMount event="comparison_viewed" /> : null}

      <div className="mt-8">
        <CompareTable profiles={result.data} />
      </div>

      {slugs.length > 0 && result.data.length < slugs.length ? (
        <Note tone="caution" className="mt-4">
          One or more of the station names in the address were not found, so they were left out of
          the table.
        </Note>
      ) : null}
    </div>
  );
}
