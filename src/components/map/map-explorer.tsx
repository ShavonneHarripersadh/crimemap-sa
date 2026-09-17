"use client";

import { useState } from "react";

import { CrimeMap } from "@/components/map/crime-map";
import { Note } from "@/components/ui/note";
import { trackEvent } from "@/lib/analytics";

export interface MapCategoryOption {
  readonly value: string;
  readonly label: string;
  readonly definition: string;
}

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
}: {
  years: readonly string[];
  categories: readonly MapCategoryOption[];
  initialYear: string | null;
  initialCategory: string;
}) {
  const [year, setYear] = useState(initialYear);
  const [category, setCategory] = useState(initialCategory);

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

        {selected ? (
          <p className="max-w-md flex-1 text-xs leading-relaxed text-muted">
            {selected.definition}
          </p>
        ) : null}
      </div>

      <CrimeMap
        financialYear={year}
        category={category}
        categoryLabel={selected?.label ?? "Recorded crimes"}
        className="w-full"
      />

      <Note>
        Each coloured area is a local municipality, not a suburb and not an official police
        precinct. Green is fewer recorded cases in the selected year, red is more. Colour is a
        count, not a safety score. Zoom in to see each police station. Change the year to compare
        the same places; the total in the legend is the sum of stations currently loaded.
      </Note>
    </div>
  );
}
