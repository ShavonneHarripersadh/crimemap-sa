import Link from "next/link";

import { ChangeIndicator } from "@/components/data/change-indicator";
import { DataUnavailable } from "@/components/data/data-unavailable";
import { MapExplorer } from "@/components/map/map-explorer";
import { SearchBox } from "@/components/search/search-box";
import { Note } from "@/components/ui/note";
import {
  getAvailableFinancialYears,
  getNationalOverview,
  getProvinceOverviews,
} from "@/lib/data/aggregates";
import { formatCount } from "@/lib/format";
import { mapCategories } from "@/lib/map/categories";

export const revalidate = 86_400;

export default async function HomePage() {
  const [years, overview, provinces] = await Promise.all([
    getAvailableFinancialYears(),
    getNationalOverview(),
    getProvinceOverviews(),
  ]);

  const latestYear = overview.ok ? overview.data.financialYear : (years.ok ? years.data[0]?.financialYear : null);

  return (
    <div>
      <section className="hero-wash">
        <div className="mx-auto max-w-7xl px-4 pt-10 pb-6 sm:px-6 lg:px-8">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            Crime where you live
          </h1>
          <p className="mt-3 max-w-xl text-base text-muted sm:text-lg">
            Search a station, suburb or town. Then read the map.
          </p>
          <div className="mt-6 max-w-xl">
            <SearchBox autoFocus placeholder="Hillbrow, Bromhof, Randburg…" />
          </div>
          {overview.ok ? (
            <p className="mt-4 text-sm text-muted">
              <span className="tabular font-medium text-foreground">
                {formatCount(overview.data.totalRecordedCrime)}
              </span>{" "}
              recorded cases in {overview.data.financialYear}
              <span className="mx-2 text-border-strong">·</span>
              <ChangeIndicator change={overview.data.change} size="sm" />
              <span className="mx-2 text-border-strong">·</span>
              <Link href="/compare" className="text-accent hover:underline">
                Compare areas
              </Link>
            </p>
          ) : null}
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {years.ok && years.data.length > 0 ? (
            <MapExplorer
              years={years.data.map((year) => year.financialYear)}
              categories={mapCategories()}
              initialYear={latestYear ?? years.data[0]?.financialYear ?? null}
              initialCategory="total_recorded_crime"
              detail={false}
            />
          ) : years.ok ? (
            <Note>No crime records have been loaded yet, so there is nothing to map.</Note>
          ) : (
            <DataUnavailable error={years.error} />
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Provinces</h2>
        {provinces.ok && provinces.data.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {provinces.data.map((province) => (
              <li key={province.slug}>
                <Link
                  href={`/crime/${province.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5 text-sm transition-colors hover:border-border-strong hover:bg-surface-hover"
                >
                  {province.name}
                  <span className="tabular text-muted">{formatCount(province.totalRecordedCrime)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : provinces.ok ? (
          <Note>No provinces are available until crime records have been loaded.</Note>
        ) : (
          <DataUnavailable error={provinces.error} />
        )}

        <p className="mt-8 max-w-2xl text-sm text-muted">
          These are crimes recorded by the police, not everything that happened, and not a safety
          score.{" "}
          <Link href="/methodology" className="text-accent hover:underline">
            How the figures work
          </Link>
        </p>
      </div>
    </div>
  );
}
