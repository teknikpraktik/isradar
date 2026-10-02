/**
 * Val av observerad vind vid en satellitpassage. Ren logik – testbar utan nät.
 * Ingen interpolering: en verklig observation inom ±MAX_DT från en station.
 */
import type { PassWind } from "./api";

export const PASS_WIND_MAX_DT_MS = 3_600_000;

export interface WindCandidate {
  t: number;
  speed: number;
  fromDirection: number | null;
  gust: number | null;
  station: PassWind["station"];
}

/** km-ekvivalent per minut tidsskillnad: 60 min ≈ 30 km. */
const KM_PER_MIN = 0.5;

export function pickPassWind(candidates: WindCandidate[], passTime: number): PassWind | null {
  let best: { c: WindCandidate; score: number } | null = null;
  for (const c of candidates) {
    const dtMin = Math.abs(c.t - passTime) / 60_000;
    if (dtMin * 60_000 > PASS_WIND_MAX_DT_MS || !Number.isFinite(c.speed) || c.speed < 0) continue;
    const score = c.station.distanceKm + dtMin * KM_PER_MIN;
    if (!best || score < best.score) best = { c, score };
  }
  if (!best) return null;
  const { c } = best;
  return {
    observedAt: new Date(c.t).toISOString(),
    speed: c.speed,
    fromDirection: c.fromDirection,
    gust: c.gust,
    station: c.station,
  };
}
