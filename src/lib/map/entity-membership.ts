/**
 * Which stations belong to one geo entity.
 *
 * Membership is the entity id, or a within relationship that ends at that
 * entity. A shared municipality name is not membership. Stations with no
 * administrative relationship stay unresolved.
 */

export interface EntityRelationship {
  readonly fromEntityId: number;
  readonly toEntityId: number;
  readonly relationType: string;
}

export interface EntityStation {
  readonly entityId: number | null;
}

/** Entity ids that are the selection itself or sit within it. */
export function memberEntityIds(
  entityId: number,
  relationships: readonly EntityRelationship[],
): Set<number> {
  const members = new Set<number>([entityId]);
  for (const link of relationships) {
    if (link.relationType === "within" && link.toEntityId === entityId) {
      members.add(link.fromEntityId);
    }
  }
  return members;
}

export function stationsForEntity<T extends EntityStation>(
  entityId: number,
  relationships: readonly EntityRelationship[],
  stations: readonly T[],
): T[] {
  const members = memberEntityIds(entityId, relationships);
  return stations.filter((station) => station.entityId != null && members.has(station.entityId));
}
