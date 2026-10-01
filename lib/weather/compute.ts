/**
 * Sammanfattning av timvärden för väder. Ren funktion utan I/O.
 *
 * Inga värden interpoleras. Varje sammanfattning redovisar täckning (antal
 * timmar med värde av förväntade), så att t.ex. en nederbördssumma med
 * saknade timmar inte presenteras som fullständig.
 */

export interface HourlyValue {
  /** Tidpunkt i ms (UTC). För summeringsparametrar = slutet av timmen. */
  t: number;
  v: number;
}

export interface Window {
  from: number;
  to: number;
}

export interface Coverage {
  hours: number;
  expectedHours: number;
}

const HOUR = 3_600_000;
const round1 = (v: number) => Math.round(v * 10) / 10;

const inWindow = (vals: HourlyValue[], w: Window) =>
  vals.filter((x) => x.t > w.from && x.t <= w.to).sort((a, b) => a.t - b.t);

const coverage = (n: number, w: Window): Coverage => ({
  hours: n,
  expectedHours: Math.round((w.to - w.from) / HOUR),
});

export interface TemperatureSummary {
  min: number;
  max: number;
  latest: number;
  latestAt: number;
  coverage: Coverage;
}

export function summarizeTemperature(vals: HourlyValue[], w: Window): TemperatureSummary | null {
  const xs = inWindow(vals, w);
  if (xs.length === 0) return null;
  const last = xs[xs.length - 1];
  return {
    min: round1(Math.min(...xs.map((x) => x.v))),
    max: round1(Math.max(...xs.map((x) => x.v))),
    latest: round1(last.v),
    latestAt: last.t,
    coverage: coverage(xs.length, w),
  };
}

export interface PrecipitationSummary {
  /** Summa av tillgängliga timmar (mm). Underskattning om coverage < expected. */
  sum: number;
  coverage: Coverage;
}

export function summarizePrecipitation(vals: HourlyValue[], w: Window): PrecipitationSummary | null {
  const xs = inWindow(vals, w);
  if (xs.length === 0) return null;
  return { sum: round1(xs.reduce((s, x) => s + x.v, 0)), coverage: coverage(xs.length, w) };
}

export interface WindSummary {
  /** Senaste 10-minutersmedel (m/s). */
  latest: number;
  latestAt: number;
  /** Riktning vinden blåser FRÅN (grader), vid samma tidpunkt som latest. */
  latestDirection: number | null;
  /** Högsta 10-minutersmedel i perioden. */
  maxMean: number;
  coverage: Coverage;
}

export function summarizeWind(
  speed: HourlyValue[],
  direction: HourlyValue[],
  w: Window,
): WindSummary | null {
  const xs = inWindow(speed, w);
  if (xs.length === 0) return null;
  const last = xs[xs.length - 1];
  const dir = direction.find((d) => d.t === last.t);
  return {
    latest: round1(last.v),
    latestAt: last.t,
    latestDirection: dir ? Math.round(dir.v) : null,
    maxMean: round1(Math.max(...xs.map((x) => x.v))),
    coverage: coverage(xs.length, w),
  };
}

export function maxInWindow(vals: HourlyValue[], w: Window): { max: number; coverage: Coverage } | null {
  const xs = inWindow(vals, w);
  if (xs.length === 0) return null;
  return { max: round1(Math.max(...xs.map((x) => x.v))), coverage: coverage(xs.length, w) };
}

/** "N", "NO", "O" … från vindriktning i grader (varifrån det blåser). */
export function compassSv(deg: number): string {
  const dirs = ["N", "NO", "O", "SO", "S", "SV", "V", "NV"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
