import type { RideabilityCategoryId, RideabilityFactorId } from "./config.ts";

/** Normaliserad Sentinel-1-gynnsamhet 0–1 (1 = mest gynnsam). Se sentinel.ts. */
export interface SentinelIndication {
  favourability: number;
}

/** Nulägesindata för en sjö. null = datakällan saknas (inte "dåligt"). */
export interface RideabilityInputs {
  /** Aktuell GD i % av historisk referens. */
  gdPercent: number | null;
  /** MEPS modellerad istjocklek, cm. */
  iceThicknessCm: number | null;
  /** MEPS snö på is, cm. */
  snowOnIceCm: number | null;
  sentinel: SentinelIndication | null;
  /** Observerad nederbörd senaste 24 h, mm. */
  precipitation24hMm: number | null;
}

export interface FactorResult {
  id: RideabilityFactorId;
  available: boolean;
  /** Poäng för faktorn, null om data saknas. */
  points: number | null;
  max: number;
}

export type GateReason = "ice_below_2" | "ice_2_to_5" | "ice_missing";

export interface RideabilityResult {
  category: RideabilityCategoryId;
  /** Kategori före gating (för transparens). */
  rawCategory: RideabilityCategoryId;
  gate: GateReason | null;
  /** Internt score 0–100 normaliserat mot tillgänglig maxpoäng. Visas aldrig som primärvärde. */
  score: number | null;
  availableSources: number;
  totalSources: number;
  missing: RideabilityFactorId[];
  factors: Record<RideabilityFactorId, FactorResult>;
  inputs: RideabilityInputs;
}
