import { describe, expect, it } from "vitest";

import {
  geocodedPlaceResult,
  presentSearchResults,
  type SearchSourceRow,
} from "@/lib/data/search-results";

function municipality(
  name: string,
  provinceName: string,
  provinceSlug: string,
  entityId: number,
  stationCount: number,
  district: string | null = null,
): SearchSourceRow {
  return {
    result_type: "local_municipality",
    label: name,
    slug: null,
    local_municipality: name,
    district_municipality: district,
    province_name: provinceName,
    province_slug: provinceSlug,
    station_count: stationCount,
    entity_id: entityId,
    entity_type: "local_municipality",
  };
}

describe("duplicate municipality names", () => {
  it("keeps eMalahleni in Eastern Cape and Mpumalanga as two entities", () => {
    const results = presentSearchResults([
      municipality("emalahleni", "Eastern Cape", "eastern-cape", 188, 4, "chris hani"),
      municipality("emalahleni", "Mpumalanga", "mpumalanga", 61, 4, "nkangala"),
    ]);

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.entityId)).toEqual([188, 61]);
    expect(new Set(results.map((result) => result.entityId)).size).toBe(2);
    expect(results.map((result) => result.label)).toEqual(["emalahleni", "emalahleni"]);
    expect(results[0]?.context).toContain("emalahleni — Eastern Cape");
    expect(results[1]?.context).toContain("emalahleni — Mpumalanga");
    expect(results.map((result) => result.href)).toEqual([
      "/crime/eastern-cape?municipality=emalahleni",
      "/crime/mpumalanga?municipality=emalahleni",
    ]);
    expect(results.every((result) => result.type === "local_municipality")).toBe(true);
    expect(results.every((result) => result.entityType === "local_municipality")).toBe(true);
  });

  it("distinguishes any repeated municipality name, not one hardcoded place", () => {
    const results = presentSearchResults([
      municipality("lesedi", "Gauteng", "gauteng", 10, 2),
      municipality("lesedi", "Free State", "free-state", 11, 4),
    ]);

    expect(results.map((result) => result.entityId)).toEqual([10, 11]);
    expect(results[0]?.context).toContain("lesedi — Gauteng");
    expect(results[1]?.context).toContain("lesedi — Free State");
    expect(results[0]?.href).toBe("/crime/gauteng?municipality=lesedi");
    expect(results[1]?.href).toBe("/crime/free-state?municipality=lesedi");
  });

  it("leaves a municipality that occurs once labelled by its source name", () => {
    const [result] = presentSearchResults([
      municipality("city of johannesburg", "Gauteng", "gauteng", 98, 40, "city of johannesburg"),
    ]);

    expect(result?.label).toBe("city of johannesburg");
    expect(result?.context).not.toContain("—");
    expect(result?.context).toContain("Gauteng");
    expect(result?.entityId).toBe(98);
    expect(result?.href).toBe("/crime/gauteng?municipality=city%20of%20johannesburg");
  });
});

describe("station identity", () => {
  it("keeps the station entity id and the existing public URL", () => {
    const [result] = presentSearchResults([
      {
        result_type: "station",
        label: "Hillbrow",
        slug: "hillbrow",
        local_municipality: "city of johannesburg",
        district_municipality: "city of johannesburg",
        province_name: "Gauteng",
        province_slug: "gauteng",
        station_count: 1,
        entity_id: 657,
        entity_type: "police_station",
      },
    ]);

    expect(result?.entityId).toBe(657);
    expect(result?.entityType).toBe("police_station");
    expect(result?.href).toBe("/crime/gauteng/hillbrow");
    expect(result?.type).toBe("station");
    expect(result?.label).toBe("Hillbrow");
  });

  it("keeps a nearest-station result on the station URL with its entity id", () => {
    const [result] = presentSearchResults([
      {
        result_type: "nearby_station",
        label: "Sandton",
        slug: "sandton",
        local_municipality: "city of johannesburg",
        district_municipality: "city of johannesburg",
        province_name: "Gauteng",
        province_slug: "gauteng",
        station_count: 1,
        entity_id: 1100,
        entity_type: "police_station",
      },
    ]);

    expect(result?.href).toBe("/crime/gauteng/sandton");
    expect(result?.entityId).toBe(1100);
    expect(result?.entityType).toBe("police_station");
  });
});

describe("geocoded places", () => {
  it("does not assign an entity to a place name", () => {
    const result = geocodedPlaceResult("Sandton", 4);

    expect(result.type).toBe("place");
    expect(result.entityType).toBeNull();
    expect(result.entityId).toBeNull();
    expect(result.href).toBe("/place/Sandton");
    expect(result.stationCount).toBe(4);
    expect(result.label).toBe("Sandton");
  });
});
