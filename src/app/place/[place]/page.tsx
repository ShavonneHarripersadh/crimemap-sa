import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { DataUnavailable } from "@/components/data/data-unavailable";
import { NearbyStations } from "@/components/profile/nearby-stations";
import { StationProfile } from "@/components/profile/station-profile";
import { JsonLd } from "@/components/seo/json-ld";
import { Note } from "@/components/ui/note";
import { Eyebrow, PageHeader, Section } from "@/components/ui/section";
import { geocodeSouthAfricanPlace } from "@/lib/data/geocode";
import { getNearbyStations, getStationProfileBySlug } from "@/lib/data/stations";
import { formatDistance } from "@/lib/format";
import { breadcrumbList, pageTitle } from "@/lib/seo";

export const revalidate = 86_400;

interface RouteParams {
  params: Promise<{ place: string }>;
}

function placeKey(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const key = placeKey(decodeURIComponent((await params).place));
  const canonical = `/place/${encodeURIComponent(key)}`;
  const place = await geocodeSouthAfricanPlace(key);
  if (!place) {
    return {
      title: "Area not found",
      robots: { index: false, follow: false },
      alternates: { canonical },
    };
  }

  const nearby = await getNearbyStations(place.longitude, place.latitude, 1);
  const nearest = nearby.ok ? nearby.data[0] : null;
  const title = pageTitle(`${place.name} Crime Statistics & Trends`);
  const description = nearest
    ? `Crime data shown for ${place.name} is reported at police-precinct level using the nearest precinct, ${nearest.name}. These figures are not a count of incidents inside ${place.name}.`
    : `CrimeMap SA could not match ${place.name} to a police precinct with published coordinates.`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    robots: nearest ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function PlacePage({ params }: RouteParams) {
  const raw = decodeURIComponent((await params).place).trim();
  const name = placeKey(raw);
  if (name.length < 2) notFound();
  if (raw !== name) redirect(`/place/${encodeURIComponent(name)}`);

  const place = await geocodeSouthAfricanPlace(name);
  if (!place) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <PageHeader>
          <Eyebrow>Area</Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{name}</h1>
        </PageHeader>
        <Note tone="caution">
          CrimeMap SA could not locate {name} in South Africa, so there are no recorded-crime
          figures to show. Try the suburb, town or police precinct name again.
        </Note>
      </div>
    );
  }

  const nearby = await getNearbyStations(place.longitude, place.latitude, 5);
  const nearest = nearby.ok ? nearby.data[0] : null;
  const profile = nearest ? await getStationProfileBySlug(nearest.slug) : null;
  const distance = nearest ? formatDistance(nearest.distanceMeters) : null;
  const others =
    nearby.ok && profile?.ok
      ? nearby.data.slice(1).map((item) => ({
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

  const precinctHref =
    nearest?.provinceSlug && nearest.slug
      ? `/crime/${nearest.provinceSlug}/${nearest.slug}`
      : null;
  const crumbs = [
    { name: "Home", path: "/" },
    ...(nearest?.provinceSlug && nearest.provinceName
      ? [{ name: nearest.provinceName, path: `/crime/${nearest.provinceSlug}` }]
      : []),
    ...(precinctHref && nearest
      ? [{ name: `${nearest.name} police precinct`, path: precinctHref }]
      : []),
    { name: place.name, path: `/place/${encodeURIComponent(name)}` },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      <JsonLd data={breadcrumbList(crumbs)} />
      {nearest ? (
        <TrackOnMount
          event="area_viewed"
          properties={{
            area: name,
            precinct: nearest.slug,
            province: nearest.provinceSlug,
          }}
        />
      ) : null}
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          {nearest?.provinceSlug && nearest.provinceName ? (
            <>
              <li aria-hidden>/</li>
              <li>
                <Link href={`/crime/${nearest.provinceSlug}`} className="hover:text-foreground">
                  {nearest.provinceName}
                </Link>
              </li>
            </>
          ) : null}
          {precinctHref && nearest ? (
            <>
              <li aria-hidden>/</li>
              <li>
                <Link href={precinctHref} className="hover:text-foreground">
                  {nearest.name} police precinct
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden>/</li>
          <li className="text-foreground">{place.name}</li>
        </ol>
      </nav>

      <PageHeader>
        <Eyebrow>Area</Eyebrow>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{place.name}</h1>
        {nearest ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            {`Figures below are recorded by the ${nearest.name} police precinct${
              distance ? `, about ${distance} from this place` : ""
            }. They are not a count of incidents inside ${place.name} itself.`}
          </p>
        ) : null}
      </PageHeader>

      {profile?.ok ? (
        <StationProfile
          profile={profile.data}
          subject={{
            name: place.name,
            kind: "place",
            sourceStationName: nearest?.name ?? profile.data.station.name,
            sourceHref: nearest?.provinceSlug
              ? `/crime/${nearest.provinceSlug}/${nearest.slug}`
              : `/station/${profile.data.station.slug}`,
            distanceLabel: distance,
          }}
        />
      ) : profile && !profile.ok ? (
        <DataUnavailable error={profile.error} />
      ) : nearby.ok ? (
        <Note>No police precinct with coordinates was found near {place.name}.</Note>
      ) : (
        <DataUnavailable error={nearby.error} />
      )}

      {others.length > 0 ? (
        <div className="mt-14">
          <Section
            title="Other nearby precincts"
            description="These stations are close to the place you searched. Distance is not an official precinct boundary."
          >
            <NearbyStations stations={others} placeName={place.name} />
          </Section>
        </div>
      ) : null}
    </div>
  );
}
