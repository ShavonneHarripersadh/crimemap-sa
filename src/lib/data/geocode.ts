import "server-only";

/**
 * Look up a South African place name that is not in the SAPS station list.
 *
 * Nominatim / OpenStreetMap is used only as a geographic hint so a suburb such as Bromhof can
 * be shown next to the nearest police stations. It is not an official precinct assignment.
 */

export interface GeocodedPlace {
  readonly name: string;
  readonly displayName: string;
  readonly latitude: number;
  readonly longitude: number;
}

const cache = new Map<string, GeocodedPlace | null>();

export async function geocodeSouthAfricanPlace(
  query: string,
): Promise<GeocodedPlace | null> {
  const key = query.trim().toLowerCase();
  if (key.length < 2) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "za");
  url.searchParams.set("q", query.trim());

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CrimeMapSA/0.1 (recorded crime statistics; https://localhost)",
      },
      next: { revalidate: 86_400 },
    });

    if (!response.ok) {
      cache.set(key, null);
      return null;
    }

    const rows = (await response.json()) as Array<{
      name?: string;
      display_name?: string;
      lat?: string;
      lon?: string;
    }>;

    const row = rows[0];
    const latitude = Number(row?.lat);
    const longitude = Number(row?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      cache.set(key, null);
      return null;
    }

    const place: GeocodedPlace = {
      name: row?.name?.trim() || query.trim(),
      displayName: row?.display_name?.trim() || query.trim(),
      latitude,
      longitude,
    };
    cache.set(key, place);
    return place;
  } catch {
    cache.set(key, null);
    return null;
  }
}
