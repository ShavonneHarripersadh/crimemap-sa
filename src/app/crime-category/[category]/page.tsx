import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryExplorer } from "@/components/category/category-explorer";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { DataUnavailable } from "@/components/data/data-unavailable";
import { Eyebrow, PageHeader } from "@/components/ui/section";
import { TOTAL_SERIES_TOKEN, explorableCategories, getExplorableCategory } from "@/lib/crime/taxonomy";
import {
  getAvailableFinancialYears,
  getNationalSeriesTrend,
  getProvinceSeriesTotals,
} from "@/lib/data/aggregates";
import type { SeriesPoint } from "@/lib/metrics/profile";

export const revalidate = 86_400;

interface RouteParams {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ year?: string | string[]; province?: string | string[] }>;
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function generateStaticParams() {
  return explorableCategories().map((category) => ({ category: category.key }));
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getExplorableCategory(slug);
  if (!category) return { title: "Category not found" };

  return {
    title: `${category.label} in South Africa`,
    description: `National recorded ${category.label.toLowerCase()} statistics, provincial breakdowns and historical highs and lows from South African Police Service station records.`,
    alternates: { canonical: `/crime-category/${slug}` },
  };
}

export default async function CrimeCategoryPage({ params, searchParams }: RouteParams) {
  const { category: slug } = await params;
  const query = await searchParams;
  const category = getExplorableCategory(slug);
  if (!category) notFound();

  const [yearsResult, trendResult] = await Promise.all([
    getAvailableFinancialYears(),
    getNationalSeriesTrend(category.columns),
  ]);

  if (!yearsResult.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <DataUnavailable error={yearsResult.error} />
      </div>
    );
  }
  if (!trendResult.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <DataUnavailable error={trendResult.error} />
      </div>
    );
  }

  const years = yearsResult.data.map((row) => row.financialYear);
  const selectedYear =
    firstParam(query.year) && years.includes(firstParam(query.year) ?? "")
      ? firstParam(query.year)
      : (years[0] ?? null);
  const selectedProvince = firstParam(query.province);

  const provincesResult = await getProvinceSeriesTotals({
    columns: category.columns,
    financialYear: selectedYear,
  });

  const points: SeriesPoint[] = trendResult.data.map((row) => ({
    financialYear: row.financialYear,
    financialYearStart: row.financialYearStart,
    value: row.value,
    missingCount: row.value === null ? 1 : 0,
  }));

  const mapCategory =
    category.columns.includes(TOTAL_SERIES_TOKEN) || category.columns[0] === "total_recorded_crime"
      ? "total_recorded_crime"
      : (category.columns[0] ?? "total_recorded_crime");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <TrackOnMount event="category_deep_dive_opened" properties={{ category: slug }} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/crime-category" className="hover:text-foreground">
              Categories
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-foreground">{category.label}</li>
        </ol>
      </nav>

      <PageHeader>
        <Eyebrow>Crime category</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {category.label} in South Africa
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          {category.definition}
          {category.composite
            ? " This is a CrimeMap SA grouping of more than one source column, not a figure SAPS publishes under this name."
            : ""}
        </p>
      </PageHeader>

      {provincesResult.ok ? (
        <CategoryExplorer
          categoryKey={slug}
          label={category.label}
          mapCategory={mapCategory}
          composite={category.composite}
          years={years}
          initialYear={selectedYear}
          initialProvince={selectedProvince}
          nationalPoints={points}
          initialProvinces={provincesResult.data}
        />
      ) : (
        <DataUnavailable error={provincesResult.error} />
      )}
    </div>
  );
}
