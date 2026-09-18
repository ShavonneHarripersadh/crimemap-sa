import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-unavailable";
import { StationHeader, StationProfile } from "@/components/profile/station-profile";
import { PageHeader } from "@/components/ui/section";
import { getNearbyStations, getStationProfileBySlug } from "@/lib/data/stations";
import {
  buildHistoricalContext,
  totalSeries,
} from "@/lib/metrics/history";
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
  const historical = latest ? buildHistoricalContext(totalSeries(records)) : null;

  const where = [station.localMunicipality, station.provinceName].filter(Boolean).join(", ");
  const historyClause =
    historical?.rangeRelation === "historical_low"
      ? ` The ${historical.latestYear} figure is the lowest in the available record.`
      : historical?.rangeRelation === "historical_high"
        ? ` The ${historical.latestYear} figure is the highest in the available record.`
        : historical && historical.vsFiveYear.percentChange !== null
          ? ` Compared with the five-year average, the latest figure is ${historical.vsFiveYear.percentChange > 0 ? "above" : "below"} that average.`
          : "";

  return {
    title: `${station.name} crime statistics`,
    description: latest
      ? `${formatCount(total)} recorded crimes in the ${station.name} police precinct${where ? ` in ${where}` : ""} in ${latest.financialYear}.${historyClause} Explore ${station.name} crime trends and reported crime ${latest.financialYear}.`
      : `Recorded crime statistics and historical trends for the ${station.name} police precinct.`,
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

  const nearby =
    station.latitude !== null && station.longitude !== null
      ? await getNearbyStations(station.longitude, station.latitude, 4, station.slug)
      : null;

  const nearbyLinks =
    nearby?.ok
      ? nearby.data.map((item) => ({
          slug: item.slug,
          name: item.name,
          href: item.provinceSlug
            ? `/crime/${item.provinceSlug}/${item.slug}`
            : `/station/${item.slug}`,
          distanceMeters: item.distanceMeters,
          localMunicipality: item.localMunicipality,
          provinceName: item.provinceName,
        }))
      : [];

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

      <StationProfile profile={result.data} nearby={nearbyLinks} />

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
