import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-unavailable";
import { NearbyStations } from "@/components/profile/nearby-stations";
import { StationProfile } from "@/components/profile/station-profile";
import { Note } from "@/components/ui/note";
import { Eyebrow, PageHeader, Section } from "@/components/ui/section";
import { geocodeSouthAfricanPlace } from "@/lib/data/geocode";
import { getNearbyStations, getStationProfileBySlug } from "@/lib/data/stations";
import { formatDistance } from "@/lib/format";

export const revalidate = 86_400;

interface RouteParams {
  params: Promise<{ place: string }>;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const name = decodeURIComponent((await params).place).trim();
  return {
    title: `${name} crime overview`,
    description: `Reported crime for ${name}. The figures are recorded by the nearest police precinct, not as suburb-specific incident counts.`,
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
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
