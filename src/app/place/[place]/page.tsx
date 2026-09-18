import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NearbyStations } from "@/components/profile/nearby-stations";
import { Note } from "@/components/ui/note";
import { Eyebrow, PageHeader } from "@/components/ui/section";
import { geocodeSouthAfricanPlace } from "@/lib/data/geocode";
import { getNearbyStations } from "@/lib/data/stations";

export const revalidate = 86_400;

interface RouteParams {
  params: Promise<{ place: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const name = decodeURIComponent((await params).place).trim();
  return {
    title: `${name} nearby police stations`,
    description: `${name} does not have a standalone SAPS precinct boundary in this dataset. CrimeMap SA lists nearby police stations so you can read recorded-crime figures for the surrounding precincts.`,
    alternates: { canonical: `/place/${encodeURIComponent(name)}` },
  };
}

export default async function PlacePage({ params }: RouteParams) {
  const name = decodeURIComponent((await params).place).trim();
  if (name.length < 2) notFound();

  const place = await geocodeSouthAfricanPlace(name);
  if (!place) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <PageHeader>
          <Eyebrow>Place</Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{name}</h1>
        </PageHeader>
        <Note tone="caution">
          CrimeMap SA could not locate {name} in South Africa, so there are no nearby police
          stations to show. Search a station name instead.
        </Note>
      </div>
    );
  }

  const nearby = await getNearbyStations(place.longitude, place.latitude, 5);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-foreground">{place.name}</li>
        </ol>
      </nav>

      <PageHeader>
        <Eyebrow>Suburb or place</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{place.name}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          No standalone SAPS precinct boundary is provided for this suburb. CrimeMap uses nearby
          police stations to provide relevant recorded-crime data. A suburb is not necessarily
          equivalent to a police precinct.
        </p>
      </PageHeader>

      {nearby.ok && nearby.data.length > 0 ? (
        <NearbyStations
          placeName={place.name}
          stations={nearby.data.map((item) => ({
            slug: item.slug,
            name: item.name,
            href: item.provinceSlug
              ? `/crime/${item.provinceSlug}/${item.slug}`
              : `/station/${item.slug}`,
            distanceMeters: item.distanceMeters,
            localMunicipality: item.localMunicipality,
            provinceName: item.provinceName,
          }))}
        />
      ) : nearby.ok ? (
        <Note>No police stations with coordinates were found near {place.name}.</Note>
      ) : (
        <Note tone="caution">{nearby.error.message}</Note>
      )}
    </div>
  );
}
