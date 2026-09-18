"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { TrendChart } from "@/components/charts/trend-chart";
import { ChangeIndicator } from "@/components/data/change-indicator";
import { CrimeMap } from "@/components/map/crime-map";
import { CrimeHistory } from "@/components/profile/crime-history";
import { HistoricalContextTable } from "@/components/profile/historical-context";
import { UnusualMovements } from "@/components/profile/unusual-movements";
import { Note } from "@/components/ui/note";
import { Section } from "@/components/ui/section";
import { trackEvent } from "@/lib/analytics";
import { TREND_WINDOWS, trendWindowLength, type TrendWindow } from "@/lib/crime/financial-year";
import { formatCount } from "@/lib/format";
import { calculateChange, rankChanges, type Change } from "@/lib/metrics/change";
import {
  buildCrimeHistory,
  buildHistoricalContext,
  classifyUnusualMovement,
  seriesThroughYear,
} from "@/lib/metrics/history";
import type { SeriesPoint } from "@/lib/metrics/profile";
import { cn } from "@/lib/utils";

export interface CategoryProvinceRow {
  readonly slug: string;
  readonly name: string;
  readonly financialYear: string;
  readonly totalRecordedCrime: number | null;
  readonly change: Change;
  readonly stationsReporting: number;
}

interface ScopeResponse {
  provinces?: CategoryProvinceRow[];
  series?: Array<{
    financialYear: string;
    financialYearStart: number;
    value: number | null;
  }> | null;
  error?: string;
}

function toSeriesPoints(
  rows: readonly { financialYear: string; financialYearStart: number; value: number | null }[],
): SeriesPoint[] {
  return rows.map((row) => ({
    financialYear: row.financialYear,
    financialYearStart: row.financialYearStart,
    value: row.value,
    missingCount: row.value === null ? 1 : 0,
  }));
}

/**
 * Category deep-dive: year and province filters update the headline, chart, snapshot and map
 * immediately on the client. The page is statically cached, so these controls cannot wait for a
 * server re-render.
 */
