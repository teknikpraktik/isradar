/**
 * Ren layoutlogik för 48 h-meteogrammet (ingen React, ingen I/O) – testad.
 * Komponenten components/lake-panel/Meteogram.tsx ritar SVG utifrån detta.
 */
import type { ForecastHour } from "./api";

const TZ = "Europe/Stockholm";

/**
 * Temperaturdomän: prognosens min/max med marginal, avrundad till jämna steg.
 * Ligger prognosen inom 5 °C från fryspunkten tas 0 °C alltid med.
 */
export function temperatureDomain(temps: (number | null)[]): { min: number; max: number; step: number } {
  const xs = temps.filter((t): t is number => t !== null && Number.isFinite(t));
  if (xs.length === 0) return { min: -5, max: 5, step: 5 };
  let lo = Math.min(...xs);
  let hi = Math.max(...xs);
  if (lo <= 5 && hi >= -5) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  const span = hi - lo;
  const step = span <= 6 ? 2 : span <= 15 ? 5 : 10;
  const min = Math.floor((lo - 0.5) / step) * step;
  let max = Math.ceil((hi + 0.5) / step) * step;
  if (max - min < 2 * step) max = min + 2 * step;
  return { min, max, step };
}

/** Skärmvinkel (grader, medurs från norr) för en pil som visar VART vinden blåser. */
export function windArrowRotation(fromDirection: number): number {
  return (((fromDirection + 180) % 360) + 360) % 360;
}

/** Lokal timme (0–23) och veckodag i svensk tid. */
function localParts(iso: string) {
  const d = new Date(iso);
  const hour = Number(new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(d));
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const weekday = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, weekday: "short" }).format(d).replace(".", "");
  return { hour, day, weekday };
}

export interface TimeTick {
  index: number;
  label: string;
  midnight: boolean;
}

/** Tidsmarkeringar var `every`:e lokal timme (00, 06, 12, 18 …). */
export function timeTicks(hours: ForecastHour[], every = 6): TimeTick[] {
  return hours.flatMap((h, index) => {
    const { hour } = localParts(h.time);
    return hour % every === 0 ? [{ index, label: String(hour).padStart(2, "0"), midnight: hour === 0 }] : [];
  });
}

export interface DayLabel {
  /** Index där dagen börjar (0 för första). */
  index: number;
  label: string;
}

/** "IDAG", "FRE", "LÖR" – en etikett per lokal kalenderdag. */
export function dayLabels(hours: ForecastHour[], now: Date = new Date()): DayLabel[] {
  const today = localParts(now.toISOString()).day;
  const out: DayLabel[] = [];
  let prev = "";
  hours.forEach((h, index) => {
    const { day, weekday } = localParts(h.time);
    if (day !== prev) {
      out.push({ index, label: day === today ? "IDAG" : weekday.toUpperCase() });
      prev = day;
    }
  });
  // En dag med mindre än MIN_DAY_HOURS timmar i bild får ingen egen etikett
  // (den skulle krocka med nästa dags).
  return out.filter((d, i) => i === out.length - 1 || out[i + 1].index - d.index >= MIN_DAY_HOURS);
}

const MIN_DAY_HOURS = 4;

/** "Tor 03:00" */
export function hourLabel(iso: string): string {
  const d = new Date(iso);
  const wd = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, weekday: "short" }).format(d).replace(".", "");
  const t = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${t}`;
}

/** Sammanhängande segment utan saknade temperaturer (ingen interpolation över luckor). */
export function temperatureSegments(hours: ForecastHour[]): { index: number; t: number }[][] {
  const segs: { index: number; t: number }[][] = [];
  let cur: { index: number; t: number }[] = [];
  hours.forEach((h, index) => {
    if (h.temperature === null) {
      if (cur.length) segs.push(cur);
      cur = [];
    } else cur.push({ index, t: h.temperature });
  });
  if (cur.length) segs.push(cur);
  return segs;
}

/** Textsammanfattning för skärmläsare. */
export function meteogramSummary(hours: ForecastHour[]): string {
  const temps = hours.map((h) => h.temperature).filter((t): t is number => t !== null);
  if (temps.length === 0) return "48-timmars prognos saknar temperaturdata.";
  const r = (v: number) => Math.round(v);
  const parts = [`48-timmars prognos. Temperaturen varierar mellan ${r(Math.min(...temps))} och ${r(Math.max(...temps))} grader.`];
  const below = hours.filter((h) => h.temperature !== null && h.temperature < 0).length;
  if (below > 0) parts.push(`${below} timmar under noll.`);
  const wet = hours.filter((h) => (h.precipitationMm ?? 0) > 0);
  if (wet.length === 0) parts.push("Ingen nederbörd väntas.");
  else {
    const total = Math.round(wet.reduce((a, h) => a + (h.precipitationMm ?? 0), 0) * 10) / 10;
    const peak = wet.reduce((a, h) => ((h.precipitationMm ?? 0) > (a.precipitationMm ?? 0) ? h : a));
    parts.push(`Totalt ${String(total).replace(".", ",")} millimeter nederbörd, mest ${hourLabel(peak.time).toLowerCase()}.`);
  }
  const winds = hours.map((h) => h.windSpeed).filter((v): v is number => v !== null);
  if (winds.length) parts.push(`Vind upp till ${r(Math.max(...winds))} meter per sekund.`);
  return parts.join(" ");
}


/**
 * Delar en tidsserie i sammanhängande segment – en lucka större än maxGapMs
 * bryter linjen (ingen interpolation). Delas av meteogram och sparklines.
 */
export function splitAtGaps<T extends { t: number }>(points: T[], maxGapMs = 1.5 * 3_600_000): T[][] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const segs: T[][] = [];
  for (const p of sorted) {
    const cur = segs[segs.length - 1];
    if (cur && p.t - cur[cur.length - 1].t <= maxGapMs) cur.push(p);
    else segs.push([p]);
  }
  return segs;
}

/** Minsta antal värden för att en 24 h-sparkline ska vara meningsfull. */
export const MIN_SPARKLINE_POINTS = 6;
