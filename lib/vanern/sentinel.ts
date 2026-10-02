/**
 * Sentinel-1-komponenten i Vänernmodellen (EXPERIMENTELL, okalibrerad).
 *
 * Indata är VV-statistik (dB, gamma0 RTC) per gridcell från senaste och
 * föregående pass. Heuristiken prioriterar variation inom cellen och förändring
 * mellan passen framför absolut nivå, eftersom låg radarrespons även kan finnas
 * över öppet lugnt vatten: "mörk = is, ljus = vatten" används INTE.
 *
 *   level         svagt styrande VV-nivå (config.levelCurve)
 *   homogeneity   låg standardavvikelse = jämn yta
 *   stability     liten förändring mot föregående pass (saknas → neutral)
 *
 * Allt som kan behöva kalibreras mot verifierade isobservationer ligger i
 * config.ts (SENTINEL). Ren logik utan I/O.
 */
import { interpolate } from "../rideability/score.ts";
import { SENTINEL } from "./config.ts";

export interface SentinelPassStats {
  /** Passets tid (ISO). */
  time: string;
  /** Median av 10·log10(VV), dB. */
  medianDb: number;
  /** Standardavvikelse av 10·log10(VV) inom cellen, dB. */
  stdDb: number;
  /** Andel giltiga pixlar i cellen, %. */
  validPercent: number;
  /** Observerad vind vid passagen (m/s), om känd. */
  windMs?: number | null;
}

export interface SentinelCellInput {
  latest: SentinelPassStats | null;
  /** Föregående pass från samma bana, om det finns. */
  previous: SentinelPassStats | null;
}

export interface SentinelIndication {
  /** 0–100. */
  score: number;
  /** Vindpåverkat öppet vatten sannolikt (hög respons + stor variation + vind). */
  roughOpenWater: boolean;
  ageHours: number;
  fresh: boolean;
  medianDb: number;
  stdDb: number;
  /** ΔVV median (senaste − föregående), dB. null om föregående pass saknas. */
  deltaDb: number | null;
  /** Delpoäng (0–1) för felsökning. */
  parts: { level: number; homogeneity: number; stability: number };
}

const usable = (p: SentinelPassStats | null): p is SentinelPassStats =>
  !!p && Number.isFinite(p.medianDb) && Number.isFinite(p.stdDb) && p.validPercent >= SENTINEL.minValidPercent;

/** null = Sentinel-data saknas (för gammal, för få giltiga pixlar eller inget pass). */
export function calculateSentinelScore(input: SentinelCellInput | null, now: Date = new Date()): SentinelIndication | null {
  const latest = input?.latest ?? null;
  if (!usable(latest)) return null;
  const ageHours = (now.getTime() - Date.parse(latest.time)) / 3_600_000;
  if (!(ageHours <= SENTINEL.maxAgeHours)) return null;

  const prev = usable(input?.previous ?? null) ? input!.previous : null;
  const deltaDb = prev ? latest.medianDb - prev.medianDb : null;

  const level = interpolate(SENTINEL.levelCurve, latest.medianDb);
  const homogeneity = interpolate(SENTINEL.homogeneityCurve, latest.stdDb);
  const stability = deltaDb === null ? SENTINEL.noChangeNeutral : interpolate(SENTINEL.stabilityCurve, Math.abs(deltaDb));

  const { parts } = SENTINEL;
  let score = 100 * (parts.level * level + parts.homogeneity * homogeneity + parts.stability * stability);

  const r = SENTINEL.roughOpenWater;
  const roughOpenWater =
    typeof latest.windMs === "number" && latest.windMs >= r.minWindMs && latest.medianDb >= r.minMedianDb && latest.stdDb >= r.minStdDb;
  if (roughOpenWater) score = Math.min(score, 25);

  return {
    score: Math.max(0, Math.min(100, score)),
    roughOpenWater,
    ageHours,
    fresh: ageHours <= SENTINEL.freshHours,
    medianDb: latest.medianDb,
    stdDb: latest.stdDb,
    deltaDb,
    parts: { level, homogeneity, stability },
  };
}
