/**
 * Sentinel-1 som indikator i Modellerad åkbarhet (sjömodellen och modellen för stora
 * sjöar delar samma heuristik och samma hämtning). Allt som kan behöva kalibreras mot
 * verifierade isobservationer ligger här.
 *
 * Heuristiken är EXPERIMENTELL och okalibrerad. Radarrespons är tvetydig: lugnt öppet
 * vatten och vissa isytor kan likna varandra, och vind, vågor, snö och grov is påverkar
 * signalen. Den används därför som en indikator bland flera, aldrig som en isdetektor.
 */
import type { Curve } from "../rideability/config.ts";

export const SENTINEL = {
  /**
   * Ytan analyseras bara om minst så här många giltiga pixlar finns inom polygonen. (Titilers
   * valid_percent räknar mot polygonens omslutande ruta och duger därför inte som täckningsmått
   * för oregelbundna sjöar.)
   */
  minValidPixels: 50,
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
  /** Standardavvikelse inom ytan (dB) → andel. Hög variation = ojämn/öppen/vindpåverkad yta. */
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
   * Signatur som är förenlig med vindpåverkat öppet vatten: hög respons + stor variation vid
   * måttlig/hård vind vid passagen. Lugnt vatten kan se ut som slät is och
   * klassas därför INTE så.
   */
  roughOpenWater: { minWindMs: 5, minMedianDb: -16, minStdDb: 3 },
  /** Tak för totalpoängen i modellen för stora sjöar vid sådan signatur. null = av. */
  roughOpenWaterCap: 30 as number | null,
};

/** Hämtning och cache (server och klient). Delas av alla modeller. */
export const SENTINEL_SERVER = {
  /** Sekunder som statistik per (scen, yta) cachas (scener ändras inte). */
  statsRevalidateS: 7 * 86_400,
  /** Sekunder som passökningen cachas. */
  passesRevalidateS: 3600,
  /** Samtidiga statistikanrop mot Planetary Computer. */
  concurrency: 6,
  /** Ytor per klientanrop (kartan fylls på successivt). */
  chunkSize: 40,
  /** Dygn bakåt som scener söks. */
  searchDays: 30,
  /** Antal nyaste pass som får vind vid passagen hämtad. */
  windForNewestPasses: 12,
  /** Max antal omgångar där nästa pass provas om ytan saknas i passet (utanför svepet). */
  maxRounds: 2,
} as const;

/** Vanliga sjöar: mindre vatten än så (km²) får ingen Sentinel-statistik (för få pixlar, mest kantpixlar). */
export const LAKE_SENTINEL = { minAreaKm2: 0.2 } as const;
