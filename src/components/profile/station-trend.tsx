"use client";

import { useMemo, useState } from "react";

import { TrendChart } from "@/components/charts/trend-chart";
import { Card } from "@/components/ui/card";
import { trackEvent } from "@/lib/analytics";
import { TREND_WINDOWS, trendWindowLength, type TrendWindow } from "@/lib/crime/financial-year";
import { FEATURED_SERIES } from "@/lib/crime/taxonomy";
import { buildSeries, type StationYearRecord } from "@/lib/metrics/profile";
import { cn } from "@/lib/utils";

/**
 * Recorded crime over time for one area, with a category and a time window to choose from.
 *
 * The whole record set is already on the page, so switching category or window is instant and
 * needs no further request. Composite categories say so, because "Robbery" here is a CrimeMap SA
 * grouping of two source columns rather than a figure SAPS publishes under that name.
 */
export function StationTrend({ records }: { records: readonly StationYearRecord[] }) {
  const [seriesKey, setSeriesKey] = useState(FEATURED_SERIES[0]?.key ?? "all");
  const [window, setWindow] = useState<TrendWindow>("all");

  const series = FEATURED_SERIES.find((option) => option.key === seriesKey) ?? FEATURED_SERIES[0];

  const points = useMemo(() => {
    if (!series) return [];
    const all = buildSeries(records, series);
    const length = trendWindowLength(window);
    return length === null ? all : all.slice(-length);
  }, [records, series, window]);

  const missingYears = points.filter((point) => point.value === null).length;

  if (!series) return null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">Category</span>
          <select
            value={seriesKey}
            onChange={(event) => {
              setSeriesKey(event.target.value);
              trackEvent("trend_category_changed", { category: event.target.value });
            }}
            className="h-10 min-w-52 rounded-lg border border-border bg-surface px-3 text-sm"
          >
            {FEATURED_SERIES.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div
          role="group"
          aria-label="Time window"
          className="flex rounded-lg border border-border bg-surface p-1"
        >
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

      <div className="mt-5">
        <TrendChart data={points} label={series.label} height={320} />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        {series.definition}
        {series.composite
          ? " This grouping is a CrimeMap SA composite of more than one source column, not a figure published under this name by SAPS."
          : ""}
        {missingYears > 0
          ? ` The source provides no figure for ${missingYears} of the years shown, which appear as gaps rather than as zero.`
          : ""}
      </p>
    </Card>
  );
}
