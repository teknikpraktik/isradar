/**
 * Vänernmodellen för Modellerad åkbarhet (BETA) – alla parametrar på ett ställe.
 *
 * Modellen används där MEPS-istjocklek saknas (Vänern). Den är EXPERIMENTELL:
 * Sentinel-1-tolkningen är inte kalibrerad mot verifierade isförhållanden, och
 * vikter, kurvor och trösklar ska justeras mot observationer under vintern.
 * Resultatet är en modellerad indikator, inte ett besked om isens skick.
 */
import type { Curve } from "../rideability/config.ts";

export type VanernComponentId = "cold" | "temperature" | "sentinel" | "wind" | "precipitation";

export const VANERN_COMPONENTS: readonly VanernComponentId[] = ["cold", "temperature", "sentinel", "wind", "precipitation"];

/** Vikter (andel). Normaliseras mot tillgängliga komponenter. */
export const VANERN_WEIGHTS: Record<VanernComponentId, number> = {
  cold: 0.3,
  temperature: 0.2,
  sentinel: 0.2,
  wind: 0.15,
  precipitation: 0.15,
};

/* ------------------------------------------------------------------ */
/* Analysgrid                                                          */
/* ------------------------------------------------------------------ */

export const VANERN_GRID = {
  /** Cellstorlek i km (kvadrat). Ändra till t.ex. 1 för att testa finare grid. */
  defaultCellKm: 2,
  /** Celler med mindre vattenyta än så (km²) ignoreras. */
  minCellAreaKm2: 0.15,
  /** Väderunderlag delas mellan celler inom rutor av denna storlek (grader). */
  weatherTileDeg: 0.25,
} as const;

/* ------------------------------------------------------------------ */
/* Köldmängd                                                           */
/* ------------------------------------------------------------------ */

/** coldRatio (aktuell / historisk referens) → andel av maxpoäng. */
export const COLD_RATIO_CURVE: Curve = [
  [0.4, 0],
  [0.5, 0.2],
  [0.75, 0.5],
  [1, 0.8],
  [1.25, 1],
];

/* ------------------------------------------------------------------ */
/* Observerat väder                                                    */
/* ------------------------------------------------------------------ */

/** Dygn temperaturhistorik och timmar för nederbörd/vind. */
export const WEATHER_WINDOWS = { temperatureDays: 7, temperatureRecentHours: 72, precipitationHours: 48, windHours: 72 } as const;

/** Minsta täckning (andel av förväntade timmar) för att en komponent ska räknas. */
export const MIN_WEATHER_COVERAGE = 0.5;

/** Medeltemperatur senaste 72 h (°C) → andel. */
export const TEMPERATURE_MEAN_CURVE: Curve = [
  [-12, 1],
  [-8, 0.9],
  [-4, 0.75],
  [-1, 0.5],
  [0, 0.4],
  [2, 0.2],
  [5, 0.05],
  [8, 0],
];
/** Andel av 72 h med plusgrader dämpar poängen med upp till så här mycket. */
export const TEMPERATURE_THAW_PENALTY = 0.7;

/** Regnlikt viktat nederbördsmått (mm, 48 h) → andel. */
export const PRECIPITATION_CURVE: Curve = [
  [0, 1],
  [0.5, 0.85],
  [2, 0.6],
  [5, 0.3],
  [10, 0],
];
/** Hur hårt varje nederbördstyp väger (regn på is är värst). */
export const PRECIPITATION_TYPE_WEIGHT = { rain: 1.5, mixed: 1.25, snow: 1 } as const;
/** Temperaturgränser för typ: ≤ snowMaxC snö, ≤ mixedMaxC blandat, därefter regn. */
export const PRECIPITATION_TYPE_LIMITS = { snowMaxC: 0, mixedMaxC: 1 } as const;

/** Medelvind senaste 72 h (m/s) → andel. */
export const WIND_MEAN_CURVE: Curve = [
  [2, 1],
  [4, 0.85],
  [6, 0.6],
  [9, 0.3],
  [12, 0],
];
export const WIND_STRONG_MS = 8;
/** Andel av 72 h över WIND_STRONG_MS dämpar med upp till så här mycket. */
export const WIND_STRONG_PENALTY = 0.5;
export const WIND_EXTREME = { maxMs: 14, factor: 0.8 } as const;
/** Sentinel-poäng över detta antyder stabil sammanhängande yta → vindens negativa effekt dämpas. */
export const WIND_DAMPING = { sentinelFrom: 70, sentinelFull: 100, maxRecovery: 0.5 } as const;

