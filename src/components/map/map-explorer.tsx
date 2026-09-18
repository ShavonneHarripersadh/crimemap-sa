"use client";

import { useState } from "react";

import { CrimeMap } from "@/components/map/crime-map";
import { Note } from "@/components/ui/note";
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

  const selected = categories.find((option) => option.value === category) ?? categories[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            Financial year
          </span>
          <select
            value={year ?? ""}
            onChange={(event) => {
              setYear(event.target.value);
              trackEvent("map_year_changed", { year: event.target.value });
            }}
            className="h-10 min-w-36 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            Crime category
          </span>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              trackEvent("map_category_changed", { category: event.target.value });
            }}
            className="h-10 min-w-56 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
          >
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div role="group" aria-label="Map metric" className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">Metric</span>
          <div className="flex rounded-lg border border-border bg-surface p-1">
            {(
              [
                { value: "volume", label: "Recorded volume" },
                { value: "yoy", label: "Year-on-year change" },
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
                    ? "rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
                    : "rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {detail && selected ? (
          <p className="max-w-md flex-1 text-xs leading-relaxed text-muted">
            {selected.definition}
          </p>
        ) : null}
      </div>

      <CrimeMap
        financialYear={year}
        category={category}
        categoryLabel={selected?.label ?? "Recorded crimes"}
        metric={metric}
        className="w-full"
      />

      {detail ? (
        <Note>
          Each coloured area is a local municipality, not a suburb and not an official police
          precinct. Recorded volume uses green for fewer cases and red for more. Year-on-year change
          uses cooler colours for a decrease and warmer colours for an increase; grey means the
          change cannot be calculated because of missing figures or a small previous-year count.
          Colour is not a safety score. Zoom in to see each police station.
        </Note>
      ) : null}
    </div>
  );
}
