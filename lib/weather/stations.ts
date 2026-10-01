/**
 * Gemensam, källoberoende modell för observationsstationer (SMHI, Trafikverket
 * VViS) och val av bästa station per parameter. Ren logik utan I/O.
 *
 * Flödet: adapter (lib/server/smhi.ts, lib/server/vvis.ts) → normaliserad
 * timserie per station och parameter → scoreSeries → bästa kandidat.
 * Samma serier kan senare viktas ihop till en lokal temperaturserie (GD).
 */
import type { HourlyValue } from "./compute";

export type ObservationSource = "SMHI" | "TRAFIKVERKET_VVIS";

export type ObservationParameter = "temperature" | "precipitation" | "windSpeed" | "windDirection" | "gust";

export interface ObservationStationRef {
  id: string;
  source: ObservationSource;
  name: string;
  lat: number;
  lon: number;
  /** Avstånd från vattnets centroid. */
  distanceKm: number;
}

/** Normaliserad timserie för en parameter vid en station. */
export interface StationSeries {
  station: ObservationStationRef;
  parameter: ObservationParameter;
  values: HourlyValue[];
}

const HOUR = 3_600_000;

/** Rimlighetsgränser – värden utanför räknas som ogiltiga (inte som 0). */
export const VALID_RANGE: Record<ObservationParameter, [number, number]> = {
  temperature: [-60, 50],
  precipitation: [0, 100],
  windSpeed: [0, 75],
  windDirection: [0, 360],
  gust: [0, 90],
};

export const isValid = (p: ObservationParameter, v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= VALID_RANGE[p][0] && v <= VALID_RANGE[p][1];

/**
 * Tät serie (t.ex. VViS var 5:e minut) → timserie. Tidsstämpel = timmens slut.
 *   instant – senaste värdet i timmen (temperatur, vind, riktning)
 *   sum     – summa av intervallvärden (nederbörd per 5 min)
 *   max     – högsta värdet (byvind)
 */
export function toHourly(samples: HourlyValue[], mode: "instant" | "sum" | "max"): HourlyValue[] {
  const buckets = new Map<number, HourlyValue[]>();
  for (const s of samples) {
    const end = Math.ceil(s.t / HOUR) * HOUR;
    (buckets.get(end) ?? buckets.set(end, []).get(end)!).push(s);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, xs]) => {
      xs.sort((a, b) => a.t - b.t);
      const v =
        mode === "sum"
          ? Math.round(xs.reduce((a, x) => a + x.v, 0) * 100) / 100
          : mode === "max"
            ? Math.max(...xs.map((x) => x.v))
            : xs[xs.length - 1].v;
      return { t, v };
    });
}

/** Max ålder på senaste värdet för att stationen ska räknas som aktuell. */
export const MAX_AGE_HOURS = 3;

export interface ScoredSeries extends StationSeries {
  score: number;
  coverage: number;
  ageHours: number;
}

/**
 * Enkel kvalitetsfunktion (V1). Lägre är bättre:
 *   avstånd (km) + 10 × andel saknade timmar + 2 × timmar sedan senaste värde.
 * null = oanvändbar (inga värden eller för gammal). Källan påverkar inte
 * poängen – SMHI och VViS är likvärdiga kandidater.
 */
export function scoreSeries(
  s: StationSeries,
  window: { from: number; to: number },
): ScoredSeries | null {
  const xs = s.values.filter((x) => x.t > window.from && x.t <= window.to);
  if (xs.length === 0) return null;
  const latest = Math.max(...xs.map((x) => x.t));
  const ageHours = Math.max(0, (window.to - latest) / HOUR);
  if (ageHours > MAX_AGE_HOURS) return null;
  const expected = Math.round((window.to - window.from) / HOUR);
  const hours = new Set(xs.map((x) => Math.ceil(x.t / HOUR))).size;
  const coverage = Math.min(1, hours / expected);
  return { ...s, score: s.station.distanceKm + 10 * (1 - coverage) + 2 * ageHours, coverage, ageHours };
}

/** Bästa serie för en parameter bland kandidater från alla källor. */
export function chooseBest(
  candidates: StationSeries[],
  window: { from: number; to: number },
): ScoredSeries | null {
  let best: ScoredSeries | null = null;
  for (const c of candidates) {
    const s = scoreSeries(c, window);
    if (s && (!best || s.score < best.score)) best = s;
  }
  return best;
}
