import { describe, expect, it } from "vitest";

import {
  FINANCIAL_YEAR_EXPLANATION,
  financialYear,
  formatFinancialYear,
  parseFinancialYear,
  trendWindowLength,
} from "@/lib/crime/financial-year";
import { getFeaturedSeries } from "@/lib/crime/taxonomy";
import {
  buildBreakdown,
  buildCategoryChanges,
  buildSeries,
  buildYearTotals,
  fiveYearChange,
  totalChange,
  type StationYearRecord,
} from "@/lib/metrics/profile";

function record(year: number, counts: Record<string, number | null>): StationYearRecord {
  return {
    financialYear: formatFinancialYear(year),
    financialYearStart: year,
    counts,
  };
}

/**
 * A two-year fixture covering the 17 community-reported crimes, two subcategories and one
 * police-detected category, which is enough to exercise every builder.
 */
const previousYear = record(2024, {
  murder: 20,
  aggr_robbery: 100,
  carjacking: 10,
  burglary_res: 200,
  sexual_offences: 40,
  rape: 30,
  drug_crime: 500,
  common_assault: 60,
  assault_gbh: 70,
  attempted_murder: 5,
  common_robbery: 15,
  burglary_nonres: 25,
  vehicle_theft: 35,
  theft_from_vehicle: 45,
  stock_theft: 5,
  other_theft: 55,
  commercial_crime: 12,
  shoplifting: 8,
  arson: 3,
  malicious_damage: 22,
  kidnapping: 4,
});

const currentYear = record(2025, {
  murder: 25,
  aggr_robbery: 90,
  carjacking: 12,
  burglary_res: 180,
  sexual_offences: 44,
  rape: 33,
  drug_crime: 450,
  common_assault: 66,
  assault_gbh: 63,
  attempted_murder: 5,
  common_robbery: 18,
  burglary_nonres: 20,
  vehicle_theft: 40,
  theft_from_vehicle: 50,
  stock_theft: 4,
  other_theft: 60,
  commercial_crime: 15,
  shoplifting: 10,
  arson: 2,
  malicious_damage: 25,
  kidnapping: 6,
});

const records = [previousYear, currentYear];

describe("financial years", () => {
  it("formats a start year the way the source reports it", () => {
    expect(formatFinancialYear(2025)).toBe("2025/26");
    expect(formatFinancialYear(2008)).toBe("2008/09");
  });

  it("pads the end year at the turn of the century", () => {
    expect(formatFinancialYear(1999)).toBe("1999/00");
  });

  it("round-trips a label back to its start year", () => {
    expect(parseFinancialYear("2025/26")).toBe(2025);
    expect(parseFinancialYear(financialYear(2013).label)).toBe(2013);
  });

  it("refuses to guess at a label it does not recognise", () => {
    expect(parseFinancialYear("2025")).toBeNull();
    expect(parseFinancialYear("2025/2026")).toBeNull();
    expect(parseFinancialYear("")).toBeNull();
  });

  it("explains the financial year in plain language for readers", () => {
    expect(FINANCIAL_YEAR_EXPLANATION).toContain("1 April");
  });

  it("treats the full history as having no fixed length", () => {
    expect(trendWindowLength("5")).toBe(5);
    expect(trendWindowLength("all")).toBeNull();
  });
});

describe("yearly totals", () => {
  const totals = buildYearTotals(currentYear);

  it("adds up only the 17 community-reported crimes", () => {
    expect(totals.totalRecordedCrime).toBe(717);
  });

  it("ignores subcategories, so no crime is counted twice", () => {
    // Carjacking sits inside aggravated robbery. Inflating it must not move the total.
    const inflated = buildYearTotals(
      record(2025, { ...currentYear.counts, carjacking: 9999, rape: 9999 }),
    );
    expect(inflated.totalRecordedCrime).toBe(totals.totalRecordedCrime);
  });

  it("keeps crime detected by police action out of the headline total", () => {
    expect(totals.totalRecordedCrime).toBe(717);
    expect(totals.policeActionTotal).toBe(450);
  });

  it("says how many of the 17 the source did not provide", () => {
    const partial = buildYearTotals(record(2025, { murder: 25, burglary_res: 180 }));
    expect(partial.totalRecordedCrime).toBe(205);
    expect(partial.missingCategories).toBe(15);
  });

  it("reports a complete year as having nothing missing", () => {
    expect(totals.missingCategories).toBe(0);
  });

  it("returns a missing total when the source provides nothing at all", () => {
    const empty = buildYearTotals(record(2025, {}));
    expect(empty.totalRecordedCrime).toBeNull();
    expect(empty.missingCategories).toBe(17);
  });

  it("totals each crime group without double counting", () => {
    // Contact crime: murder 25, attempted_murder 5, assault_gbh 63, common_assault 66,
    // sexual_offences 44, aggr_robbery 90, common_robbery 18 = 311
    expect(totals.groupTotals.contact).toBe(311);
  });
});

