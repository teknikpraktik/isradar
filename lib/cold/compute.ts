/**
 * Beräkning av aktuell köldmängd ur dygnsmedeltemperaturer.
 *
 * Metod (beslut 2026-10-01):
 *   - Säsongen börjar 1 oktober.
 *   - Netto med golv vid 0: varje dygn adderas −Tmedel, dvs. minusgrader ökar
 *     köldmängden och plusgrader minskar den, men summan blir aldrig < 0.
 *   - Saknade dygn hoppas över (inga värden interpoleras) och redovisas.
 *
 * Metoden är Isvak:s egen. Den kan avvika från Skridskonätets beräkning av
 * historisk köldmängd, vars exakta metod inte är dokumenterad för oss.
 *
 * Ren funktion utan I/O – samma kod kan köras i API-route, script och test.
 */

/** "YYYY-MM-DD" (dygnet dygnsmedlet representerar). */
export type IsoDate = string;

export interface DailyMean {
  date: IsoDate;
  meanC: number;
}

export interface ColdAmountPoint {
  date: IsoDate;
  /** Ackumulerad köldmängd (GD) vid dygnets slut. */
  gd: number;
}

export interface ColdAmountResult {
  method: typeof COLD_METHOD;
  seasonStart: IsoDate;
  /** Sista dygnet som ingår (≤ asOf). null om inga dygn finns. */
  lastDate: IsoDate | null;
  accumulated: number;
  change24h: number | null;
  change7d: number | null;
  /** Dygn mellan säsongsstart och lastDate som saknar värde. */
  missingDays: IsoDate[];
  series: ColdAmountPoint[];
}

export const COLD_METHOD = {
  id: "net_floor_zero",
  seasonStartMonthDay: "10-01",
  description:
    "Summa av negerade dygnsmedeltemperaturer från 1 oktober; plusgrader minskar summan, som aldrig blir under 0.",
} as const;

const DAY_MS = 86_400_000;
const toMs = (d: IsoDate) => Date.parse(`${d}T00:00:00Z`);
const toDate = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: IsoDate, n: number): IsoDate => toDate(toMs(d) + n * DAY_MS);

/** Säsongsstart (1 oktober) för säsongen som innehåller `date`. */
export function seasonStartFor(date: IsoDate): IsoDate {
  const [y, m] = date.split("-").map(Number);
  return `${m >= 10 ? y : y - 1}-10-01`;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function computeColdAmount(daily: DailyMean[], asOf: IsoDate): ColdAmountResult {
  const seasonStart = seasonStartFor(asOf);
  const byDate = new Map(daily.map((d) => [d.date, d.meanC]));

  const inSeason = daily
    .filter((d) => d.date >= seasonStart && d.date <= asOf)
    .map((d) => d.date)
    .sort();
  const lastDate = inSeason.at(-1) ?? null;

  const series: ColdAmountPoint[] = [];
  const missingDays: IsoDate[] = [];
  let acc = 0;
  if (lastDate) {
    for (let d = seasonStart; d <= lastDate; d = addDays(d, 1)) {
      const t = byDate.get(d);
      if (t === undefined) {
        missingDays.push(d);
        continue;
      }
      acc = Math.max(0, acc - t);
      series.push({ date: d, gd: round1(acc) });
    }
  }

  // Värdet vid exakt ett datum. Saknas dygnet blir förändringen null hellre
  // än att den tyst avser en längre period.
  const gdByDate = new Map(series.map((p) => [p.date, p.gd]));
  const gdAt = (date: IsoDate): number | null => (date < seasonStart ? 0 : (gdByDate.get(date) ?? null));

  const accumulated = round1(acc);
  const change = (days: number) => {
    if (!lastDate) return null;
    const before = gdAt(addDays(lastDate, -days));
    return before === null ? null : round1(accumulated - before);
  };

  return {
    method: COLD_METHOD,
    seasonStart,
    lastDate,
    accumulated,
    change24h: change(1),
    change7d: change(7),
    missingDays,
    series,
  };
}
