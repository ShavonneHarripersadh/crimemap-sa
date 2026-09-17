import { NextResponse } from "next/server";

/**
 * Same-origin proxy for the map basemap.
 *
 * CARTO's public Voyager tiles now stamp "API KEY REQUIRED" on every tile, so they cannot
 * be used. Esri World Street Map is a geographic basemap (land, water, roads, place names)
 * that does not require a key. World Topo Map is the fallback.
 * Tiles are fetched server-side so the browser never has to talk to a third-party tile host.
 */

const FETCH_HEADERS = {
  Accept: "image/png,image/jpeg,image/*",
  "User-Agent": "CrimeMapSA/0.1 (recorded-crime visualisation)",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await context.params;
  const zoom = Number.parseInt(z, 10);
  const col = Number.parseInt(x, 10);
  const row = Number.parseInt(y, 10);

  if (
    !Number.isInteger(zoom) ||
    !Number.isInteger(col) ||
    !Number.isInteger(row) ||
    zoom < 0 ||
    zoom > 16 ||
    col < 0 ||
    row < 0
  ) {
    return NextResponse.json({ error: "Invalid tile coordinates." }, { status: 400 });
  }

  const street =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/" +
    `${zoom}/${row}/${col}`;
  const topo =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/" +
    `${zoom}/${row}/${col}`;

  const body = (await fetchTile(street)) ?? (await fetchTile(topo));
  if (!body) return new NextResponse(null, { status: 502 });

  return new NextResponse(body.bytes, {
    headers: {
      "Content-Type": body.contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

async function fetchTile(
  url: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  try {
    const upstream = await fetch(url, {
      headers: FETCH_HEADERS,
      next: { revalidate: 86_400 },
    });
    if (!upstream.ok) return null;
    const contentType = upstream.headers.get("Content-Type") ?? "image/png";
    if (!contentType.startsWith("image/")) return null;
    return { bytes: await upstream.arrayBuffer(), contentType };
  } catch {
    return null;
  }
}
