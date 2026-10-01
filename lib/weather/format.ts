/**
 * Presentation av väderdata – enda stället där väder formateras till text.
 *
 * Saknad data och noll är aldrig utbytbara: funktionerna tar emot null för
 * "saknas" och returnerar då null, så att anroparen väljer platshållare.
 */

const MINUS = "−";

function num(v: number, decimals: number, fixed = false): string {
  const s = new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: fixed ? decimals : 0,
    maximumFractionDigits: decimals,
  }).format(Math.abs(v));
  return v < 0 && !/^[0,]+$/.test(s) ? `${MINUS}${s}` : s;
}

/**
 * "10,1–18,6 °C". Med minusgrader används mellanslag kring tankstrecket
 * ("−3 – 2 °C") så att minustecken och intervall inte flyter ihop.
 * decimals = 0 för prognoser (hela grader), 1 för observationer.
 */
export function formatTemperatureRange(min: number | null, max: number | null, decimals = 1): string | null {
  if (min === null || max === null) return null;
  // Fast antal decimaler så att intervallets ändpunkter är jämförbara.
  const a = num(min, decimals, true);
  const b = num(max, decimals, true);
  if (a === b) return `${a} °C`;
  const sep = a.startsWith(MINUS) || b.startsWith(MINUS) ? " – " : "–";
  return `${a}${sep}${b} °C`;
}

export function formatTemperature(v: number | null, decimals = 1): string | null {
  return v === null ? null : `${num(v, decimals, true)} °C`;
}

/**
 * "0 mm", "4,5 mm". Exakt 0 är ett riktigt värde. "<0,1 mm" används bara om
 * källan uttryckligen anger att värdet ligger under mätgränsen.
 */
export function formatPrecipitation(mm: number | null, opts: { belowDetectionLimit?: boolean } = {}): string | null {
  if (opts.belowDetectionLimit) return "<0,1 mm";
  if (mm === null) return null;
  return `${num(mm, 1)} mm`;
}

/** "3 m/s O" (riktning valfri). */
export function formatWind(speed: number | null, direction?: string | null): string | null {
  if (speed === null) return null;
  return direction ? `${num(speed, 1)} m/s ${direction}` : `${num(speed, 1)} m/s`;
}

/** "0 h", "8 h". 0 h är ett riktigt värde; null = ingen prognosdata. */
export function formatSubzeroDuration(hours: number | null): string | null {
  return hours === null ? null : `${hours} h`;
}

/** "Karlstad Flygplats · 16 km" */
export function formatStation(name: string, distanceKm: number): string {
  return `${name} · ${distanceKm} km`;
}
