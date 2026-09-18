import "server-only";

import { categoryLabel } from "@/lib/crime/taxonomy";
import { fail, ok, NOT_CONFIGURED_MESSAGE, type DataResult } from "@/lib/data/result";
import { calculateChange, type CategoryChange, type Change } from "@/lib/metrics/change";
import { getServerClient } from "@/lib/supabase/server";

/**
 * National and provincial roll-ups.
 *
 * The database returns raw counts only. Every percentage, direction and ranking rule is applied
 * here through src/lib/metrics, so the same calculation serves a station, a province and the
 * country.
 */

export interface FinancialYearOption {
  readonly financialYear: string;
  readonly financialYearStart: number;
  readonly stationsReporting: number;
}

export async function getAvailableFinancialYears(): Promise<DataResult<FinancialYearOption[]>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { data, error } = await client.rpc("available_financial_years");
  if (error) return fail("query_failed", error.message);

  return ok(
    (data ?? []).map((row) => ({
      financialYear: row.financial_year,
      financialYearStart: Number(row.financial_year_start),
      stationsReporting: Number(row.stations_reporting ?? 0),
    })),
  );
}

export interface AreaOverview {
  readonly financialYear: string;
  readonly totalRecordedCrime: number | null;
  readonly change: Change;
  readonly stationsReporting: number;
  readonly stationsTotal: number;
  /** How many station-year category figures the source did not provide. */
  readonly categoriesMissing: number;
}

export async function getNationalOverview(
  financialYear?: string | null,
): Promise<DataResult<AreaOverview>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { data, error } = await client.rpc("national_totals", {
    p_year: financialYear ?? undefined,
  });
  if (error) return fail("query_failed", error.message);

  const row = data?.[0];
  if (!row) return fail("not_found", "No crime records have been loaded yet.");

  const total = row.total_recorded_crime === null ? null : Number(row.total_recorded_crime);
  const previous = row.previous_total === null ? null : Number(row.previous_total);

  return ok({
    financialYear: row.financial_year,
    totalRecordedCrime: total,
    change: calculateChange(total, previous),
    stationsReporting: Number(row.stations_reporting ?? 0),
    stationsTotal: Number(row.stations_total ?? 0),
    categoriesMissing: Number(row.categories_missing ?? 0),
  });
}

export interface NationalTrendPoint {
  readonly financialYear: string;
  readonly financialYearStart: number;
  readonly value: number | null;
  readonly stationsReporting: number;
}

export async function getNationalTrend(): Promise<DataResult<NationalTrendPoint[]>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { data, error } = await client.rpc("national_trend");
  if (error) return fail("query_failed", error.message);

  return ok(
    (data ?? []).map((row) => ({
      financialYear: row.financial_year,
      financialYearStart: Number(row.financial_year_start),
      value: row.total_recorded_crime === null ? null : Number(row.total_recorded_crime),
      stationsReporting: Number(row.stations_reporting ?? 0),
    })),
  );
}

export interface ProvinceOverview {
  readonly slug: string;
  readonly name: string;
  readonly financialYear: string;
  readonly totalRecordedCrime: number | null;
  readonly change: Change;
  readonly stationsReporting: number;
  readonly stationsTotal: number;
}

/** Provinces in alphabetical order. CrimeMap SA does not present them as a league table. */
export async function getProvinceOverviews(
  financialYear?: string | null,
): Promise<DataResult<ProvinceOverview[]>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { data, error } = await client.rpc("province_totals", {
    p_year: financialYear ?? undefined,
  });
  if (error) return fail("query_failed", error.message);

  return ok(
    (data ?? []).map((row) => {
      const total = row.total_recorded_crime === null ? null : Number(row.total_recorded_crime);
      const previous = row.previous_total === null ? null : Number(row.previous_total);

      return {
        slug: row.province_slug,
        name: row.province_name,
        financialYear: row.financial_year,
        totalRecordedCrime: total,
        change: calculateChange(total, previous),
        stationsReporting: Number(row.stations_reporting ?? 0),
        stationsTotal: Number(row.stations_total ?? 0),
      };
    }),
  );
}

/**
 * Per-category totals with the previous year, for the "What's changing?" panel at national or
 * provincial level. Pass no province slug for the whole country.
 */
export async function getCategoryChanges(options: {
  financialYear?: string | null;
  provinceSlug?: string | null;
}): Promise<DataResult<{ changes: CategoryChange[]; stationsReporting: number }>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { data, error } = await client.rpc("category_totals", {
    p_year: options.financialYear ?? undefined,
    p_province_slug: options.provinceSlug ?? undefined,
  });
  if (error) return fail("query_failed", error.message);

  const changes: CategoryChange[] = (data ?? []).map((row) => {
    const current = row.current_total === null ? null : Number(row.current_total);
    const previous = row.previous_total === null ? null : Number(row.previous_total);

    return {
      ...calculateChange(current, previous),
      column: row.column_name,
      label: categoryLabel(row.column_name),
    };
  });

  const stationsReporting = Math.max(
    0,
    ...(data ?? []).map((row) => Number(row.stations_reporting ?? 0)),
  );

  return ok({ changes, stationsReporting });
}

