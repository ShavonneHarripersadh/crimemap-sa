import { describe, expect, it } from "vitest";

import { formatFinancialYear } from "@/lib/crime/financial-year";
import {
  UNUSUAL_MOVEMENT_RULES,
  buildCrimeHistory,
  buildHistoricalContext,
  classifyUnusualMovement,
  seriesThroughYear,
} from "@/lib/metrics/history";
import type { SeriesPoint } from "@/lib/metrics/profile";
import { buildInsights } from "@/lib/metrics/insights";
import { calculateChange } from "@/lib/metrics/change";

function point(year: number, value: number | null): SeriesPoint {
  return {
    financialYear: formatFinancialYear(year),
    financialYearStart: year,
    value,
    missingCount: value === null ? 1 : 0,
  };
}

describe("historical context", () => {
  const series = [
    point(2016, 12000),
    point(2017, 12742),
    point(2018, 11000),
    point(2019, 10500),
    point(2020, 6891),
    point(2021, 8000),
    point(2022, 8500),
    point(2023, 9100),
    point(2024, 8800),
    point(2025, 8421),
  ];

  const context = buildHistoricalContext(series);

  it("names the latest year and value", () => {
    expect(context.latestYear).toBe("2025/26");
    expect(context.latestValue).toBe(8421);
  });

  it("averages the last five present years in the window", () => {
    // 2021–2025: 8000, 8500, 9100, 8800, 8421
    expect(context.fiveYear.presentCount).toBe(5);
    expect(context.fiveYear.average).toBe(Math.round((8000 + 8500 + 9100 + 8800 + 8421) / 5));
  });

  it("does not treat a missing year as zero in the average", () => {
    const withGap = [...series.slice(0, -3), point(2023, null), ...series.slice(-2)];
    const result = buildHistoricalContext(withGap);
    expect(result.fiveYear.missingCount).toBe(1);
    expect(result.fiveYear.average).not.toBe(0);
  });

  it("identifies the historical high and low", () => {
    expect(context.extremes.high).toEqual({ financialYear: "2017/18", value: 12742 });
    expect(context.extremes.low).toEqual({ financialYear: "2020/21", value: 6891 });
  });

  it("says when the latest figure is inside the historical range", () => {
    expect(context.rangeRelation).toBe("inside_range");
  });

  it("flags the latest year as the historical low when it is", () => {
    const lowLatest = buildHistoricalContext([...series.slice(0, -1), point(2025, 5000)]);
    expect(lowLatest.rangeRelation).toBe("historical_low");
  });
});

describe("seriesThroughYear", () => {
  const series = [
    point(2022, 100),
    point(2023, 110),
    point(2024, 90),
    point(2025, 80),
  ];

  it("stops the series at the selected financial year so later years are not treated as current", () => {
    const through = seriesThroughYear(series, "2023/24");
    expect(through.map((row) => row.financialYear)).toEqual(["2022/23", "2023/24"]);
    expect(through.at(-1)?.value).toBe(110);
  });

  it("leaves the series unchanged when the year is missing from the points", () => {
    expect(seriesThroughYear(series, "2010/11")).toEqual(seriesThroughYear(series, null));
  });
});

describe("crime history milestones", () => {
  const series = [
    point(2015, 100),
    point(2016, 121),
    point(2017, 110),
    point(2018, 90),
    point(2019, 95),
  ];
  const history = buildCrimeHistory(series);

  it("records the highest and lowest years", () => {
    expect(history.highest).toEqual({ financialYear: "2016/17", value: 121 });
    expect(history.lowest).toEqual({ financialYear: "2018/19", value: 90 });
  });

  it("records the largest comparable increase and decrease", () => {
    expect(history.largestIncrease?.financialYear).toBe("2016/17");
    expect(history.largestIncrease?.change.percentChange).toBe(21);
    expect(history.largestDecrease?.financialYear).toBe("2018/19");
  });

  it("does not treat a rise from zero as a percentage extreme", () => {
    const fromZero = buildCrimeHistory([point(2018, 0), point(2019, 80), point(2020, 82)]);
    expect(fromZero.largestIncrease?.financialYear).not.toBe("2019/20");
  });
});

