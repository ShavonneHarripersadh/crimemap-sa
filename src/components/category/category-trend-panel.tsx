"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { TrendChart } from "@/components/charts/trend-chart";
import { trackEvent } from "@/lib/analytics";
import { TREND_WINDOWS, trendWindowLength, type TrendWindow } from "@/lib/crime/financial-year";
import { cn } from "@/lib/utils";

export interface CategoryTrendPoint {
  readonly financialYear: string;
  readonly financialYearStart: number;
  readonly value: number | null;
}

export function CategoryTrendPanel({
  points,
  label,
  years,
  selectedYear,
  provinces,
  selectedProvince,
}: {
  points: readonly CategoryTrendPoint[];
  label: string;
  years: readonly string[];
  selectedYear: string | null;
  provinces: readonly { slug: string; name: string }[];
  selectedProvince: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [window, setWindow] = useState<TrendWindow>("all");

  const sliced = useMemo(() => {
    const length = trendWindowLength(window);
    return length === null ? points : points.slice(-length);
  }, [points, window]);

  function replace(next: { year?: string | null; province?: string | null }) {
    const params = new URLSearchParams();
    const year = next.year === undefined ? selectedYear : next.year;
    const province = next.province === undefined ? selectedProvince : next.province;
    if (year) params.set("year", year);
    if (province) params.set("province", province);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            Financial year
          </span>
          <select
            value={selectedYear ?? ""}
            onChange={(event) => {
              replace({ year: event.target.value });
              trackEvent("category_year_changed", { year: event.target.value });
            }}
            className="h-10 min-w-36 rounded-lg border border-border bg-surface px-3 text-sm"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">Province</span>
          <select
            value={selectedProvince ?? ""}
            onChange={(event) => {
              const value = event.target.value || null;
              replace({ province: value });
              trackEvent("category_province_changed", { province: value ?? "all" });
            }}
            className="h-10 min-w-44 rounded-lg border border-border bg-surface px-3 text-sm"
          >
            <option value="">All provinces</option>
            {provinces.map((province) => (
              <option key={province.slug} value={province.slug}>
                {province.name}
              </option>
            ))}
          </select>
        </label>

        <div role="group" aria-label="Time window" className="flex rounded-lg border border-border bg-surface p-1">
          {TREND_WINDOWS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={window === option.value}
              onClick={() => {
                setWindow(option.value);
                trackEvent("trend_window_changed", { window: option.value });
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                window === option.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <TrendChart data={sliced} label={label} height={320} />
    </div>
  );
}
