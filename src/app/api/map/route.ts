import { NextResponse } from "next/server";
import { z } from "zod";

import { getMapStations } from "@/lib/data/map";

/**
 * Stations in the current viewport.
 *
 * The bounding box is required so the browser never downloads the national dataset: PostGIS
 * returns only the stations in view, which keeps the map responsive on a phone connection.
 */
const querySchema = z.object({
  west: z.coerce.number().min(-180).max(180),
  south: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  north: z.coerce.number().min(-90).max(90),
  year: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
  category: z.string().min(1).max(60).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const parsed = querySchema.safeParse({
    west: params.get("west"),
    south: params.get("south"),
    east: params.get("east"),
    north: params.get("north"),
    ...(params.get("year") ? { year: params.get("year") } : {}),
    ...(params.get("category") ? { category: params.get("category") } : {}),
    ...(params.get("limit") ? { limit: params.get("limit") } : {}),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid bounding box is required.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { west, south, east, north, year, category, limit } = parsed.data;

  if (west >= east || south >= north) {
    return NextResponse.json(
      { error: "The bounding box must have west below east and south below north." },
      { status: 400 },
    );
  }

  const result = await getMapStations({
    bbox: { west, south, east, north },
    financialYear: year ?? null,
    ...(category ? { category } : {}),
    ...(limit ? { limit } : {}),
  });

  if (!result.ok) {
    const status = result.error.kind === "not_configured" ? 503 : 500;
    return NextResponse.json({ error: result.error.message, stations: [] }, { status });
  }

  return NextResponse.json(
    { stations: result.data },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } },
  );
}