/* ------------------------------------------------------------------ */
/* Sentinel-1 (experimentell heuristik, okalibrerad)                    */
/* ------------------------------------------------------------------ */

export const SENTINEL = {
  /** Cellen analyseras bara om minst så här stor andel av pixlarna är giltiga. */
  minValidPercent: 60,
  /** Max ålder (timmar) för senaste pass för att räknas som färskt. */
  freshHours: 72,
  /** Äldre än detta (timmar) räknas inte alls. */
  maxAgeHours: 14 * 24,
  /** Andel när förändring saknas (föregående pass finns inte) – neutral, ej straff. */
  noChangeNeutral: 0.6,
  /** Vikter mellan delarna (summerar till 1). */
  parts: { level: 0.3, homogeneity: 0.4, stability: 0.3 },
  /** VV-median (dB) → andel. Svagt styrande – ersätter inte "mörk = is, ljus = vatten". */
  levelCurve: [
    [-26, 0.45],
    [-22, 0.55],
    [-18, 0.8],
    [-13, 0.9],
    [-9, 0.65],
    [-5, 0.35],
  ] as Curve,
  /** Standardavvikelse inom cellen (dB) → andel. Hög variation = ojämn/öppen/vindpåverkad yta. */
  homogeneityCurve: [
    [1.5, 1],
    [3, 0.75],
    [5, 0.4],
    [7, 0.1],
  ] as Curve,
  /** |ΔVV median| mellan passen (dB) → andel. Stor förändring = instabilt läge. */
  stabilityCurve: [
    [0.5, 1],
    [1.5, 0.85],
    [3, 0.5],
    [6, 0.15],
  ] as Curve,
  /**
   * Signatur för vindpåverkat öppet vatten: hög respons + stor variation vid
   * måttlig/hård vind vid passagen. Lugnt vatten kan se ut som slät is och
   * klassas därför INTE som öppet vatten.
   */
  roughOpenWater: { minWindMs: 5, minMedianDb: -16, minStdDb: 3 },
  /** Tak för totalpoäng när cellen visar vindpåverkat öppet vatten. null = av. */
  roughOpenWaterCap: 30 as number | null,
};

/* ------------------------------------------------------------------ */
/* Tak, täckning och datatillit                                        */
/* ------------------------------------------------------------------ */

/** Utan Sentinel-1 (kritisk källa) begränsas totalpoängen konservativt. */
export const SENTINEL_MISSING_CAP = 55;
/**
 * Fysiska förutsättningar för isbildning (spärrar). Ett viktat medelvärde får inte
 * ge gul/grön färg när det varken har kommit tillräcklig köld eller är kallt nu –
 * särskilt eftersom jämn radaryta (Sentinel-1) även kan vara lugnt öppet vatten.
 */
export const VANERN_GATES = {
  /** Aktuell köldmängd under så här många % av historisk referens → tak lowColdCap. */
  minColdPercent: 30,
  lowColdCap: 35,
  /** 72 h-medeltemperatur (°C) från och med detta räknas som varmt väder → tak. */
  warmMeanC: 2,
  warmCap: 20,
} as const;

/** Under denna summa tillgängliga vikter blir cellen "Otillräckliga data". */
export const MIN_AVAILABLE_WEIGHT = 0.5;

/** Server: cache och anropsstrategi för Sentinel-statistik. */
export const SENTINEL_SERVER = {
  /** Sekunder som statistik per (scen, cell) cachas (scener ändras inte). */
  statsRevalidateS: 7 * 86_400,
  /** Sekunder som passökningen cachas. */
  passesRevalidateS: 3600,
  /** Samtidiga statistikanrop mot Planetary Computer. */
  concurrency: 6,
  /** Celler per klientanrop (kartan fylls på successivt). */
  chunkSize: 60,
  /** Dygn bakåt som scener söks. */
  searchDays: 30,
} as const;

export const VANERN_HINT =
  "Sjömodellen väger köldmängd, modellerad istjocklek och snö (MEPS), Sentinel-1 och nederbörd. På Vänern saknas MEPS-istjocklek, så en separat Vänernmodell (beta) används: köldmängd, temperaturhistorik, Sentinel-1, vind och nederbörd, beräknad per 2 × 2 km-cell. Sentinel-1-tolkningen är experimentell och inte kalibrerad. Båda ger samma skala och färger. Visar modellerad indikering, inte isens skick.";
