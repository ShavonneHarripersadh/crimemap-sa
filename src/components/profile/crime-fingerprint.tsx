"use client";

import Link from "next/link";

import { formatCount } from "@/lib/format";
import { trackEvent } from "@/lib/analytics";
import { featuredSeriesKeyForColumn } from "@/lib/crime/taxonomy";
import type { BreakdownRow } from "@/lib/metrics/profile";
import { cn } from "@/lib/utils";

/**
 * Composition of recorded crime for one year. Selecting a bar focuses the trend chart on that
 * category; it does not rank how dangerous the area is.
 */
export function CrimeFingerprint({
  rows,
  totalRecordedCrime,
  selectedColumn,
  onSelect,
}: {
  rows: readonly BreakdownRow[];
  totalRecordedCrime: number | null;
  selectedColumn?: string | null;
  onSelect?: (column: string) => void;
}) {
  const present = rows.filter((row) => row.value !== null);
  const largest = present.reduce((max, row) => Math.max(max, row.value ?? 0), 0);

  if (present.length === 0) {
    return (
      <p className="text-sm text-muted">
        The source does not provide category figures for this year, so there is no crime profile to
        show.
      </p>
    );
  }

  return (
    <div>
      <ol className="space-y-2">
        {rows.map((row) => {
          const width = largest > 0 && row.value !== null ? (row.value / largest) * 100 : 0;
          const selected = selectedColumn === row.column;
          const seriesKey = featuredSeriesKeyForColumn(row.column);

          return (
            <li key={row.column}>
              <button
                type="button"
                onClick={() => {
                  onSelect?.(row.column);
                  trackEvent("category_selected", {
                    category: row.column,
                    series: seriesKey,
                  });
                }}
                className={cn(
                  "grid w-full gap-1 rounded-md px-0 py-1 text-left transition-colors",
                  selected ? "text-foreground" : "text-muted-strong hover:text-foreground",
                )}
                aria-pressed={selected}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{row.label}</span>
                  <span className="tabular shrink-0 text-xs text-muted">
                    {formatCount(row.value)}
                    {row.shareOfTotal === null ? "" : ` · ${row.shareOfTotal.toFixed(0)}%`}
                  </span>
                </span>
                <span className="block h-2 overflow-hidden rounded-full bg-surface-raised">
                  <span
                    className={cn("block h-full rounded-full", selected ? "bg-accent" : "bg-accent/55")}
                    style={{ width: `${width}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Shares are of the {formatCount(totalRecordedCrime)} recorded crimes across the 17
        community-reported serious crime categories. Selecting a category focuses the historical
        chart on that grouping.{" "}
        <Link href="/methodology" className="text-accent underline decoration-dotted">
          How this total is defined
        </Link>
      </p>
    </div>
  );
}
