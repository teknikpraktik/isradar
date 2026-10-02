/**
 * Berikar sjöarnas GeoJSON med kartans härledda egenskaper:
 *   pct   – progress (aktuell / historisk referens) via getColdProgress
 *   label – "Sjönamn XX" (historisk referens-GD)
 *   lt    – etikettnivå efter storlek, styr vid vilken zoom etiketten visas
 */
import type { LakeFeatureCollection } from "@/lib/data/lakes";
import type { BBox, LakeIndexEntry } from "@/types/lake";
import { getColdProgress, lakeMapLabel } from "./coldScale";

/** Ungefärlig yta (km²) för omslutande rektangel. */
export function bboxAreaKm2([w, s, e, n]: BBox): number {
  const km = 111.32;
  return (e - w) * km * Math.cos((((s + n) / 2) * Math.PI) / 180) * (n - s) * km;
}

export const LABEL_TIER_KM2 = { large: 25, medium: 4 } as const;

export function labelTier(areaKm2: number): 0 | 1 | 2 {
  return areaKm2 >= LABEL_TIER_KM2.large ? 0 : areaKm2 >= LABEL_TIER_KM2.medium ? 1 : 2;
}

let warnedZero = false;

export function enrichLakeFeatures(
  fc: LakeFeatureCollection,
  index: LakeIndexEntry[],
  currentByStation: Map<number, number | null> | null,
): LakeFeatureCollection {
  const bbox = new Map(index.map((l) => [l.id, l.bbox]));
  const invalidRef: string[] = [];
  const features = fc.features.map((f) => {
    const p = f.properties;
    if (p.hca !== null && p.hca <= 0 && p.areaType !== "COLLECTION_AREA") invalidRef.push(`${p.name} (${p.id})`);
    const current = currentByStation && p.stationId !== null ? currentByStation.get(p.stationId) : null;
    const progress = getColdProgress(p.areaType, current, p.hca);
    const b = bbox.get(p.id);
    return {
      ...f,
      properties: {
        ...p,
        pct: progress.kind === "progress" ? progress.percent : null,
        label: lakeMapLabel(p.name, p.areaType, p.hca),
        lt: b ? labelTier(bboxAreaKm2(b)) : 2,
      },
    };
  });
  if (invalidRef.length && !warnedZero) {
    warnedZero = true;
    console.warn(`[datakvalitet] historisk referens ≤ 0 – ingen progress: ${invalidRef.join(", ")}`);
  }
  return { ...fc, features };
}
