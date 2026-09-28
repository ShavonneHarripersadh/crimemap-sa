import { describe, expect, it } from "vitest";

import {
  searchSelectionProperties,
  unmatchedSearchProperties,
} from "@/lib/analytics";
import { geocodedPlaceResult } from "@/lib/data/search-results";
import type { SearchResult } from "@/lib/data/search-results";
import { breadcrumbList, pageTitle } from "@/lib/seo";

describe("search analytics properties", () => {
  it("records a chosen precinct by public slug and province", () => {
    const result: SearchResult = {
      type: "station",
      typeLabel: "Police precinct",
      label: "Randburg",
      context: "City of Johannesburg · Gauteng",
      href: "/crime/gauteng/randburg",
      stationCount: 1,
      entityType: "station",
      entityId: 42,
    };

    expect(searchSelectionProperties(result)).toEqual({
      search_type: "lookup",
      entity_type: "station",
      result_count: 1,
      entity: "randburg",
      province: "gauteng",
    });
    expect(JSON.stringify(searchSelectionProperties(result))).not.toContain("42");
  });

  it("records a geocoded place without treating it as an official precinct", () => {
    const result = geocodedPlaceResult("Bromhof", 1);
    expect(searchSelectionProperties(result)).toMatchObject({
      entity_type: "place",
      entity: "bromhof",
    });
    expect(searchSelectionProperties(result)).not.toHaveProperty("province");
  });

  it("drops contact-shaped unmatched queries", () => {
    expect(unmatchedSearchProperties("bromhof")).toMatchObject({
      result_count: 0,
      unmatched_query: "bromhof",
    });
    expect(unmatchedSearchProperties("person@example.com")).toBeNull();
    expect(unmatchedSearchProperties("0821234567")).toBeNull();
  });
});

describe("public page titles and breadcrumbs", () => {
  it("builds a title that names the product once", () => {
    expect(pageTitle("Randburg Crime Statistics & Trends")).toBe(
      "Randburg Crime Statistics & Trends | CrimeMap SA",
    );
  });

  it("emits a breadcrumb list with absolute production-shaped paths", () => {
    const data = breadcrumbList([
      { name: "Home", path: "/" },
      { name: "Gauteng", path: "/crime/gauteng" },
    ]);
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement).toHaveLength(2);
    expect(data.itemListElement[1]?.item).toMatch(/\/crime\/gauteng$/);
    expect(JSON.stringify(data)).not.toContain("aggregateRating");
  });
});
