import { describe, expect, it } from "vitest";

import { stationsForEntity, type EntityRelationship } from "@/lib/map/entity-membership";

const MPUMALANGA = 61;
const EASTERN_CAPE = 188;

interface FixtureStation {
  readonly slug: string;
  readonly entityId: number | null;
  readonly provinceSlug: string | null;
  readonly localMunicipality: string | null;
}

const relationships: EntityRelationship[] = [
  { fromEntityId: 1001, toEntityId: MPUMALANGA, relationType: "within" },
  { fromEntityId: 1002, toEntityId: MPUMALANGA, relationType: "within" },
  { fromEntityId: 2001, toEntityId: EASTERN_CAPE, relationType: "within" },
  { fromEntityId: 2002, toEntityId: EASTERN_CAPE, relationType: "within" },
  { fromEntityId: 3001, toEntityId: 98, relationType: "within" },
];

const stations: FixtureStation[] = [
  { slug: "witbank", entityId: 1001, provinceSlug: "mpumalanga", localMunicipality: "emalahleni" },
  { slug: "ogies", entityId: 1002, provinceSlug: "mpumalanga", localMunicipality: "emalahleni" },
  { slug: "lady-frere", entityId: 2001, provinceSlug: "eastern-cape", localMunicipality: "emalahleni" },
  { slug: "indwe", entityId: 2002, provinceSlug: "eastern-cape", localMunicipality: "emalahleni" },
  { slug: "cosmo-city", entityId: 9001, provinceSlug: null, localMunicipality: null },
  { slug: "sandton", entityId: 3001, provinceSlug: "gauteng", localMunicipality: "city of johannesburg" },
  {
    slug: "same-name-elsewhere",
    entityId: 3002,
    provinceSlug: "free-state",
    localMunicipality: "city of johannesburg",
  },
];

describe("municipality entity membership", () => {
  it("keeps eMalahleni Mpumalanga (61) out of the Eastern Cape", () => {
    const matched = stationsForEntity(MPUMALANGA, relationships, stations);

    expect(matched.map((station) => station.slug)).toEqual(["witbank", "ogies"]);
    expect(matched.every((station) => station.provinceSlug === "mpumalanga")).toBe(true);
    expect(matched.some((station) => station.provinceSlug === "eastern-cape")).toBe(false);
  });

  it("keeps eMalahleni Eastern Cape (188) out of Mpumalanga", () => {
    const matched = stationsForEntity(EASTERN_CAPE, relationships, stations);

    expect(matched.map((station) => station.slug)).toEqual(["lady-frere", "indwe"]);
    expect(matched.every((station) => station.provinceSlug === "eastern-cape")).toBe(true);
    expect(matched.some((station) => station.provinceSlug === "mpumalanga")).toBe(false);
  });

  it("does not treat a shared municipality name as membership", () => {
    const matched = stationsForEntity(98, relationships, stations);

    expect(matched.map((station) => station.slug)).toEqual(["sandton"]);
    expect(matched.some((station) => station.slug === "same-name-elsewhere")).toBe(false);
  });

  it("does not attach a station that has no administrative relationship", () => {
    const mpumalanga = stationsForEntity(MPUMALANGA, relationships, stations);
    const easternCape = stationsForEntity(EASTERN_CAPE, relationships, stations);

    expect(mpumalanga.some((station) => station.slug === "cosmo-city")).toBe(false);
    expect(easternCape.some((station) => station.slug === "cosmo-city")).toBe(false);
  });
});
