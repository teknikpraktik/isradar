/**
 * Sätter ihop nulägesindata per sjö och beräknar åkbarhetsbedömningen för hela
 * regionen. Ren logik – hämtningen ligger i lib/data/rideability.ts.
 */
import { median } from "@/lib/meps/api";
import { canRenderColdDays } from "@/lib/map/coldScale";
import type { LakeId, LakeIndexEntry } from "@/types/lake";
import { calculateRideabilityScore } from "./score";
import type { RideabilityInputs, RideabilityResult, SentinelIndication } from "./types";

export interface RideabilityBulkData {
  /** Per unik MEPS-ruta "y:x" → [istjocklek cm, snö cm]; null = ingen sjöyta. null-karta = källan otillgänglig. */
  mepsCells: Map<string, [number | null, number | null]> | null;
  /** Observerad nederbörd 24 h (mm) per sjö. null-karta = källan otillgänglig. */
  precipitationMm: Map<LakeId, number | null> | null;
  sentinel: Map<LakeId, SentinelIndication | null> | null;
  /** Aktuell GD i % av historisk, per sjö (från kartans progress). */
  gdPercent: Map<LakeId, number | null>;
}

export const cellKey = (y: number, x: number) => `${y}:${x}`;

/** Median över sjöns rutor med sjöyta (samma princip som /api/meps). */
function mepsFor(entry: LakeIndexEntry, cells: RideabilityBulkData["mepsCells"]) {
  if (!cells) return { ice: null, snow: null };
  const ice: number[] = [];
  const snow: number[] = [];
  for (const [y, x] of entry.mepsCells) {
    const v = cells.get(cellKey(y, x));
    if (!v || v[0] === null) continue;
    ice.push(v[0]);
    if (v[1] !== null) snow.push(v[1]);
  }
  return { ice: median(ice), snow: median(snow) };
}

export function buildRideabilityInputs(entry: LakeIndexEntry, bulk: RideabilityBulkData): RideabilityInputs {
  const meps = mepsFor(entry, bulk.mepsCells);
  return {
    gdPercent: bulk.gdPercent.get(entry.id) ?? null,
    iceThicknessCm: meps.ice,
    snowOnIceCm: meps.snow,
    sentinel: bulk.sentinel?.get(entry.id) ?? null,
    precipitation24hMm: bulk.precipitationMm?.get(entry.id) ?? null,
  };
}

/** Samlingsområden bedöms aldrig (samma regel som köldmängdslagret). */
export function computeRideability(index: LakeIndexEntry[], bulk: RideabilityBulkData): Map<LakeId, RideabilityResult> {
  const out = new Map<LakeId, RideabilityResult>();
  for (const entry of index) {
    if (!canRenderColdDays(entry.areaType)) continue;
    out.set(entry.id, calculateRideabilityScore(buildRideabilityInputs(entry, bulk)));
  }
  return out;
}
