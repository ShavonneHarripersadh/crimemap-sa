import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-unavailable";
import { StationHeader, StationProfile } from "@/components/profile/station-profile";
import { PageHeader } from "@/components/ui/section";
import { getStationProfileBySlug } from "@/lib/data/stations";
import { buildYearTotals } from "@/lib/metrics/profile";
import { formatCount } from "@/lib/format";

export const revalidate = 86_400;

interface RouteParams {
  params: Promise<{ province: string; area: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { province, area } = await params;
  const result = await getStationProfileBySlug(area);

  if (!result.ok) {
    return { title: "Area not found" };
  }

  const { station, records } = result.data;
  const latest = [...records].sort((a, b) => a.financialYearStart - b.financialYearStart).at(-1);
  const total = latest ? buildYearTotals(latest).totalRecordedCrime : null;

  const where = [station.localMunicipality, station.provinceName].filter(Boolean).join(", ");

  return {
    title: `${station.name} crime statistics`,
    description: latest
      ? `${formatCount(total)} crimes were recorded in the ${station.name} police precinct${where ? ` in ${where}` : ""} in ${latest.financialYear}. Explore the trend since ${records[0]?.financialYear}, the breakdown by category and what changed.`
      : `Recorded crime statistics for the ${station.name} police precinct.`,
    alternates: { canonical: `/crime/${province}/${area}` },
    openGraph: {
      title: `${station.name} crime statistics`,
      description: `Recorded crime in the ${station.name} police precinct${where ? `, ${where}` : ""}.`,
    },
  };
}

export default async function AreaPage({ params }: RouteParams) {
  const { province, area } = await params;
  const result = await getStationProfileBySlug(area);

  if (!result.ok) {
    if (result.error.kind === "not_found") notFound();
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <DataUnavailable error={result.error} />
      </div>
    );
  }

  const { station } = result.data;

  // Keep one canonical URL per precinct: if the province in the URL is not the one the data
  // gives for this station, send the reader to the right address rather than serving a duplicate.
  if (station.provinceSlug && station.provinceSlug !== province) {
    redirect(`/crime/${station.provinceSlug}/${station.slug}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          <li aria-hidden>/</li>
          {station.provinceSlug && station.provinceName ? (
            <>
              <li>
                <Link href={`/crime/${station.provinceSlug}`} className="hover:text-foreground">
                  {station.provinceName}
                </Link>
              </li>
              <li aria-hidden>/</li>
            </>
          ) : null}
          <li aria-current="page" className="text-foreground">
            {station.name}
          </li>
        </ol>
      </nav>

      <PageHeader>
        <StationHeader profile={result.data} />
      </PageHeader>

      <StationProfile profile={result.data} />

      <div className="mt-14 rounded-xl border border-border bg-surface/60 p-5">
        <p className="text-sm font-medium">Compare this area with another</p>
        <p className="mt-1.5 text-sm text-muted">
          Put {station.name} side by side with up to two other precincts on the same measures.
        </p>
        <Link
          href={`/compare?areas=${station.slug}`}
          className="mt-3 inline-block rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition-colors hover:border-border-strong hover:bg-surface-hover"
        >
          Open the comparison
        </Link>
      </div>
    </div>
  );
}