export interface ProvinceStation {
  readonly slug: string;
  readonly name: string;
  readonly localMunicipality: string | null;
  readonly districtMunicipality: string | null;
  readonly provinceName: string | null;
  readonly provinceSlug: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly financialYear: string;
  readonly totalRecordedCrime: number | null;
  readonly missingCategories: number;
  readonly change: Change;
}

/** Stations in a province, in alphabetical order. Sorting by size is the reader's choice. */
export async function getProvinceStations(
  provinceSlug: string,
  financialYear?: string | null,
): Promise<DataResult<ProvinceStation[]>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { data, error } = await client.rpc("province_station_totals", {
    p_province_slug: provinceSlug,
    p_year: financialYear ?? undefined,
  });
  if (error) return fail("query_failed", error.message);

  const stations: ProvinceStation[] = (data ?? []).map((row) => {
    const total = row.total_recorded_crime === null ? null : Number(row.total_recorded_crime);
    const previous = row.previous_total === null ? null : Number(row.previous_total);

    return {
      slug: row.station_slug,
      name: row.station_name,
      localMunicipality: row.local_municipality,
      districtMunicipality: row.district_municipality,
      provinceName: row.province_name,
      provinceSlug: row.province_slug,
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
      financialYear: row.financial_year,
      totalRecordedCrime: total,
      missingCategories: Number(row.total_recorded_missing ?? 0),
      change: calculateChange(total, previous),
    };
  });

  return ok([...stations].sort((a, b) => a.name.localeCompare(b.name)));
}

function asCount(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export async function getNationalCategoryTrend(
  category: string,
): Promise<DataResult<NationalTrendPoint[]>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  if (category === "total_recorded_crime") return getNationalTrend();

  const { data, error } = await client.rpc("national_category_trend", {
    p_category: category,
  });

  if (error) return fail("query_failed", error.message);

  return ok(
    (data ?? []).map((row) => ({
      financialYear: row.financial_year,
      financialYearStart: Number(row.financial_year_start),
      value: asCount(row.category_value),
      stationsReporting: Number(row.stations_reporting ?? 0),
    })),
  );
}

export async function getNationalSeriesTrend(
  columns: readonly string[],
): Promise<DataResult<NationalTrendPoint[]>> {
  if (columns.includes("__total_recorded_crime__") || columns[0] === "total_recorded_crime") {
    return getNationalTrend();
  }

  const parts = await Promise.all(columns.map((column) => getNationalCategoryTrend(column)));
  const failed = parts.find((part) => !part.ok);
  if (failed && !failed.ok) return failed;

  const byYear = new Map<
    number,
    {
      financialYear: string;
      financialYearStart: number;
      value: number | null;
      stationsReporting: number;
      present: number;
    }
  >();
  for (const part of parts) {
    if (!part.ok) continue;
    for (const point of part.data) {
      const current = byYear.get(point.financialYearStart);
      if (!current) {
        byYear.set(point.financialYearStart, {
          financialYear: point.financialYear,
          financialYearStart: point.financialYearStart,
          value: point.value,
          stationsReporting: point.stationsReporting,
          present: point.value === null ? 0 : 1,
        });
        continue;
      }
      if (point.value !== null) {
        current.value = (current.value ?? 0) + point.value;
        current.present += 1;
      }
      current.stationsReporting = Math.max(current.stationsReporting, point.stationsReporting);
    }
  }

  return ok(
    [...byYear.values()]
      .sort((a, b) => a.financialYearStart - b.financialYearStart)
      .map(({ present, ...point }) => ({
        ...point,
        value: present === 0 ? null : point.value,
      })),
  );
}

export interface ProvinceCategoryTotal {
  readonly slug: string;
  readonly name: string;
  readonly financialYear: string;
  readonly totalRecordedCrime: number | null;
  readonly change: Change;
  readonly stationsReporting: number;
}

export async function getProvinceCategoryTotals(options: {
  category: string;
  financialYear?: string | null;
}): Promise<DataResult<ProvinceCategoryTotal[]>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  if (options.category === "total_recorded_crime") {
    const overviews = await getProvinceOverviews(options.financialYear);
    if (!overviews.ok) return overviews;
    return ok(
      overviews.data.map((row) => ({
        slug: row.slug,
        name: row.name,
        financialYear: row.financialYear,
        totalRecordedCrime: row.totalRecordedCrime,
        change: row.change,
        stationsReporting: row.stationsReporting,
      })),
    );
  }

  const { data, error } = await client.rpc("province_category_totals", {
    p_category: options.category,
    p_year: options.financialYear ?? undefined,
  });

  if (error) return fail("query_failed", error.message);

  return ok(
    (data ?? []).map((row) => {
      const total = asCount(row.current_total);
      const previous = asCount(row.previous_total);
      return {
        slug: row.province_slug,
        name: row.province_name,
        financialYear: row.financial_year,
        totalRecordedCrime: total,
        change: calculateChange(total, previous),
        stationsReporting: Number(row.stations_reporting ?? 0),
      };
    }),
  );
}

