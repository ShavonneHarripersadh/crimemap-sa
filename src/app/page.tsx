import { ArrowRight, BarChart3, Map as MapIcon, Scale } from "lucide-react";
import Link from "next/link";

import { TrendChart } from "@/components/charts/trend-chart";
import { ChangeIndicator } from "@/components/data/change-indicator";
import { DataUnavailable } from "@/components/data/data-unavailable";
import { StatCard } from "@/components/data/stat-card";
import { WhatsChanging } from "@/components/data/whats-changing";
import { SearchBox } from "@/components/search/search-box";
import { Card } from "@/components/ui/card";
import { Note } from "@/components/ui/note";
import { Eyebrow, Section } from "@/components/ui/section";
import {
  FINANCIAL_YEAR_EXPLANATION,
  previousFinancialYear,
} from "@/lib/crime/financial-year";
import { HEADLINE_COMMUNITY_COLUMNS } from "@/lib/crime/taxonomy";
import {
  getCategoryChanges,
  getNationalOverview,
  getNationalTrend,
  getProvinceOverviews,
} from "@/lib/data/aggregates";
import { formatCount } from "@/lib/format";

// Recorded crime changes once a year. Revalidating daily keeps the pages static and fast while
// still picking up a new data load without a redeploy.
export const revalidate = 86_400;

export default async function HomePage() {
  const [overview, trend, provinces, categories] = await Promise.all([
    getNationalOverview(),
    getNationalTrend(),
    getProvinceOverviews(),
    getCategoryChanges({}),
  ]);

  return (
    <div>
      <section className="hero-wash border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <Eyebrow>South African Police Service recorded crime</Eyebrow>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Crime statistics for every police station in South Africa
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
              Search any station, town, municipality or province to see what was recorded, how it
              has changed and which categories moved. Twenty-one financial years of official
              figures, from 2005/06 to{" "}
              {overview.ok ? overview.data.financialYear : "2025/26"}.
            </p>
          </div>

          <div className="mt-8 max-w-2xl">
            <SearchBox autoFocus />
            <p className="mt-3 text-sm text-muted">
              Try a station such as Hillbrow, a suburb such as Bromhof, a town, or a province.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/map"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium transition-colors hover:border-border-strong hover:bg-surface-hover"
            >
              <MapIcon className="size-4" aria-hidden />
              Explore the map
            </Link>
            <Link
              href="/compare"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium transition-colors hover:border-border-strong hover:bg-surface-hover"
            >
              <Scale className="size-4" aria-hidden />
              Compare two areas
            </Link>
            <Link
              href="/methodology"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-strong transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <BarChart3 className="size-4" aria-hidden />
              How the figures are calculated
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-16 sm:px-6 lg:px-8">
        <Section
          title="Recorded crime nationally"
          description={
            overview.ok
              ? `Totals across the ${HEADLINE_COMMUNITY_COLUMNS.length} community-reported serious crime categories for ${overview.data.financialYear}, compared with the year before.`
              : "Totals across the community-reported serious crime categories."
          }
        >
          {overview.ok ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label={`Recorded crimes, ${overview.data.financialYear}`}
                value={overview.data.totalRecordedCrime}
                change={overview.data.change}
                caption={`Across the ${HEADLINE_COMMUNITY_COLUMNS.length} community-reported serious crime categories.`}
              />
              <StatCard
                label="Police stations reporting"
                value={overview.data.stationsReporting}
                caption={`Of ${formatCount(overview.data.stationsTotal)} station precincts in the dataset.`}
              />
              <StatCard
                label="Financial year"
                value={overview.data.financialYear}
                caption={FINANCIAL_YEAR_EXPLANATION}
              />
            </div>
          ) : (
            <DataUnavailable error={overview.error} />
          )}
        </Section>

        <Section
          title="The national trend"
          description="Total recorded crime in each financial year the dataset covers. Where the source provides no figure for a year, the line breaks rather than dropping to zero."
        >
          {trend.ok && trend.data.length > 0 ? (
            <Card className="p-5">
              <TrendChart
                data={trend.data.map((point) => ({
                  financialYear: point.financialYear,
                  value: point.value,
                }))}
                label="Recorded crimes"
                height={340}
              />
              <p className="mt-4 text-xs leading-relaxed text-muted">
                The number of station precincts changes over time as stations are opened, closed or
                redrawn, so part of any national movement reflects a changing set of stations
                rather than a change in recorded crime alone.
              </p>
            </Card>
          ) : trend.ok ? (
            <Note>No crime records have been loaded yet, so there is no trend to show.</Note>
          ) : (
            <DataUnavailable error={trend.error} />
          )}
        </Section>

        <Section
          title="What changed nationally"
          description={
            overview.ok
              ? `Categories with the largest movements between ${previousFinancialYear(overview.data.financialYear)} and ${overview.data.financialYear}.`
              : undefined
          }
        >
          {categories.ok && overview.ok ? (
            <WhatsChanging
              changes={categories.data.changes}
              financialYear={overview.data.financialYear}
              previousFinancialYear={previousFinancialYear(overview.data.financialYear)}
            />
          ) : categories.ok ? (
            <Note>Load crime records to see which categories are changing.</Note>
          ) : (
            <DataUnavailable error={categories.error} />
          )}
        </Section>

        <Section
          title="Browse by province"
          description="Listed alphabetically. CrimeMap SA does not rank provinces; a larger total usually reflects a larger population rather than anything else."
        >
          {provinces.ok && provinces.data.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {provinces.data.map((province) => (
                <li key={province.slug}>
                  <Link
                    href={`/crime/${province.slug}`}
                    className="group flex h-full flex-col justify-between gap-4 rounded-xl border border-border bg-surface/80 p-5 transition-colors hover:border-border-strong hover:bg-surface-hover"
                  >
                    <div>
                      <p className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                        {province.name}
                        <ArrowRight
                          className="size-4 text-muted transition-transform group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </p>
                      <p className="tabular mt-3 text-2xl font-semibold tracking-tight">
                        {formatCount(province.totalRecordedCrime)}
                      </p>
                      <p className="mt-1">
                        <ChangeIndicator change={province.change} size="sm" />
                      </p>
                    </div>
                    <p className="text-xs text-muted">
                      {formatCount(province.stationsReporting)} of{" "}
                      {formatCount(province.stationsTotal)} stations reporting in{" "}
                      {province.financialYear}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : provinces.ok ? (
            <Note>No provinces are available until crime records have been loaded.</Note>
          ) : (
            <DataUnavailable error={provinces.error} />
          )}
        </Section>

        <Section title="What this is, and what it is not">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <p className="text-sm font-medium text-foreground">What CrimeMap SA shows</p>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                <li>Crimes recorded by police in each station precinct, by financial year.</li>
                <li>How each category has changed, with the figures behind the percentage.</li>
                <li>Where precincts are, and how areas compare on the same measure.</li>
                <li>Exactly which source column each figure comes from.</li>
              </ul>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-medium text-foreground">What it does not show</p>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                <li>Whether an area is safe or dangerous. That is not something these figures measure.</li>
                <li>Crime rates per person. The source has no population figures per precinct.</li>
                <li>Any forecast of future crime.</li>
                <li>Any ranking of areas, or any explanation of why a figure moved.</li>
              </ul>
            </Card>
          </div>
          <Note className="mt-4">
            Recorded crime is not the same as crime that happened. These figures count cases
            reported to and recorded by police, and reporting rates differ between areas and
            between categories.{" "}
            <Link href="/methodology">Read the methodology</Link> for what the data can and cannot
            support.
          </Note>
        </Section>
      </div>
    </div>
  );
}