describe("year-over-year totals", () => {
  it("compares this year's total with last year's", () => {
    // 717 from 720
    expect(totalChange(currentYear, previousYear).percentChange).toBe(-0.4);
  });

  it("reports no comparison when there is no previous year", () => {
    expect(totalChange(currentYear, null).state).toBe("unavailable");
  });
});

describe("the five-year comparison", () => {
  const history = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((year) =>
    record(year, { murder: 10, burglary_res: year === 2020 ? 100 : 150 }),
  );

  it("compares against the year five years earlier", () => {
    const result = fiveYearChange(history, 2025);
    expect(result.comparisonYear).toBe("2020/21");
    // 160 from 110
    expect(result.change.percentChange).toBeCloseTo(45.5, 1);
  });

  it("reports no comparison when that year is absent, rather than interpolating", () => {
    const result = fiveYearChange(history, 2022);
    expect(result.comparisonYear).toBeNull();
    expect(result.change.state).toBe("unavailable");
  });
});

describe("the trend series", () => {
  it("returns one point per year, oldest first", () => {
    const series = buildSeries(records, getFeaturedSeries("all")!);
    expect(series.map((p) => p.financialYear)).toEqual(["2024/25", "2025/26"]);
  });

  it("orders by year even when records arrive out of order", () => {
    const series = buildSeries([currentYear, previousYear], getFeaturedSeries("murder")!);
    expect(series.map((p) => p.value)).toEqual([20, 25]);
  });

  it("plots the headline total for the total series", () => {
    const series = buildSeries(records, getFeaturedSeries("all")!);
    expect(series.at(-1)?.value).toBe(717);
  });

  it("leaves a year with no figure as a gap rather than a zero", () => {
    const withGap = [...records, record(2026, { murder: null })];
    const series = buildSeries(withGap, getFeaturedSeries("murder")!);
    expect(series.at(-1)?.value).toBeNull();
  });

  it("counts the columns that were missing for a year", () => {
    const series = buildSeries(
      [record(2025, { murder: 25 })],
      getFeaturedSeries("all")!,
    );
    expect(series[0]?.missingCount).toBe(16);
  });
});

describe("the category breakdown", () => {
  const rows = buildBreakdown(currentYear);

  it("lists the 17 community-reported crimes and nothing else", () => {
    expect(rows).toHaveLength(17);
    expect(rows.map((r) => r.column)).not.toContain("carjacking");
    expect(rows.map((r) => r.column)).not.toContain("drug_crime");
  });

  it("orders categories by size, largest first", () => {
    const values = rows.map((r) => r.value ?? -1);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it("shows each category's share of the total", () => {
    expect(rows.find((r) => r.column === "burglary_res")?.shareOfTotal).toBeCloseTo(25.1, 1);
  });

  it("has shares that add up to about 100%", () => {
    const sum = rows.reduce((acc, r) => acc + (r.shareOfTotal ?? 0), 0);
    expect(sum).toBeGreaterThan(99);
    expect(sum).toBeLessThan(101);
  });

  it("marks the categories that can be broken down further", () => {
    expect(rows.find((r) => r.column === "aggr_robbery")?.hasSubcategories).toBe(true);
    expect(rows.find((r) => r.column === "murder")?.hasSubcategories).toBe(false);
  });

  it("sorts missing figures last instead of treating them as zero", () => {
    const withMissing = buildBreakdown(record(2025, { ...currentYear.counts, arson: null }));
    expect(withMissing.at(-1)?.column).toBe("arson");
    expect(withMissing.at(-1)?.shareOfTotal).toBeNull();
  });
});

describe("category changes", () => {
  const changes = buildCategoryChanges(currentYear, previousYear);

  it("never includes a subcategory, which would double count a movement", () => {
    expect(changes.map((c) => c.column)).not.toContain("carjacking");
    expect(changes.map((c) => c.column)).not.toContain("rape");
  });

  it("includes categories recorded outside the 17, such as kidnapping", () => {
    expect(changes.map((c) => c.column)).toContain("kidnapping");
  });

  it("carries a readable label for each category", () => {
    expect(changes.find((c) => c.column === "murder")?.label).toBe("Murder");
  });

  it("computes each category's change", () => {
    expect(changes.find((c) => c.column === "murder")?.percentChange).toBe(25);
    expect(changes.find((c) => c.column === "aggr_robbery")?.percentChange).toBe(-10);
  });

  it("marks every category unavailable when there is no previous year", () => {
    for (const change of buildCategoryChanges(currentYear, null)) {
      expect(change.state).toBe("unavailable");
    }
  });
});