describe("unusual movement", () => {
  const stable = Array.from({ length: 8 }, (_, index) => point(2018 + index, 1000 + index * 10));

  it("does not classify without enough earlier comparable movements", () => {
    const short = [point(2023, 100), point(2024, 120), point(2025, 150)];
    const result = classifyUnusualMovement(short);
    expect(result.classification).toBe("insufficient");
    expect(result.priorComparableCount).toBeLessThan(
      UNUSUAL_MOVEMENT_RULES.minimumPriorObservations,
    );
  });

  it("does not classify a small-base percentage", () => {
    const result = classifyUnusualMovement([
      ...stable.slice(0, 6).map((item, index) => point(item.financialYearStart, 8 + index)),
      point(2024, 9),
      point(2025, 18),
    ]);
    expect(result.classification).toBe("unavailable");
  });

  it("labels the largest recorded increase when the latest rise is strictly the biggest", () => {
    const series = [
      point(2018, 1000),
      point(2019, 1020),
      point(2020, 1010),
      point(2021, 1030),
      point(2022, 1040),
      point(2023, 1050),
      point(2024, 1060),
      point(2025, 1500),
    ];
    expect(classifyUnusualMovement(series).classification).toBe("largest_increase");
  });

  it("labels a typical small move as within the historical range", () => {
    expect(classifyUnusualMovement(stable).classification).toBe("normal");
  });
});

describe("insight engine", () => {
  it("does not emit an insight without an underlying calculation", () => {
    const insights = buildInsights({
      entityId: "randburg",
      financialYear: "2025/26",
      previousFinancialYear: "2024/25",
      totalRecordedCrime: 8421,
      previousTotalRecordedCrime: 8800,
      missingCategories: 0,
      totalChange: calculateChange(8421, 8800),
      categoryChanges: [],
      historical: buildHistoricalContext([
        point(2021, 9000),
        point(2022, 9100),
        point(2023, 9050),
        point(2024, 8800),
        point(2025, 8421),
      ]),
      unusual: classifyUnusualMovement([
        point(2021, 9000),
        point(2022, 9100),
        point(2023, 9050),
        point(2024, 8800),
        point(2025, 8421),
      ]),
      breakdown: [
        {
          column: "other_theft",
          label: "Theft",
          group: "other_serious",
          value: 3200,
          shareOfTotal: 38,
          hasSubcategories: false,
        },
      ],
    });

    expect(insights.length).toBeGreaterThan(0);
    expect(insights.length).toBeLessThanOrEqual(4);
    for (const insight of insights) {
      expect(insight.calculation.length).toBeGreaterThan(0);
      expect(insight.text.toLowerCase()).not.toContain("safe");
      expect(insight.text.toLowerCase()).not.toContain("will increase");
      expect(insight.text.toLowerCase()).not.toContain("because");
    }
  });

  it("stays silent when nothing notable happened", () => {
    const change = calculateChange(1000, 1002);
    const insights = buildInsights({
      entityId: "quiet",
      financialYear: "2025/26",
      previousFinancialYear: "2024/25",
      totalRecordedCrime: 1000,
      previousTotalRecordedCrime: 1002,
      missingCategories: 0,
      totalChange: change,
      categoryChanges: [],
      historical: buildHistoricalContext([
        point(2021, 1000),
        point(2022, 1001),
        point(2023, 999),
        point(2024, 1002),
        point(2025, 1000),
      ]),
      unusual: classifyUnusualMovement([
        point(2021, 1000),
        point(2022, 1001),
        point(2023, 999),
        point(2024, 1002),
        point(2025, 1000),
      ]),
      breakdown: [
        {
          column: "murder",
          label: "Murder",
          group: "contact",
          value: 10,
          shareOfTotal: 1,
          hasSubcategories: false,
        },
      ],
    });

    expect(insights).toEqual([]);
  });
});
