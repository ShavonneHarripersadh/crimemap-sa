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
