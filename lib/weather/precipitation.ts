/**
 * Nederbördstyp och beräknad nysnö ur prognosens timvärden. Ren logik.
 *
 * Källa: SMHI snow1g (https://opendata.smhi.se/metfcst/snow1gv1/parameters)
 *   precipitation_amount_mean                 kg/m² = mm VATTENEKVIVALENT per timme
 *   predominant_precipitation_type_at_surface kategori 0–12 (ECMWF ptype)
 *   precipitation_frozen_part                 % fryst (−9 = ingen nederbörd)
 * snow1g har ingen direkt snöfalls-/nysnöparameter – nysnö är därför alltid
 * en egen, grov uppskattning (estimatedSnowfall = true) och visas som intervall.
 *
 * Prioritet för typ per timme: 1) modellens ptype, 2) fryst andel,
 * 3) temperaturen den timmen. Aldrig dygnets min/max.
 */

export type PrecipitationType = "rain" | "snow" | "mixed" | "unknown";

export interface PrecipHour {
  t: number;
  /** mm vattenekvivalent under timmen */
  mm: number;
  /** SMHI ptype 0–12, om känd */
  ptype?: number;
  /** Fryst andel 0–100 %, om känd */
  frozenPct?: number;
  /** Lufttemperatur °C den timmen, om känd */
  tempC?: number;
}

/** SMHI/ECMWF ptype → typ. 8 iskorn och 9 kornsnö räknas som fast (snö). */
const PTYPE: Record<number, PrecipitationType> = {
  1: "rain", // regn
  2: "rain", // åska
  3: "rain", // underkylt regn
  11: "rain", // duggregn
  12: "rain", // underkylt duggregn
  5: "snow", // snö
  6: "snow", // blöt snö
  8: "snow", // iskorn
  9: "snow", // kornsnö
  4: "mixed", // blandat/is
  7: "mixed", // regn och snö
  10: "mixed", // hagel
};

export function hourType(h: PrecipHour): PrecipitationType {
  if (h.ptype !== undefined && PTYPE[h.ptype]) return PTYPE[h.ptype];
  if (h.frozenPct !== undefined) return h.frozenPct >= 90 ? "snow" : h.frozenPct <= 10 ? "rain" : "mixed";
  if (h.tempC !== undefined) return h.tempC <= -1 ? "snow" : h.tempC >= 2 ? "rain" : "unknown";
  return "unknown";
}

/**
 * Snö/vatten-kvot (mm snö per mm vatten) efter temperatur – grov
 * storleksordning, inte en prognos. Intervall, aldrig en fast faktor.
 */
export function snowToLiquidRatio(tempC: number | undefined): [number, number] {
  if (tempC === undefined) return [8, 12];
  if (tempC > -1) return [5, 8];
  if (tempC > -5) return [8, 12];
  if (tempC > -10) return [10, 15];
  return [15, 20];
}

export interface PrecipitationSummaryTyped {
  mm: number;
  /** null när ingen nederbörd faller */
  type: PrecipitationType | null;
  /** Beräknad nysnö i cm (min–max). null = ingen snöuppskattning. */
  snowfallCm: [number, number] | null;
  /** Alltid true för snow1g – ingen direkt snöparameter finns. */
  estimatedSnowfall: boolean;
}

/** Dominerande typ: ≥ 80 % av mängden, annars "mixed". */
const DOMINANT = 0.8;

export function summarizePrecipitationTyped(hours: PrecipHour[]): PrecipitationSummaryTyped {
  const wet = hours.filter((h) => h.mm > 0);
  const mm = Math.round(wet.reduce((a, h) => a + h.mm, 0) * 10) / 10;
  if (wet.length === 0 || mm === 0) return { mm, type: null, snowfallCm: null, estimatedSnowfall: true };

  const byType: Record<PrecipitationType, number> = { rain: 0, snow: 0, mixed: 0, unknown: 0 };
  let snowMin = 0;
  let snowMax = 0;
  for (const h of wet) {
    const type = hourType(h);
    byType[type] += h.mm;
    // Fast andel: snö-timmar räknas helt (eller enligt fryst andel om den finns),
    // blandade timmar bara om modellen anger fryst andel.
    const frozen =
      type === "snow" ? (h.frozenPct ?? 100) / 100 : type === "mixed" && h.frozenPct !== undefined ? h.frozenPct / 100 : 0;
    if (frozen > 0) {
      const [lo, hi] = snowToLiquidRatio(h.tempC);
      snowMin += h.mm * frozen * lo;
      snowMax += h.mm * frozen * hi;
    }
  }
  const total = wet.reduce((a, h) => a + h.mm, 0);
  const dominant = (Object.keys(byType) as PrecipitationType[]).find((k) => byType[k] / total >= DOMINANT);
  const type: PrecipitationType = dominant ?? (byType.unknown / total >= DOMINANT ? "unknown" : "mixed");

  // mm snö → hela cm (ingen falsk precision). Under 0,5 cm blir [0, 0] = "< 1 cm".
  const lo = Math.round(snowMin / 10);
  const hi = Math.max(lo, Math.round(snowMax / 10));
  const snowfallCm: [number, number] | null = type === "rain" || snowMax < 1 ? null : [lo, hi];
  return { mm, type, snowfallCm, estimatedSnowfall: true };
}

export const PRECIP_TYPE_LABEL: Record<PrecipitationType, string> = {
  rain: "Regn",
  snow: "Snö",
  mixed: "Blandat",
  unknown: "Okänd typ",
};

/** "ca 3–4 cm", "< 1 cm" */
export function formatSnowfall([lo, hi]: [number, number]): string {
  if (hi < 1) return "< 1 cm";
  return lo === hi ? `ca ${lo} cm` : `ca ${lo}–${hi} cm`;
}

/**
 * Enkel tumregel för meteogrammen: ≤ 0 °C → snö, annars regn. Okänd temperatur
 * ger "unknown" (ingen gissning). Avser sannolik typ, inte meteorologisk klassning.
 */
export function simplePrecipType(tempC: number | null | undefined): PrecipitationType {
  if (tempC === null || tempC === undefined || !Number.isFinite(tempC)) return "unknown";
  return tempC <= 0 ? "snow" : "rain";
}
