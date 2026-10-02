/**
 * Vänernmodellen (BETA): modellerad åkbarhet per gridcell utan MEPS-istjocklek.
 * Returnerar samma 0–100-score och samma kategori-id som sjömodellen, så att
 * kartan använder en gemensam färgskala. Delscore, tak och datatillit lagras
 * i resultatet för felsökning och framtida kalibrering (visas inte i UI).
 *
 * Saknad data är aldrig 0: en komponent som saknas är null, vikterna
 * normaliseras mot tillgängliga komponenter, datatilliten sänks och totalpoängen
 * begränsas konservativt (särskilt utan Sentinel-1).
 */
import { interpolate, getRideabilityCategory } from "../rideability/score.ts";
import type { RideabilityCategoryId } from "../rideability/config.ts";
import {
  COLD_RATIO_CURVE,
  MIN_AVAILABLE_WEIGHT,
  SENTINEL,
  SENTINEL_MISSING_CAP,
  VANERN_COMPONENTS,
  VANERN_WEIGHTS,
  WIND_DAMPING,
  type VanernComponentId,
} from "./config.ts";
import { calculateSentinelScore, type SentinelCellInput, type SentinelIndication } from "./sentinel.ts";
import {
  calculatePrecipitationScore,
  calculateTemperatureScore,
  calculateWindScore,
  type WeatherContextSummary,
} from "./weatherContext.ts";

export type Confidence = "high" | "medium" | "low";
export type VanernCap = "sentinel_missing" | "rough_open_water";

export interface VanernCellInputs {
  /** Aktuell köldmängd i % av historisk referens (t.ex. 96). null = saknas. */
  coldPercent: number | null;
  /** Väderunderlag för cellens väderruta. */
  weather: WeatherContextSummary | null;
  sentinel: SentinelCellInput | null;
}

export interface VanernCellResult {
  model: "vanern";
  /** 0–100 efter tak. null = otillräckliga data. */
  score: number | null;
  /** Före tak. */
  rawScore: number | null;
  category: RideabilityCategoryId;
  confidence: Confidence;
  /** Delscore 0–100; null = data saknas. */
  components: Record<VanernComponentId, number | null>;
  cap: VanernCap | null;
  /** Summa vikter för tillgängliga komponenter (0–1). */
  availableWeight: number;
  sentinel: SentinelIndication | null;
}

/** Köldmängd relativt historisk referens → 0–100 (kontinuerlig kurva i config). */
export function calculateColdScore(coldPercent: number | null): number | null {
  if (coldPercent === null || !Number.isFinite(coldPercent)) return null;
  return 100 * interpolate(COLD_RATIO_CURVE, Math.max(0, coldPercent) / 100);
}

/** Datatillit utifrån vilka källor som finns och hur färsk Sentinel är. */
export function calculateConfidence(sentinel: SentinelIndication | null, missingOthers: number): Confidence {
  if (!sentinel || missingOthers >= 2) return "low";
  if (sentinel.fresh && sentinel.deltaDb !== null && missingOthers === 0) return "high";
  return "medium";
}

export function calculateVanernRideability(inputs: VanernCellInputs, now: Date = new Date()): VanernCellResult {
  const sentinel = calculateSentinelScore(inputs.sentinel, now);
  const { weather } = inputs;
  // Vind dämpas när Sentinel antyder stabil sammanhängande yta (0 under sentinelFrom, 1 vid sentinelFull).
  const stable = sentinel
    ? Math.max(0, Math.min(1, (sentinel.score - WIND_DAMPING.sentinelFrom) / (WIND_DAMPING.sentinelFull - WIND_DAMPING.sentinelFrom)))
    : 0;

  const components: Record<VanernComponentId, number | null> = {
    cold: calculateColdScore(inputs.coldPercent),
    temperature: calculateTemperatureScore(weather?.temperature ?? null),
    sentinel: sentinel ? sentinel.score : null,
    wind: calculateWindScore(weather?.wind ?? null, stable, WIND_DAMPING.maxRecovery),
    precipitation: calculatePrecipitationScore(weather?.precipitation ?? null),
  };

  const available = VANERN_COMPONENTS.filter((id) => components[id] !== null);
  const availableWeight = available.reduce((s, id) => s + VANERN_WEIGHTS[id], 0);
  const missingOthers = VANERN_COMPONENTS.filter((id) => id !== "sentinel" && components[id] === null).length;
  const confidence = calculateConfidence(sentinel, missingOthers);

  if (availableWeight < MIN_AVAILABLE_WEIGHT) {
    return { model: "vanern", score: null, rawScore: null, category: "insufficient", confidence: "low", components, cap: null, availableWeight, sentinel };
  }

  const rawScore = available.reduce((s, id) => s + VANERN_WEIGHTS[id] * (components[id] as number), 0) / availableWeight;
  let score = rawScore;
  let cap: VanernCap | null = null;
  if (!sentinel) {
    cap = "sentinel_missing";
    score = Math.min(score, SENTINEL_MISSING_CAP);
  } else if (sentinel.roughOpenWater && SENTINEL.roughOpenWaterCap !== null) {
    cap = "rough_open_water";
    score = Math.min(score, SENTINEL.roughOpenWaterCap);
  }
  if (cap && score >= rawScore) cap = null; // taket verkade inte

  return {
    model: "vanern",
    score,
    rawScore,
    category: getRideabilityCategory(score),
    confidence,
    components,
    cap,
    availableWeight,
    sentinel,
  };
}