export function CategoryExplorer({
  categoryKey,
  label,
  mapCategory,
  composite,
  years,
  initialYear,
  initialProvince,
  nationalPoints,
  initialProvinces,
}: {
  categoryKey: string;
  label: string;
  mapCategory: string;
  composite: boolean;
  years: readonly string[];
  initialYear: string | null;
  initialProvince: string | null;
  nationalPoints: readonly SeriesPoint[];
  initialProvinces: readonly CategoryProvinceRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [year, setYear] = useState(initialYear);
  const [province, setProvince] = useState<string | null>(initialProvince);
  const [window, setWindow] = useState<TrendWindow>("all");
  const [provinces, setProvinces] = useState(initialProvinces);
  const [provinceSeries, setProvinceSeries] = useState<Record<string, SeriesPoint[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipUrl = useRef(true);
  const skipInitialFetch = useRef(true);

  useEffect(() => {
    if (skipUrl.current) {
      skipUrl.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (year) params.set("year", year);
    if (province) params.set("province", province);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [year, province, pathname, router]);

  useEffect(() => {
    if (!year) return;
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      if (year === initialYear && !province) return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ year });
    if (province) params.set("province", province);

    fetch(`/api/crime-category/${categoryKey}?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as ScopeResponse;
        if (!response.ok) {
          setError(body.error ?? "Those figures could not be loaded.");
          return;
        }
        if (body.provinces) setProvinces(body.provinces);
        if (province && body.series) {
          setProvinceSeries((current) => ({
            ...current,
            [province]: toSeriesPoints(body.series ?? []),
          }));
        }
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError("Those figures could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [categoryKey, year, province, initialYear]);

  const sourcePoints = province && provinceSeries[province] ? provinceSeries[province] : nationalPoints;
  const through = useMemo(
    () => seriesThroughYear(sourcePoints ?? nationalPoints, year),
    [sourcePoints, nationalPoints, year],
  );
  const chartPoints = useMemo(() => {
    const length = trendWindowLength(window);
    return length === null ? through : through.slice(-length);
  }, [through, window]);

  const historical = useMemo(() => buildHistoricalContext(through), [through]);
  const history = useMemo(() => buildCrimeHistory(through), [through]);
  const unusual = useMemo(() => classifyUnusualMovement(through), [through]);

  const latest = through.at(-1) ?? null;
  const previous = through.at(-2) ?? null;
  const provinceRow = province ? (provinces.find((row) => row.slug === province) ?? null) : null;
  const usingProvinceSeries = Boolean(province && provinceSeries[province]);
  const seriesReady = !province || usingProvinceSeries;
  const headlineValue = seriesReady
    ? (latest?.value ?? null)
    : (provinceRow?.totalRecordedCrime ?? null);
  const headlineChange = seriesReady
    ? calculateChange(latest?.value ?? null, previous?.value ?? null)
    : (provinceRow?.change ?? calculateChange(null, null));
  const placeLabel = provinceRow ? provinceRow.name : "South Africa";

  const movers = rankChanges(
    provinces.map((row) => ({ ...row.change, column: row.slug, label: row.name })),
    "increase",
    5,
  );
  const decliners = rankChanges(
    provinces.map((row) => ({ ...row.change, column: row.slug, label: row.name })),
    "decrease",
    5,
  );

  return (
    <div className="space-y-14">
      <div>
        <p className="text-3xl font-semibold tracking-tight">
          {formatCount(headlineValue)}
          <span className="ml-3 align-middle text-base font-normal">
            <ChangeIndicator change={headlineChange} showAbsolute />
          </span>
        </p>
        <p className="mt-1 text-sm text-muted">
          {placeLabel}, {year ?? historical.latestYear}
          {loading ? " · updating…" : ""}
        </p>
      </div>

      <Section
        title={provinceRow ? `${label} in ${provinceRow.name}` : "National trend"}
        description="Every financial year in the dataset up to the year you select. Missing years appear as gaps, not as zero."
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">
                Financial year
              </span>
              <select
                value={year ?? ""}
                onChange={(event) => {
                  setYear(event.target.value);
                  trackEvent("category_year_changed", { year: event.target.value });
                }}
                className="h-10 min-w-36 rounded-lg border border-border bg-surface px-3 text-sm"
              >
                {years.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">Province</span>
              <select
                value={province ?? ""}
                onChange={(event) => {
                  const value = event.target.value || null;
                  setProvince(value);
                  trackEvent("category_province_changed", { province: value ?? "all" });
                }}
                className="h-10 min-w-44 rounded-lg border border-border bg-surface px-3 text-sm"
              >
                <option value="">All provinces</option>
                {initialProvinces.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.name}
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

          {error ? <Note tone="caution">{error}</Note> : null}

          {province && !usingProvinceSeries && !error ? (
            <div className="grid h-[320px] place-items-center rounded-lg border border-dashed border-border text-sm text-muted">
              Loading the {provinceRow?.name ?? "province"} series…
            </div>
          ) : (
            <TrendChart data={chartPoints} label={label} height={320} />
          )}
        </div>
      </Section>

      {seriesReady ? (
        <Section
          title="Area snapshot"
          description={
            provinceRow
              ? `${year ?? ""} recorded ${label.toLowerCase()} in ${provinceRow.name}, compared with that province's own history up to this year.`
              : `${year ?? ""} nationally, compared with this category's own history up to this year.`
          }
        >
          <HistoricalContextTable context={historical} />
        </Section>
      ) : null}

      {seriesReady ? (
        <Section title="Crime history">
          <CrimeHistory
            milestones={history}
            entityLabel={provinceRow ? `${label} in ${provinceRow.name}` : label}
          />
        </Section>
      ) : null}

      {seriesReady ? (
        <Section
          title="Unusual movements"
          description="The selected year's year-on-year change compared with earlier comparable movements in this series."
        >
          <UnusualMovements movement={unusual} />
        </Section>
      ) : null}

      <Section
        title="Province breakdown"
        description={`Recorded ${label.toLowerCase()} by province in ${year ?? historical.latestYear}, listed alphabetically. This is not a ranking.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-3 pr-4 font-medium text-muted">Province</th>
                <th className="py-3 pr-4 font-medium text-muted">Recorded</th>
                <th className="py-3 font-medium text-muted">Year-on-year</th>
              </tr>
            </thead>
            <tbody>
              {provinces.map((row) => (
                <tr
                  key={row.slug}
                  className={
                    province === row.slug
                      ? "border-b border-border bg-surface"
                      : "border-b border-border last:border-b-0"
                  }
                >
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={() => {
                        setProvince(row.slug);
                        trackEvent("category_province_changed", { province: row.slug });
                      }}
                      className="text-left hover:text-accent"
                    >
                      {row.name}
                    </button>
                  </td>
                  <td className="tabular py-3 pr-4">{formatCount(row.totalRecordedCrime)}</td>
                  <td className="py-3">
                    <ChangeIndicator change={row.change} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Largest recent movements"
        description="Provinces whose year-on-year change clears CrimeMap SA's documented thresholds. Listed because the movement is large, not because the province is safer or more dangerous."
      >
        {movers.length === 0 && decliners.length === 0 ? (
          <Note>
            No province changed by enough in this category to be listed, using the same small-base
            and size rules as the rest of the site.
          </Note>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2">
            <MovementList title="Recorded more often" items={movers} />
            <MovementList title="Recorded less often" items={decliners} />
          </div>
        )}
      </Section>

      <Section
        title="Map"
        description={
          composite
            ? `The map colours local municipalities by ${label.toLowerCase()} using ${mapCategory.replaceAll("_", " ")}, the first source column in this grouping, for ${year ?? "the selected year"}.`
            : `Local municipalities coloured by recorded volume for this category in ${year ?? "the selected year"}. Zoom in for police stations.`
        }
      >
        <CrimeMap financialYear={year} category={mapCategory} categoryLabel={label} />
        <p className="mt-3 text-sm text-muted">
          <Link href="/map" className="text-accent underline decoration-dotted underline-offset-2">
            Open the national map
          </Link>
          {" · "}
          <Link href="/methodology" className="text-accent underline decoration-dotted underline-offset-2">
            Methodology
          </Link>
        </p>
      </Section>
    </div>
  );
}

function MovementList({
  title,
  items,
}: {
  title: string;
  items: readonly {
    column: string;
    label: string;
    current: number | null;
    previous: number | null;
  }[];
}) {
  return (
    <div>
      <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">None this year.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {items.map((item) => (
            <li key={item.column} className="flex items-baseline justify-between gap-3 py-2.5">
              <Link href={`/crime/${item.column}`} className="text-sm hover:text-accent">
                {item.label}
              </Link>
              <ChangeIndicator size="sm" change={calculateChange(item.current, item.previous)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
