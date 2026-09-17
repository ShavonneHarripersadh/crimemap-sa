import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChangeIndicator } from "@/components/data/change-indicator";
import { DataUnavailable } from "@/components/data/data-unavailable";
import { Note } from "@/components/ui/note";
import { Eyebrow, PageHeader } from "@/components/ui/section";
import { getProvinceOverviews, getProvinceStations } from "@/lib/data/aggregates";
import { formatCount } from "@/lib/format";

export const revalidate = 86_400;

interface RouteParams {
  params: Promise<{ province: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { province } = await params;
  const overviews = await getProvinceOverviews();
  const match = overviews.ok
    ? overviews.data.find((item) => item.slug === province)
    : undefined;

  return {
    title: match ? `${match.name} recorded crime` : "Province not found",
    description: match
      ? `Recorded crime at police stations in ${match.name}.`
      : "Province not found.",
    alternates: { canonical: `/crime/${province}` },
  };
}

export default async function ProvincePage({ params }: RouteParams) {
  const { province } = await params;
  const [overviews, stations] = await Promise.all([
    getProvinceOverviews(),
    getProvinceStations(province),
  ]);

  if (!overviews.ok) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <DataUnavailable error={overviews.error} />
      </div>
    );
  }

  const overview = overviews.data.find((item) => item.slug === province);
  if (!overview) notFound();

  if (!stations.ok) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <DataUnavailable error={stations.error} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-foreground">{overview.name}</li>
        </ol>
      </nav>

      <PageHeader>
        <Eyebrow>Province</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{overview.name}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          {formatCount(overview.totalRecordedCrime)} recorded crimes in {overview.financialYear}{" "}
          across {overview.stationsReporting} of {overview.stationsTotal} stations. Listed
          alphabetically — this is not a ranking.
        </p>
      </PageHeader>

      <div className="mb-6">
        <ChangeIndicator change={overview.change} showAbsolute />
      </div>

      {stations.data.length === 0 ? (
        <Note>No station precincts are listed for this province in the loaded dataset.</Note>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {stations.data.map((station) => (
            <li key={station.slug}>
              <Link
                href={`/crime/${station.provinceSlug ?? province}/${station.slug}`}
                className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-3 hover:bg-surface-hover"
              >
                <span>
                  <span className="font-medium text-foreground">{station.name}</span>
                  {station.localMunicipality ? (
                    <span className="mt-0.5 block text-xs text-muted">
                      {station.localMunicipality}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-baseline gap-4">
                  <span className="tabular text-sm font-medium">
                    {formatCount(station.totalRecordedCrime)}
                  </span>
                  <ChangeIndicator change={station.change} size="sm" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
