import { describe, expect, it } from "vitest";

import {
  CHANGE_HIGHLIGHT_RULES,
  LOW_BASE_THRESHOLD,
  calculateChange,
  coerceSourceCount,
  isHighlightableChange,
  rankChanges,
  sumPreservingMissing,
  trendDirection,
  type CategoryChange,
} from "@/lib/metrics/change";

describe("year-over-year change", () => {
  it("reports a rise as a positive percentage", () => {
    const change = calculateChange(110, 100);
    expect(change.state).toBe("ok");
    expect(change.percentChange).toBe(10);
    expect(change.absoluteChange).toBe(10);
  });

  it("reports a decline as a negative percentage", () => {
    const change = calculateChange(90, 100);
    expect(change.state).toBe("ok");
    expect(change.percentChange).toBe(-10);
    expect(change.absoluteChange).toBe(-10);
  });

  it("rounds to one decimal place", () => {
    // 12483 from 13113 is -4.804...%
    expect(calculateChange(12483, 13113).percentChange).toBe(-4.8);
  });

  it("reports no change as zero rather than as missing", () => {
    const change = calculateChange(100, 100);
    expect(change.state).toBe("ok");
    expect(change.percentChange).toBe(0);
  });
});

describe("a zero baseline", () => {
  it("never produces Infinity", () => {
    const change = calculateChange(10, 0);
    expect(change.percentChange).toBeNull();
    expect(Number.isFinite(change.percentChange ?? 0)).toBe(true);
  });

  it("is described as newly recorded", () => {
    const change = calculateChange(10, 0);
    expect(change.state).toBe("newly_recorded");
    expect(change.absoluteChange).toBe(10);
  });

  it("distinguishes zero in both years from a new occurrence", () => {
    expect(calculateChange(0, 0).state).toBe("none_in_either_year");
  });
});

describe("missing values", () => {
  it("stays missing when the current value is unavailable", () => {
    const change = calculateChange(null, 100);
    expect(change.state).toBe("unavailable");
    expect(change.percentChange).toBeNull();
    expect(change.absoluteChange).toBeNull();
  });

  it("stays missing when the previous value is unavailable", () => {
    expect(calculateChange(100, null).state).toBe("unavailable");
  });

  it("never treats a missing value as zero", () => {
    // If null became 0 this would report "newly recorded" instead of unavailable.
    expect(calculateChange(50, null).state).not.toBe("newly_recorded");
  });

  it("keeps zero distinct from missing", () => {
    expect(calculateChange(5, 0).state).toBe("newly_recorded");
    expect(calculateChange(5, null).state).toBe("unavailable");
  });
});

describe("negative source values", () => {
  it("treats a negative count as unavailable, not as zero", () => {
    // The source contains 1,203 negative values, mostly in 2005/06 to 2007/08.
    expect(coerceSourceCount(-1)).toBeNull();
    expect(coerceSourceCount(-17)).toBeNull();
  });

  it("leaves a genuine zero untouched", () => {
    expect(coerceSourceCount(0)).toBe(0);
  });

  it("leaves a positive count untouched", () => {
    expect(coerceSourceCount(42)).toBe(42);
  });

  it("treats a missing value as missing", () => {
    expect(coerceSourceCount(null)).toBeNull();
    expect(coerceSourceCount(undefined)).toBeNull();
  });
});

describe("small bases", () => {
  it("flags a percentage built on a tiny previous count", () => {
    const change = calculateChange(2, 1);
    expect(change.percentChange).toBe(100);
    expect(change.lowBase).toBe(true);
  });

  it("does not flag a substantial previous count", () => {
    const change = calculateChange(550, 500);
    expect(change.percentChange).toBe(10);
    expect(change.lowBase).toBe(false);
  });

  it("uses the documented threshold", () => {
    expect(calculateChange(11, LOW_BASE_THRESHOLD - 1).lowBase).toBe(true);
    expect(calculateChange(11, LOW_BASE_THRESHOLD).lowBase).toBe(false);
  });
});

