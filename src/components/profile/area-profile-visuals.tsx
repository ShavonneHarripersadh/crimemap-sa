"use client";

import { useState } from "react";
import Link from "next/link";

import { CrimeFingerprint } from "@/components/profile/crime-fingerprint";
import { StationTrend } from "@/components/profile/station-trend";
import { FEATURED_SERIES, featuredSeriesKeyForColumn } from "@/lib/crime/taxonomy";
import type { BreakdownRow, StationYearRecord } from "@/lib/metrics/profile";

function categoryHref(column: string): string {
  const key = featuredSeriesKeyForColumn(column);
  return `/crime-category/${key === "all" ? column : key}`;
}

/**
 * Keeps the crime profile and the historical chart on the same selected category.
 */
export function AreaProfileVisuals({
  records,
  breakdown,
  totalRecordedCrime,
}: {
  records: readonly StationYearRecord[];
  breakdown: readonly BreakdownRow[];
  totalRecordedCrime: number | null;
}) {
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [chartKey, setChartKey] = useState("all");
  const selectedLabel = breakdown.find((row) => row.column === selectedColumn)?.label;

  return (
    <div className="space-y-14">
      <section className="scroll-mt-24" id="crime-profile">
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Crime profile</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Types of recorded crime that make up this precinct&apos;s latest-year total. This is a
            composition of what was recorded, not a judgement of how dangerous the area is.
          </p>
        </div>
        <CrimeFingerprint
          rows={breakdown}
          totalRecordedCrime={totalRecordedCrime}
          selectedColumn={selectedColumn}
          onSelect={(column) => {
            setSelectedColumn(column);
            const key = featuredSeriesKeyForColumn(column);
            if (FEATURED_SERIES.some((item) => item.key === key)) setChartKey(key);
          }}
        />
        {selectedColumn && selectedLabel ? (
          <p className="mt-3 text-sm text-muted">
            <Link
              href={categoryHref(selectedColumn)}
              className="text-accent underline decoration-dotted underline-offset-2"
            >
              Open the national {selectedLabel} page
            </Link>
          </p>
        ) : null}
      </section>

      <section className="scroll-mt-24" id="historical-trend">
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Historical context</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Recorded crime over the last 5 years, 10 years, or the full available series. Choose a
            category to match the profile above.
          </p>
        </div>
        <StationTrend
          records={records}
          seriesKey={chartKey}
          onSeriesKeyChange={(key) => {
            setChartKey(key);
            setSelectedColumn(null);
          }}
        />
      </section>
    </div>
  );
}
