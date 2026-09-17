import Link from "next/link";

import { ChangeIndicator } from "@/components/data/change-indicator";
import { Card } from "@/components/ui/card";
import { Note } from "@/components/ui/note";
import { HEADLINE_COMMUNITY_COLUMNS, categoryLabel } from "@/lib/crime/taxonomy";
import type { StationProfile } from "@/lib/data/stations";
import { formatCount } from "@/lib/format";
import { calculateChange } from "@/lib/metrics/change";
import {
  buildYearTotals,
  fiveYearChange,
  totalChange,
} from "@/lib/metrics/profile";

/**
 * Side-by-side recorded-crime figures for up to three precincts.
 *
 * Areas are listed in the order they were added. Nothing here ranks them.
 */
export function CompareTable({ profiles }: { profiles: readonly StationProfile[] }) {
  if (profiles.length === 0) {
    return (
      <Note>
        Add two or three police stations to see the same measures side by side. CrimeMap SA does
        not rank areas.
      </Note>
    );
  }

  const columns = profiles.map((profile) => {
    const ordered = [...profile.records].sort(
      (a, b) => a.financialYearStart - b.financialYearStart,
    );
    const latest = ordered.at(-1) ?? null;
    const previous = ordered.at(-2) ?? null;
    const totals = latest ? buildYearTotals(latest) : null;
    const change = latest ? totalChange(latest, previous) : null;
    const fiveYear = latest ? fiveYearChange(ordered, latest.financialYearStart) : null;

    return {
      profile,
      latest,
      previous,
      totals,
      change,
      fiveYear,
    };
  });

  const year = columns.find((column) => column.latest)?.latest?.financialYear ?? null;

  return (
    <div className="space-y-4">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">
            Recorded crime comparison
            {year ? ` for ${year}` : ""} across the selected police station precincts.
          </caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-5 py-4 text-xs font-medium tracking-wide text-muted uppercase">
                Measure
              </th>
              {columns.map(({ profile }) => (
                <th key={profile.station.slug} className="px-5 py-4 font-semibold">
                  <Link
                    href={
                      profile.station.provinceSlug
                        ? `/crime/${profile.station.provinceSlug}/${profile.station.slug}`
                        : `/station/${profile.station.slug}`
                    }
                    className="hover:text-accent"
                  >
                    {profile.station.name}
                  </Link>
                  <p className="mt-1 text-xs font-normal text-muted">
                    {[profile.station.localMunicipality, profile.station.provinceName]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <th className="px-5 py-3 text-left font-medium text-muted-strong">
                Recorded crime{year ? `, ${year}` : ""}
              </th>
              {columns.map(({ profile, totals }) => (
                <td key={profile.station.slug} className="tabular px-5 py-3 text-lg font-semibold">
                  {formatCount(totals?.totalRecordedCrime ?? null)}
                </td>
              ))}
            </tr>
            <tr className="border-b border-border">
              <th className="px-5 py-3 text-left font-medium text-muted-strong">
                Change on previous year
              </th>
              {columns.map(({ profile, change }) => (
                <td key={profile.station.slug} className="px-5 py-3">
                  {change ? <ChangeIndicator change={change} showAbsolute /> : "Not available"}
                </td>
              ))}
            </tr>
            <tr className="border-b border-border">
              <th className="px-5 py-3 text-left font-medium text-muted-strong">
                Change over five years
              </th>
              {columns.map(({ profile, fiveYear }) => (
                <td key={profile.station.slug} className="px-5 py-3">
                  {fiveYear ? <ChangeIndicator change={fiveYear.change} /> : "Not available"}
                </td>
              ))}
            </tr>
            {HEADLINE_COMMUNITY_COLUMNS.map((column) => (
              <tr key={column} className="border-b border-border last:border-b-0">
                <th className="px-5 py-3 text-left font-medium text-muted-strong">
                  {categoryLabel(column)}
                </th>
                {columns.map(({ profile, latest, previous }) => (
                  <td key={profile.station.slug} className="px-5 py-3">
                    <span className="tabular">{formatCount(latest?.counts[column] ?? null)}</span>
                    <span className="mt-1 block">
                      <ChangeIndicator
                        size="sm"
                        change={calculateChange(
                          latest?.counts[column] ?? null,
                          previous?.counts[column] ?? null,
                        )}
                      />
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Note>
        These are recorded counts, not rates per person. A larger total usually reflects a larger
        precinct rather than more crime per resident. The source has no population figures per
        precinct, so CrimeMap SA does not compute rates or rank areas.
      </Note>
    </div>
  );
}
