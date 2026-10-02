/**
 * Vilka vattenobjekt som hör till Vänernmodellen: de som regionen anger
 * (waterModels i data/regions/*.json) samt delområden vars förälder – rekursivt –
 * är en medlem. Ren logik.
 */
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { LakeFeatureProperties, LakeIndexEntry } from "@/types/lake";
import type { WaterModelDefinition } from "@/types/region";
import type { GridMember } from "./grid.ts";

export function vanernMemberIds(def: Pick<WaterModelDefinition, "areaIds">, index: LakeIndexEntry[]): Set<number> {
  const ids = new Set(def.areaIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of index) {
      if (!ids.has(l.id) && l.parent && ids.has(l.parent.id)) {
        ids.add(l.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Medlemmarnas polygoner (punktobjekt hoppas över). */
export function vanernGridMembers(
  ids: Set<number>,
  features: FeatureCollection<Polygon | MultiPolygon | { type: "Point"; coordinates: number[] }, LakeFeatureProperties>,
): GridMember[] {
  return features.features.flatMap((f) =>
    ids.has(f.properties.id) && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
      ? [{ id: f.properties.id, name: f.properties.name, geometry: f.geometry as Polygon | MultiPolygon }]
      : [],
  );
}
