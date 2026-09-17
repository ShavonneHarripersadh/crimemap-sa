import { NextResponse } from "next/server";
import { z } from "zod";

import { searchLocations } from "@/lib/data/search";

const querySchema = z.object({
  q: z.string().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(25).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    ...(url.searchParams.get("limit")
      ? { limit: url.searchParams.get("limit") }
      : {}),
  });

  // A query shorter than two characters is not an error; there is simply nothing to suggest yet.
  if (!parsed.success) {
    return NextResponse.json({ results: [] });
  }

  const result = await searchLocations(parsed.data.q, parsed.data.limit ?? 10);

  if (!result.ok) {
    const status = result.error.kind === "not_configured" ? 503 : 500;
    return NextResponse.json({ results: [], error: result.error.message }, { status });
  }

  return NextResponse.json(
    { results: result.data },
    {
      // Suggestions for a given prefix are stable between data loads, so they cache well at the
      // edge while still revalidating often enough to pick up a new load.
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    },
  );
}