describe("highlight rules", () => {
  it("excludes a large percentage built on a tiny base", () => {
    // 1 -> 2 is +100% but only one extra case.
    expect(isHighlightableChange(calculateChange(2, 1))).toBe(false);
  });

  it("includes a substantial movement", () => {
    expect(isHighlightableChange(calculateChange(550, 500))).toBe(true);
  });

  it("excludes a movement that is proportionally trivial", () => {
    // 500 -> 510 is +2%, below the percentage threshold.
    expect(isHighlightableChange(calculateChange(510, 500))).toBe(false);
  });

  it("excludes a movement too small in absolute terms", () => {
    // 10 -> 13 is +30% but only three cases.
    const change = calculateChange(13, 10);
    expect(change.percentChange).toBe(30);
    expect(
      Math.abs(change.absoluteChange ?? 0) < CHANGE_HIGHLIGHT_RULES.minimumAbsoluteChange,
    ).toBe(true);
    expect(isHighlightableChange(change)).toBe(false);
  });

  it("excludes states without a percentage", () => {
    expect(isHighlightableChange(calculateChange(10, 0))).toBe(false);
    expect(isHighlightableChange(calculateChange(10, null))).toBe(false);
  });
});

describe("ranking changes", () => {
  const changes: CategoryChange[] = [
    { ...calculateChange(2, 1), column: "bank_robbery", label: "Bank robbery" },
    { ...calculateChange(143, 121), column: "vehicle_theft", label: "Vehicle theft" },
    { ...calculateChange(391, 455), column: "burglary_res", label: "Residential burglary" },
    { ...calculateChange(246, 229), column: "aggr_robbery", label: "Aggravated robbery" },
    { ...calculateChange(30, null), column: "murder", label: "Murder" },
  ];

  it("keeps a tiny-base spike out of the increases", () => {
    const top = rankChanges(changes, "increase");
    expect(top.map((c) => c.column)).not.toContain("bank_robbery");
  });

  it("ranks real increases by percentage", () => {
    const top = rankChanges(changes, "increase");
    expect(top[0]?.column).toBe("vehicle_theft");
  });

  it("returns only decreases when asked for decreases", () => {
    const down = rankChanges(changes, "decrease");
    expect(down.map((c) => c.column)).toEqual(["burglary_res"]);
  });

  it("omits categories with no comparable figure", () => {
    const all = [...rankChanges(changes, "increase"), ...rankChanges(changes, "decrease")];
    expect(all.map((c) => c.column)).not.toContain("murder");
  });

  it("is deterministic for equal changes", () => {
    const tied: CategoryChange[] = [
      { ...calculateChange(120, 100), column: "b_column", label: "Beta" },
      { ...calculateChange(120, 100), column: "a_column", label: "Alpha" },
    ];
    expect(rankChanges(tied, "increase").map((c) => c.label)).toEqual(["Alpha", "Beta"]);
  });

  it("respects the requested limit", () => {
    expect(rankChanges(changes, "increase", 1)).toHaveLength(1);
  });
});

describe("trend direction", () => {
  it("calls a clear rise an increase", () => {
    expect(trendDirection(calculateChange(120, 100))).toBe("increase");
  });

  it("calls a clear fall a decrease", () => {
    expect(trendDirection(calculateChange(80, 100))).toBe("decrease");
  });

  it("calls a movement inside the band broadly unchanged", () => {
    expect(trendDirection(calculateChange(101, 100))).toBe("broadly_unchanged");
  });

  it("reports unavailable when the figures cannot be compared", () => {
    expect(trendDirection(calculateChange(null, 100))).toBe("unavailable");
  });

  it("treats a first recorded occurrence as an increase", () => {
    expect(trendDirection(calculateChange(5, 0))).toBe("increase");
  });
});

describe("summing while preserving missing values", () => {
  it("returns null only when every value is missing", () => {
    expect(sumPreservingMissing([null, null]).total).toBeNull();
    expect(sumPreservingMissing([null, 5]).total).toBe(5);
  });

  it("counts how many values were missing", () => {
    const result = sumPreservingMissing([1, null, 3, undefined]);
    expect(result.total).toBe(4);
    expect(result.missingCount).toBe(2);
    expect(result.presentCount).toBe(2);
  });

  it("treats zero as a real value", () => {
    const result = sumPreservingMissing([0, 0]);
    expect(result.total).toBe(0);
    expect(result.missingCount).toBe(0);
  });
});
