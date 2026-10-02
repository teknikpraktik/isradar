/**
 * Val av pass för en yta (sjö eller gridcell): senaste pass som täcker ytans mitt och
 * föregående pass från samma bana (samma omloppsriktning och relativa bana).
 * Ren logik utan I/O.
 */
import type { SentinelPassRef } from "./api.ts";

const DAY = 86_400_000;

const contains = (b: [number, number, number, number], [lon, lat]: [number, number]) =>
  lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];

export const passCovers = (p: SentinelPassRef, centroid: [number, number]) => p.items.some((i) => contains(i.bbox, centroid));

/**
 * @param passes alla pass, nyast först
 * @param exclude nycklar för pass som redan provats utan träff (ytan låg utanför svepet)
 */
export function assignPasses(
  passes: SentinelPassRef[],
  centroid: [number, number],
  exclude: ReadonlySet<string> = new Set(),
): { latest: SentinelPassRef | null; previous: SentinelPassRef | null } {
  const covering = passes.filter((p) => passCovers(p, centroid));
  const latest = covering.find((p) => !exclude.has(p.key)) ?? null;
  if (!latest) return { latest: null, previous: null };
  const previous =
    covering.find(
      (p) =>
        p !== latest &&
        p.orbit === latest.orbit &&
        p.relativeOrbit === latest.relativeOrbit &&
        Date.parse(latest.time) - Date.parse(p.time) > DAY,
    ) ?? null;
  return { latest, previous };
}
