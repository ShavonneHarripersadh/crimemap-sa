import Link from "next/link";

import { ChangeIndicator } from "@/components/data/change-indicator";
import { Note } from "@/components/ui/note";
import { formatCount } from "@/lib/format";
import type { BreakdownRow } from "@/lib/metrics/profile";
import type { Change } from "@/lib/metrics/change";

export interface BreakdownItem extends BreakdownRow {
  readonly change: Change;
}

/**
 * Composition of recorded crime for one year.
 *
 * A proportional bar per category rather than a pie: with 17 categories a pie is unreadable, and
 * a shared baseline lets the reader compare two categories directly. Each row states the count,
 * the share and the change, so the bar is decoration rather than the only way to read the value.
 */
export function CategoryBreakdown({
  rows,
  totalRecordedCrime,
}: {
  rows: readonly BreakdownItem[];
  totalRecordedCrime: number | null;
}) {
  const largest = rows.reduce((max, row) => Math.max(max, row.value ?? 0), 0);
  const missing = rows.filter((row) => row.value === null);

  return (
    <div className="space-y-4">
      <ol className="space-y-2.5">
        {rows.map((row) => {
          const width = largest > 0 && row.value !== null ? (row.value / largest) * 100 : 0;

          return (
            <li key={row.column} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-foreground">
                  {row.label}
                  {row.hasSubcategories ? (
                    <span
                      className="ml-1.5 cursor-help text-xs text-muted"
                      title="This category contains subcategories that the source reports separately. They are included in this figure and are not listed as separate rows, so nothing is counted twice."
                    >
                      includes subcategories
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className="tabular text-sm font-medium text-foreground">
                    {formatCount(row.value)}
                  </span>
                  <span className="tabular w-14 text-right text-xs text-muted">
                    {row.shareOfTotal === null ? "—" : `${row.shareOfTotal.toFixed(1)}%`}
                  </span>
                  <span className="w-24 text-right">
                    <ChangeIndicator change={row.change} size="sm" />
                  </span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                <div
                  className="h-full rounded-full bg-accent/60"
                  style={{ width: `${width}%` }}
                  aria-hidden
                />
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-muted">
        Shares are of the {formatCount(totalRecordedCrime)} recorded crimes across the 17
        community-reported serious crime categories.{" "}
        <Link href="/methodology" className="text-accent underline decoration-dotted">
          How this total is defined
        </Link>
      </p>

      {missing.length > 0 ? (
        <Note>
          The source data does not provide a figure for {missing.length} categor
          {missing.length === 1 ? "y" : "ies"} in this year
          {missing.length <= 4 ? `: ${missing.map((row) => row.label).join(", ")}` : ""}. These are
          shown as not available rather than as zero, so the total above covers only the
          categories that were reported.
        </Note>
      ) : null}
    </div>
  );
}