export async function getProvinceSeriesTotals(options: {
  columns: readonly string[];
  financialYear?: string | null;
}): Promise<DataResult<ProvinceCategoryTotal[]>> {
  if (
    options.columns.includes("__total_recorded_crime__") ||
    options.columns[0] === "total_recorded_crime"
  ) {
    return getProvinceCategoryTotals({
      category: "total_recorded_crime",
      financialYear: options.financialYear,
    });
  }

  const parts = await Promise.all(
    options.columns.map((column) =>
      getProvinceCategoryTotals({ category: column, financialYear: options.financialYear }),
    ),
  );
  const failed = parts.find((part) => !part.ok);
  if (failed && !failed.ok) return failed;

  const bySlug = new Map<
    string,
    {
      slug: string;
      name: string;
      financialYear: string;
      totalRecordedCrime: number | null;
      previous: number | null;
      stationsReporting: number;
      present: number;
    }
  >();
  for (const part of parts) {
    if (!part.ok) continue;
    for (const row of part.data) {
      const current = bySlug.get(row.slug);
      if (!current) {
        bySlug.set(row.slug, {
          slug: row.slug,
          name: row.name,
          financialYear: row.financialYear,
          totalRecordedCrime: row.totalRecordedCrime,
          previous: row.change.previous,
          stationsReporting: row.stationsReporting,
          present: row.totalRecordedCrime === null ? 0 : 1,
        });
        continue;
      }
      if (row.totalRecordedCrime !== null) {
        current.totalRecordedCrime = (current.totalRecordedCrime ?? 0) + row.totalRecordedCrime;
        current.present += 1;
      }
      if (row.change.previous !== null) {
        current.previous = (current.previous ?? 0) + row.change.previous;
      } else {
        current.previous = null;
      }
      current.stationsReporting = Math.max(current.stationsReporting, row.stationsReporting);
    }
  }

  return ok(
    [...bySlug.values()]
      .map(({ present, previous, ...row }) => ({
        slug: row.slug,
        name: row.name,
        financialYear: row.financialYear,
        totalRecordedCrime: present === 0 ? null : row.totalRecordedCrime,
        change: calculateChange(present === 0 ? null : row.totalRecordedCrime, previous),
        stationsReporting: row.stationsReporting,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
}

export async function getProvinceCategoryTrend(
  category: string,
  provinceSlug: string,
): Promise<DataResult<NationalTrendPoint[]>> {
  const client = getServerClient();
  if (!client) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  const { data, error } = await client.rpc("province_category_trend", {
    p_category: category,
    p_province_slug: provinceSlug,
  });

  if (error) return fail("query_failed", error.message);

  return ok(
    (data ?? []).map((row) => ({
      financialYear: row.financial_year,
      financialYearStart: Number(row.financial_year_start),
      value: asCount(row.category_value),
      stationsReporting: Number(row.stations_reporting ?? 0),
    })),
  );
}

export async function getProvinceSeriesTrend(
  columns: readonly string[],
  provinceSlug: string,
): Promise<DataResult<NationalTrendPoint[]>> {
  if (
    columns.includes("__total_recorded_crime__") ||
    columns[0] === "total_recorded_crime"
  ) {
    return getProvinceCategoryTrend("total_recorded_crime", provinceSlug);
  }

  const parts = await Promise.all(
    columns.map((column) => getProvinceCategoryTrend(column, provinceSlug)),
  );
  const failed = parts.find((part) => !part.ok);
  if (failed && !failed.ok) return failed;

  const byYear = new Map<
    number,
    {
      financialYear: string;
      financialYearStart: number;
      value: number | null;
      stationsReporting: number;
      present: number;
    }
  >();
  for (const part of parts) {
    if (!part.ok) continue;
    for (const point of part.data) {
      const current = byYear.get(point.financialYearStart);
      if (!current) {
        byYear.set(point.financialYearStart, {
          financialYear: point.financialYear,
          financialYearStart: point.financialYearStart,
          value: point.value,
          stationsReporting: point.stationsReporting,
          present: point.value === null ? 0 : 1,
        });
        continue;
      }
      if (point.value !== null) {
        current.value = (current.value ?? 0) + point.value;
        current.present += 1;
      }
      current.stationsReporting = Math.max(current.stationsReporting, point.stationsReporting);
    }
  }

  return ok(
    [...byYear.values()]
      .sort((a, b) => a.financialYearStart - b.financialYearStart)
      .map(({ present, ...point }) => ({
        ...point,
        value: present === 0 ? null : point.value,
      })),
  );
}

