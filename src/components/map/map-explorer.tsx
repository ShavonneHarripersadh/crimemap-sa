"use client";

import { useState } from "react";

import { CrimeMap } from "@/components/map/crime-map";
import { trackEvent } from "@/lib/analytics";
import type { MapCategoryOption } from "@/lib/map/categories";

export type { MapCategoryOption };

/**
 * The map plus its filters.
 *
 * Filter state lives here rather than in the URL-driven server component so that changing a
 * category does not reload the page and reset the viewport the reader has panned to.
 */
export function MapExplorer({
  years,
  categories,
  initialYear,
  initialCategory,
  detail = true,
}: {
  years: readonly string[];
  categories: readonly MapCategoryOption[];
  initialYear: string | null;
  initialCategory: string;
  /** When false, hide the long definition and methodology note — used on the homepage. */
  detail?: boolean;
}) {
  const [year, setYear] = useState(initialYear);
  const [category, setCategory] = useState(initialCategory);
  const [metric, setMetric] = useState<"volume" | "yoy">("volume");
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const selected = categories.find((option) => option.value === category) ?? categories[0];
  const simple = metric === "volume";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {simple ? "Simple view" : "Analysis"}
          </p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
            {simple
              ? selected && selected.value !== "total_recorded_crime"
                ? `Shows how many ${selected.label.toLowerCase()} cases were recorded in ${year ?? "the latest year"}. Colour shows that count. It is not a safety rating.`
                : `Shows the number of recorded crimes in ${year ?? "the latest year"}. Colour shows that count. It is not a safety rating.`
              : "Shows whether recorded crime increased or decreased compared with the previous available year."}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={analysisOpen}
          onClick={() => setAnalysisOpen((open) => !open)}
          className="h-11 shrink-0 rounded-lg border border-border bg-surface-raised px-4 text-sm font-medium hover:border-border-strong"
        >
          {analysisOpen ? "Hide analysis" : "Analysis"}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex min-w-36 flex-1 flex-col gap-1.5 sm:flex-none">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">Period</span>
          <select
            value={year ?? ""}
            onChange={(event) => {
              setYear(event.target.value);
              trackEvent("map_year_changed", { year: event.target.value });
            }}
            className="h-11 min-w-36 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-56 flex-1 flex-col gap-1.5 sm:flex-none">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            Crime category
          </span>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              trackEvent("map_category_changed", { category: event.target.value });
            }}
            className="h-11 min-w-56 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
          >
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {analysisOpen ? (
        <div role="group" aria-label="Analysis view" className="rounded-xl border border-border bg-surface p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            {(
              [
                {
                  value: "volume",
                  label: "Recorded cases",
                  help: "Shows the number of reported crimes.",
                },
                {
                  value: "yoy",
                  label: "Change",
                  help: "Shows whether reported crime increased or decreased.",
                },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={metric === option.value}
                onClick={() => {
                  setMetric(option.value);
                  trackEvent("map_metric_changed", { metric: option.value });
                }}
                className={
                  metric === option.value
                    ? "rounded-lg bg-accent px-4 py-3 text-left text-accent-foreground"
                    : "rounded-lg px-4 py-3 text-left hover:bg-surface-hover"
                }
              >
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs opacity-80">{option.help}</span>
              </button>
            ))}
          </div>
          {detail && selected ? (
            <p className="mt-3 text-xs leading-relaxed text-muted">{selected.definition}</p>
          ) : null}
        </div>
      ) : null}

      <CrimeMap
        financialYear={year}
        category={category}
        categoryLabel={selected?.label ?? "Recorded crimes"}
        metric={metric}
        className="w-full"
      />

      {detail ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Each coloured area is a municipality, not a suburb and not a police precinct. The legend
          on the map stays with the view: one end is fewer recorded cases, the other is more. A
          change view uses a decrease-to-increase scale. Grey means the change cannot be
          calculated. Colour is not a safety score. Zoom in to see each police station.
        </p>
      ) : null}
    </div>
  );
}
