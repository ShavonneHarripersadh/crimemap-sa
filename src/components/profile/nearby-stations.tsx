import Link from "next/link";

import { formatDistance } from "@/lib/format";

export interface NearbyStationLink {
  readonly slug: string;
  readonly name: string;
  readonly href: string;
  readonly distanceMeters: number | null;
  readonly localMunicipality: string | null;
  readonly provinceName: string | null;
}

/**
 * Nearby police stations as geographic context. Distance is not an official precinct assignment.
 */
export function NearbyStations({
  stations,
  placeName,
  isSuburb = false,
}: {
  stations: readonly NearbyStationLink[];
  placeName: string;
  isSuburb?: boolean;
}) {
  if (stations.length === 0) return null;

  return (
    <div className="space-y-4">
      {isSuburb ? (
        <p className="text-sm leading-relaxed text-muted-strong">
          No standalone SAPS precinct boundary is provided for this suburb. CrimeMap uses nearby
          police stations to provide relevant recorded-crime data. A suburb is not necessarily
          equivalent to a police precinct.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted-strong">
          Other police stations near {placeName}. Distances are from the station coordinates in the
          source file. A suburb or neighbourhood is not necessarily the same as a police precinct.
        </p>
      )}

      <ul className="divide-y divide-border">
        {stations.map((station) => {
          const distance = formatDistance(station.distanceMeters);
          return (
            <li key={station.slug} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <Link href={station.href} className="min-w-0 font-medium hover:text-accent">
                {station.name}
                <span className="mt-0.5 block text-xs font-normal text-muted">
                  {[station.localMunicipality, station.provinceName].filter(Boolean).join(" · ")}
                </span>
              </Link>
              {distance ? (
                <span className="tabular shrink-0 text-sm text-muted">{distance}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
