import { NextResponse } from "next/server";
import { z } from "zod";

import { getExplorableCategory } from "@/lib/crime/taxonomy";
import {
  getProvinceSeriesTotals,
  getProvinceSeriesTrend,
} from "@/lib/data/aggregates";

const querySchema = z.object({
  year: z.string().regex(/^\d{4}\/\d{2}$/),
  province: z
    .string()
    .regex(/^[a-z]+(?:-[a-z]+)*$/)
    .optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ category: string }> },
) {
  const { category: slug } = await context.params;
  const category = getExplorableCategory(slug);
  if (!category) {
    return NextResponse.json({ error: "Unknown crime category." }, { status: 404 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    year: url.searchParams.get("year"),
    ...(url.searchParams.get("province")
      ? { province: url.searchParams.get("province") }
      : {}),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "A valid financial year is required." }, { status: 400 });
  }

  const [provincesResult, trendResult] = await Promise.all([
    getProvinceSeriesTotals({
      columns: category.columns,
      financialYear: parsed.data.year,
    }),
    parsed.data.province
      ? getProvinceSeriesTrend(category.columns, parsed.data.province)
      : Promise.resolve(null),
  ]);

  if (!provincesResult.ok) {
    const status = provincesResult.error.kind === "not_configured" ? 503 : 500;
    return NextResponse.json({ error: provincesResult.error.message }, { status });
  }

  if (trendResult && !trendResult.ok) {
    const status = trendResult.error.kind === "not_configured" ? 503 : 500;
    return NextResponse.json({ error: trendResult.error.message }, { status });
  }

  return NextResponse.json(
    {
      provinces: provincesResult.data,
      series: trendResult && trendResult.ok ? trendResult.data : null,
    },
    {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    },
  );
}
