/**
 * Modellerad åkbarhet · BETA – alla parametrar på ett ställe.
 *
 * Detta är en sammanvägd MODELLINDIKERING av nuläget, inte ett säkerhetsmått.
 * Vikter, kurvor, gränser, gating och färger kommer sannolikt justeras – ändra
 * här, ingen annan fil har trösklar. Ingen framtida prognos vägs in.
 */

export type RideabilityFactorId = "iceThickness" | "coldDegree" | "snow" | "sentinel" | "precipitation";

export type RideabilityCategoryId = "very_favourable" | "favourable" | "mixed" | "none" | "insufficient";

/** Ankarpunkter [indata, andel av maxpoäng 0–1]; linjär interpolering, klampas i ändarna. */
export type Curve = readonly (readonly [number, number])[];

export const RIDEABILITY_FACTORS: readonly RideabilityFactorId[] = [
  "iceThickness",
  "coldDegree",
  "snow",
  "sentinel",
  "precipitation",
];

/** Maxpoäng per faktor. Summan blir 100 men behöver inte göra det – score normaliseras. */
export const WEIGHTS: Record<RideabilityFactorId, number> = {
  iceThickness: 35,
  coldDegree: 25,
  snow: 20,
  sentinel: 15,
  precipitation: 5,
};

/*
 * Poängkurvor. Anges som andel av maxpoäng så att vikterna kan ändras utan att
 * kurvorna behöver räknas om (spec i poäng ÷ maxpoäng inom parentes).
 */

/** MEPS istjocklek (cm): 0→0 p, 2→10 p, 5→25 p, ≥8→35 p (av 35). */
export const ICE_THICKNESS_CURVE: Curve = [
  [0, 0],
  [2, 10 / 35],
  [5, 25 / 35],
  [8, 1],
];

/**
 * GD aktuell / historisk (%): <60 → 0 p, 60–79 → 5–14 p, 80–99 → 15–24 p, ≥100 → 25 p (av 25).
 * Kontinuerlig: 50 % → 0 p, 60 % → 5 p, 80 % → 15 p, 100 % → 25 p.
 */
export const COLD_DEGREE_CURVE: Curve = [
  [50, 0],
  [60, 5 / 25],
  [80, 15 / 25],
  [100, 1],
];

/** MEPS snö på is (cm): <1 → 20 p, 1–3 gradvis lägre, 3–5 låg, >5 → 0 p. */
export const SNOW_CURVE: Curve = [
  [0, 1],
  [1, 1],
  [3, 0.4],
  [5, 0.1],
  [5.5, 0],
];

/** Nederbörd senaste 24 h (mm vattenekvivalent): 0 → 5 p, liten gradvis lägre, tydlig (≥5 mm) → 0 p. */
export const PRECIPITATION_CURVE: Curve = [
  [0, 1],
  [0.5, 0.8],
  [2, 0.4],
  [5, 0],
];

/** Sentinel-1: adaptern levererar redan en normaliserad gynnsamhet 0–1 (se sentinel.ts). */
export const SENTINEL_LABEL_BREAKS = { favourable: 0.66, mixed: 0.33 } as const;

/* ------------------------------------------------------------------ */
/* Kategorier                                                          */
/* ------------------------------------------------------------------ */

export interface RideabilityCategory {
  id: RideabilityCategoryId;
  label: string;
  /** Lägsta score (0–100) för kategorin. null = sätts aldrig av score. */
  minScore: number | null;
  /** Högre rank = mer gynnsam. Används av gating. */
  rank: number;
  fill: string;
  line: string;
}

/** Mörkaste grön → orange; grå för otillräckliga data. Sorterad fallande rank. */
export const CATEGORIES: readonly RideabilityCategory[] = [
  { id: "very_favourable", label: "Mycket gynnsamma indikationer", minScore: 85, rank: 4, fill: "#2e7d4f", line: "#5fb882" },
  { id: "favourable", label: "Gynnsamma indikationer", minScore: 70, rank: 3, fill: "#6fb86a", line: "#a3d99f" },
  { id: "mixed", label: "Blandade indikationer", minScore: 45, rank: 2, fill: "#d9bf4a", line: "#ecd878" },
  { id: "none", label: "Inga indikationer", minScore: 0, rank: 1, fill: "#d9803f", line: "#eba46e" },
  { id: "insufficient", label: "Otillräckliga data", minScore: null, rank: 0, fill: "#59636d", line: "#7d8995" },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  RideabilityCategoryId,
  RideabilityCategory
>;

/* ------------------------------------------------------------------ */
/* Gating och dataunderlag                                             */
/* ------------------------------------------------------------------ */

/**
 * MEPS istjocklek begränsar högsta kategori. Utvärderas uppifrån; första träffen
 * gäller (upToCm är övre gräns, inclusive styr om gränsen själv ingår).
 *   < 2 cm → högst Inga, 2–5 cm → högst Blandade, > 5 cm → ingen begränsning.
 */
export const ICE_GATES: readonly { upToCm: number; inclusive: boolean; cap: RideabilityCategoryId; reason: "ice_below_2" | "ice_2_to_5" }[] = [
  { upToCm: 2, inclusive: false, cap: "none", reason: "ice_below_2" },
  { upToCm: 5, inclusive: true, cap: "mixed", reason: "ice_2_to_5" },
];

/** Utan MEPS-istjocklek får en sjö aldrig bli "Mycket gynnsamma". */
export const MISSING_ICE_CAP: RideabilityCategoryId = "favourable";

/** Färre tillgängliga datakällor än så → Otillräckliga data. */
export const MIN_SOURCES = 3;

export const RIDEABILITY_TITLE = "Modellerad åkbarhet";
export const RIDEABILITY_HELP =
  "Sammanvägd indikator baserad på köldmängd, modellerad is och snö, satellitdata och senaste nederbörd. Ska alltid verifieras på plats.";
