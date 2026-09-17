import { describe, expect, it } from "vitest";

import sourceSchema from "../data/reference/source_schema.json";
import {
  ALL_CRIME_COLUMNS,
  CHANGE_HIGHLIGHT_COLUMNS,
  CRIME_CATEGORIES,
  FEATURED_SERIES,
  HEADLINE_COMMUNITY_COLUMNS,
  POLICE_ACTION_COLUMNS,
  TOTAL_SERIES_TOKEN,
  subcategoriesOf,
} from "@/lib/crime/taxonomy";

/**
 * These guard the grouping that every total depends on. If someone adds a category to the
 * taxonomy without deciding whether it is a headline crime or a subcategory, a total would
 * silently start double counting; these tests fail instead.
 */

describe("the taxonomy matches the source dataset", () => {
  it("only contains columns that exist in the source", () => {
    const sourceColumns = new Set(sourceSchema.offence_variables);
    for (const column of ALL_CRIME_COLUMNS) {
      expect(sourceColumns.has(column), `${column} is not a source variable`).toBe(true);
    }
  });

  it("covers every offence variable the source provides", () => {
    const taxonomyColumns = new Set(ALL_CRIME_COLUMNS);
    for (const column of sourceSchema.offence_variables) {
      expect(taxonomyColumns.has(column), `${column} is missing from the taxonomy`).toBe(true);
    }
  });

  it("has no duplicate column names", () => {
    expect(new Set(ALL_CRIME_COLUMNS).size).toBe(ALL_CRIME_COLUMNS.length);
  });
});

describe("the community-reported total", () => {
  it("is built from exactly the 17 serious crimes SAPS publishes", () => {
    expect(HEADLINE_COMMUNITY_COLUMNS).toHaveLength(17);
  });

  it("excludes every subcategory, so no crime is counted twice", () => {
    const subcategories = CRIME_CATEGORIES.filter((c) => c.role === "subcategory");
    expect(subcategories.length).toBeGreaterThan(0);
    for (const category of subcategories) {
      expect(
        HEADLINE_COMMUNITY_COLUMNS,
        `${category.name} is a subcategory and must not be in the total`,
      ).not.toContain(category.name);
    }
  });

  it("excludes crimes detected by police action", () => {
    for (const column of POLICE_ACTION_COLUMNS) {
      expect(HEADLINE_COMMUNITY_COLUMNS).not.toContain(column);
    }
    expect(POLICE_ACTION_COLUMNS).toHaveLength(4);
  });

  it("excludes kidnapping, which sits outside the 17 and the 4", () => {
    expect(HEADLINE_COMMUNITY_COLUMNS).not.toContain("kidnapping");
    expect(POLICE_ACTION_COLUMNS).not.toContain("kidnapping");
  });
});

describe("parent totals and their subcategories", () => {
  it("treats aggravated robbery as a parent containing the six published subcategories", () => {
    const parts = subcategoriesOf("aggr_robbery").map((c) => c.name);
    expect(parts).toHaveLength(6);
    expect(parts).toContain("carjacking");
    expect(parts).toContain("truck_hijacking");
    expect(HEADLINE_COMMUNITY_COLUMNS).toContain("aggr_robbery");
  });

  it("treats sexual offences as a parent containing its four breakdown columns", () => {
    const parts = subcategoriesOf("sexual_offences").map((c) => c.name);
    expect(parts).toHaveLength(4);
    expect(parts).toContain("rape");
    expect(HEADLINE_COMMUNITY_COLUMNS).toContain("sexual_offences");
  });

  it("gives every subcategory a parent that is itself a headline crime", () => {
    for (const category of CRIME_CATEGORIES) {
      if (category.role !== "subcategory") continue;
      expect(category.parent).not.toBeNull();
      expect(HEADLINE_COMMUNITY_COLUMNS).toContain(category.parent);
    }
  });
});

describe("the what's-changing candidates", () => {
  it("exclude subcategories and police-detected crime", () => {
    for (const column of CHANGE_HIGHLIGHT_COLUMNS) {
      const category = CRIME_CATEGORIES.find((c) => c.name === column);
      expect(category?.role).not.toBe("subcategory");
      expect(category?.group).not.toBe("police_action");
    }
  });

  it("cover the 17 plus the categories recorded outside them", () => {
    for (const column of HEADLINE_COMMUNITY_COLUMNS) {
      expect(CHANGE_HIGHLIGHT_COLUMNS).toContain(column);
    }
    expect(CHANGE_HIGHLIGHT_COLUMNS).toContain("kidnapping");
  });
});

describe("the trend chart categories", () => {
  it("reference real source columns or the total token", () => {
    for (const series of FEATURED_SERIES) {
      for (const column of series.columns) {
        if (column === TOTAL_SERIES_TOKEN) continue;
        expect(ALL_CRIME_COLUMNS, `${column} in series ${series.key}`).toContain(column);
      }
    }
  });

  it("label a grouping of several columns as a CrimeMap SA composite", () => {
    for (const series of FEATURED_SERIES) {
      const combinesColumns =
        series.columns.length > 1 && !series.columns.includes(TOTAL_SERIES_TOKEN);
      if (combinesColumns) expect(series.composite).toBe(true);
    }
  });

  it("documents every option", () => {
    for (const series of FEATURED_SERIES) {
      expect(series.definition.length).toBeGreaterThan(10);
    }
  });
});
