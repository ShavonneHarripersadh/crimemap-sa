import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-unavailable";
import { StationHeader, StationProfile } from "@/components/profile/station-profile";
import { JsonLd } from "@/components/seo/json-ld";
import { PageHeader } from "@/components/ui/section";
import { explorableCategories } from "@/lib/crime/taxonomy";
import { breadcrumbList, pageTitle } from "@/lib/seo";
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
    return { title: "Area not found", robots: { index: false, follow: false } };
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

  const canonical = `/crime/${station.provinceSlug ?? province}/${station.slug}`;
  const title = pageTitle(`${station.name} Crime Statistics & Trends`);
  const description = latest
    ? `${formatCount(total)} crimes recorded in the ${station.name} police precinct${where ? ` in ${where}` : ""} in ${latest.financialYear}.${historyClause} These are precinct figures, not suburb incident counts.`
    : `Recorded crime statistics and historical trends for the ${station.name} police precinct.`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
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

  const canonicalPath = `/crime/${station.provinceSlug ?? province}/${station.slug}`;
  const crumbs = [
    { name: "Home", path: "/" },
    ...(station.provinceSlug && station.provinceName
      ? [{ name: station.provinceName, path: `/crime/${station.provinceSlug}` }]
      : []),
    { name: `${station.name} police precinct`, path: canonicalPath },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd data={breadcrumbList(crumbs)} />
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
        <p className="mt-4 text-sm text-muted">
          <Link href="/crime-category" className="font-medium text-accent hover:underline">
            Crime categories
          </Link>
          <span aria-hidden> · </span>
          <Link href="/methodology" className="font-medium text-accent hover:underline">
            How these figures are calculated
          </Link>
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {explorableCategories().map((category) => (
            <li key={category.key}>
              <Link
                href={`/crime-category/${category.key}`}
                className="inline-flex rounded-full border border-border bg-surface-raised px-3 py-1 text-sm hover:border-border-strong"
              >
                {category.label}
              </Link>
            </li>
          ))}
        </ul>
      </PageHeader>

      <StationProfile profile={result.data} nearby={nearbyLinks} />
    </div>
  );
}
