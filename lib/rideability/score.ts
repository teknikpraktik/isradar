/**
 * Beräkningslogik för Modellerad åkbarhet · BETA. Ren logik utan I/O.
 * Parametrar ligger i config.ts.
 *
 * Score 0–100 används internt: summan av tillgängliga faktorers poäng,
 * normaliserad mot tillgänglig maxpoäng (saknad data ger inte lågt score).
 * Kategorin sätts av score och begränsas därefter av gating (MEPS istjocklek).
 */
import {
  CATEGORIES,
  CATEGORY_BY_ID,
  COLD_DEGREE_CURVE,
  ICE_GATES,
  ICE_THICKNESS_CURVE,
  MIN_SOURCES,
  MISSING_ICE_CAP,
  PRECIPITATION_CURVE,
  RIDEABILITY_FACTORS,
  SNOW_CURVE,
  WEIGHTS,
  type Curve,
  type RideabilityCategoryId,
  type RideabilityFactorId,
} from "./config.ts";
import type { FactorResult, GateReason, RideabilityInputs, RideabilityResult, SentinelIndication } from "./types.ts";

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Linjär interpolering mellan ankarpunkter; klampas utanför ändpunkterna. */
export function interpolate(curve: Curve, x: number): number {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return curve[curve.length - 1][1];
}

const factor = (id: RideabilityFactorId, fraction: number | null): FactorResult => ({
  id,
  available: fraction !== null,
  points: fraction === null ? null : fraction * WEIGHTS[id],
  max: WEIGHTS[id],
});

export const calculateIceThicknessScore = (cm: number | null) =>
  factor("iceThickness", finite(cm) ? interpolate(ICE_THICKNESS_CURVE, Math.max(0, cm)) : null);

export const calculateColdDegreeScore = (gdPercent: number | null) =>
  factor("coldDegree", finite(gdPercent) ? interpolate(COLD_DEGREE_CURVE, Math.max(0, gdPercent)) : null);

export const calculateSnowScore = (cm: number | null) =>
  factor("snow", finite(cm) ? interpolate(SNOW_CURVE, Math.max(0, cm)) : null);

export const calculateSentinelScore = (s: SentinelIndication | null) =>
  factor("sentinel", s && finite(s.favourability) ? Math.min(1, Math.max(0, s.favourability)) : null);

export const calculatePrecipitationScore = (mm: number | null) =>
  factor("precipitation", finite(mm) ? interpolate(PRECIPITATION_CURVE, Math.max(0, mm)) : null);

/** Score → kategori (före gating). Otillräckliga data sätts inte här. */
export function getRideabilityCategory(score: number): RideabilityCategoryId {
  return (CATEGORIES.find((c) => c.minScore !== null && score >= c.minScore) ?? CATEGORY_BY_ID.none).id;
}

/** MEPS istjocklek begränsar högsta kategori; saknad istjocklek stoppar "Mycket gynnsamma". */
export function applyRideabilityGating(
  category: RideabilityCategoryId,
  iceThicknessCm: number | null,
): { category: RideabilityCategoryId; gate: GateReason | null } {
  if (category === "insufficient") return { category, gate: null };
  let cap: RideabilityCategoryId | null = null;
  let gate: GateReason | null = null;
  if (!finite(iceThicknessCm)) {
    cap = MISSING_ICE_CAP;
    gate = "ice_missing";
  } else {
    const hit = ICE_GATES.find((g) => (g.inclusive ? iceThicknessCm <= g.upToCm : iceThicknessCm < g.upToCm));
    if (hit) {
      cap = hit.cap;
      gate = hit.reason;
    }
  }
  if (cap && CATEGORY_BY_ID[category].rank > CATEGORY_BY_ID[cap].rank) return { category: cap, gate };
  return { category, gate: null };
}

export function calculateRideabilityScore(inputs: RideabilityInputs): RideabilityResult {
  const factors: Record<RideabilityFactorId, FactorResult> = {
    iceThickness: calculateIceThicknessScore(inputs.iceThicknessCm),
    coldDegree: calculateColdDegreeScore(inputs.gdPercent),
    snow: calculateSnowScore(inputs.snowOnIceCm),
    sentinel: calculateSentinelScore(inputs.sentinel),
    precipitation: calculatePrecipitationScore(inputs.precipitation24hMm),
  };
  const used = RIDEABILITY_FACTORS.map((id) => factors[id]).filter((f) => f.available);
  const missing = RIDEABILITY_FACTORS.filter((id) => !factors[id].available);
  const maxAvailable = used.reduce((s, f) => s + f.max, 0);
  const score = maxAvailable > 0 ? (used.reduce((s, f) => s + (f.points ?? 0), 0) / maxAvailable) * 100 : null;

  const base = {
    inputs,
    factors,
    missing,
    availableSources: used.length,
    totalSources: RIDEABILITY_FACTORS.length,
  };
  if (score === null || used.length < MIN_SOURCES) {
    return { ...base, category: "insufficient", rawCategory: "insufficient", gate: null, score };
  }
  const rawCategory = getRideabilityCategory(score);
  const { category, gate } = applyRideabilityGating(rawCategory, inputs.iceThicknessCm);
  return { ...base, category, rawCategory, gate, score };
}
