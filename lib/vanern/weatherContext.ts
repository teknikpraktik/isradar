/**
 * Observerat väderunderlag för Vänernmodellen: ren sammanfattning av timserier
 * (temperatur, nederbörd, vind) till små sammanfattningar som delas av alla
 * celler inom en väderruta, samt poängfunktioner 0–100. Ingen I/O – hämtningen
 * ligger i app/api/weather/history.
 */
import { interpolate } from "../rideability/score.ts";
import {
  MIN_WEATHER_COVERAGE,
  PRECIPITATION_CURVE,
  PRECIPITATION_TYPE_LIMITS,
  PRECIPITATION_TYPE_WEIGHT,
  TEMPERATURE_MEAN_CURVE,
  TEMPERATURE_THAW_PENALTY,
  WEATHER_WINDOWS,
  WIND_EXTREME,
  WIND_MEAN_CURVE,
  WIND_STRONG_MS,
  WIND_STRONG_PENALTY,
} from "./config.ts";

const HOUR = 3_600_000;

export interface HourlyPoint {
  /** ms (UTC) */
  t: number;
  v: number;
}

export interface TemperatureSummary {
  /** Medel senaste 72 h (°C). */
  mean72C: number;
  /** Andel av observerade timmar (72 h) över 0 °C. */
  fracAboveZero72: number;
  /** Observerade timmar / 72. */
  coverage72: number;
  /** Medel per dygn (24 h-block, äldst först) för senaste 7 dygnen; null = saknas. */
  dailyMeansC: (number | null)[];
}

export interface PrecipitationSummary {
  rainMm: number;
  mixedMm: number;
  snowMm: number;
  /** Observerade timmar / 48. */
  coverage48: number;
  /** false = temperatur saknades för någon nederbördstimme (behandlas som regn). */
  typeKnown: boolean;
}

export interface WindSummary {
  mean72Ms: number;
  max72Ms: number;
  /** Andel av observerade timmar över WIND_STRONG_MS. */
  fracStrong72: number;
  coverage72: number;
}

/** Väderunderlag för en väderruta. null = källan saknas eller täckningen är för låg. */
export interface WeatherContextSummary {
  temperature: TemperatureSummary | null;
  precipitation: PrecipitationSummary | null;
  wind: WindSummary | null;
}

const within = (s: HourlyPoint[], now: number, hours: number) => s.filter((p) => p.t > now - hours * HOUR && p.t <= now);

export function summarizeTemperature(series: HourlyPoint[], now: number): TemperatureSummary | null {
  const w = WEATHER_WINDOWS.temperatureRecentHours;
  const recent = within(series, now, w);
  if (recent.length / w < MIN_WEATHER_COVERAGE) return null;
  const dailyMeansC = Array.from({ length: WEATHER_WINDOWS.temperatureDays }, (_, d) => {
    const end = now - (WEATHER_WINDOWS.temperatureDays - 1 - d) * 24 * HOUR;
    const xs = series.filter((p) => p.t > end - 24 * HOUR && p.t <= end);
    return xs.length >= 12 ? xs.reduce((s, p) => s + p.v, 0) / xs.length : null;
  });
  return {
    mean72C: recent.reduce((s, p) => s + p.v, 0) / recent.length,
    fracAboveZero72: recent.filter((p) => p.v > 0).length / recent.length,
    coverage72: recent.length / w,
    dailyMeansC,
  };
}

/** Nederbörd 48 h; typ per timme från temperaturen samma timme (±1 h). Okänd temperatur → regn (konservativt). */
export function summarizePrecipitation(
  precipitation: HourlyPoint[],
  temperature: HourlyPoint[],
  now: number,
): PrecipitationSummary | null {
  const w = WEATHER_WINDOWS.precipitationHours;
  const xs = within(precipitation, now, w);
  if (xs.length / w < MIN_WEATHER_COVERAGE) return null;
  const lim = PRECIPITATION_TYPE_LIMITS;
  const out = { rainMm: 0, mixedMm: 0, snowMm: 0 };
  let typeKnown = true;
  for (const p of xs) {
    if (p.v <= 0) continue;
    const near = temperature.reduce<HourlyPoint | null>(
      (best, t) => (Math.abs(t.t - p.t) <= HOUR && (!best || Math.abs(t.t - p.t) < Math.abs(best.t - p.t)) ? t : best),
      null,
    );
    if (!near) {
      typeKnown = false;
      out.rainMm += p.v;
    } else if (near.v <= lim.snowMaxC) out.snowMm += p.v;
    else if (near.v <= lim.mixedMaxC) out.mixedMm += p.v;
    else out.rainMm += p.v;
  }
  return { ...out, coverage48: xs.length / w, typeKnown };
}

export function summarizeWind(speed: HourlyPoint[], now: number): WindSummary | null {
  const w = WEATHER_WINDOWS.windHours;
  const xs = within(speed, now, w);
  if (xs.length / w < MIN_WEATHER_COVERAGE) return null;
  return {
    mean72Ms: xs.reduce((s, p) => s + p.v, 0) / xs.length,
    max72Ms: Math.max(...xs.map((p) => p.v)),
    fracStrong72: xs.filter((p) => p.v >= WIND_STRONG_MS).length / xs.length,
    coverage72: xs.length / w,
  };
}

/** Hela väderunderlaget för en väderruta ur närmaste stationers timserier. */
export function calculateWeatherContext(
  series: { temperature: HourlyPoint[]; precipitation: HourlyPoint[]; wind: HourlyPoint[] },
  now: number,
): WeatherContextSummary {
  return {
    temperature: summarizeTemperature(series.temperature, now),
    precipitation: summarizePrecipitation(series.precipitation, series.temperature, now),
    wind: summarizeWind(series.wind, now),
  };
}

/* ------------------------------------------------------------------ */
/* Poäng 0–100                                                         */
/* ------------------------------------------------------------------ */

/**
 * 72 h-medel och andel plusgrader (återkommande plusgrader/upptining sänker),
 * blandat med 7-dygnsmedel som fångar hur länge kylan hållit i sig (70/30).
 */
export function calculateTemperatureScore(s: TemperatureSummary | null): number | null {
  if (!s) return null;
  const recent = interpolate(TEMPERATURE_MEAN_CURVE, s.mean72C) * (1 - TEMPERATURE_THAW_PENALTY * s.fracAboveZero72);
  const days = s.dailyMeansC.filter((d): d is number => d !== null);
  const week = days.length >= 3 ? interpolate(TEMPERATURE_MEAN_CURVE, days.reduce((a, b) => a + b, 0) / days.length) : recent;
  return 100 * (0.7 * recent + 0.3 * week);
}

/** Regn väger tyngst, därefter blandat, snö (viktat mm → kurva). Ingen nederbörd = 100. */
export function calculatePrecipitationScore(s: PrecipitationSummary | null): number | null {
  if (!s) return null;
  const w = PRECIPITATION_TYPE_WEIGHT;
  const effective = s.rainMm * w.rain + s.mixedMm * w.mixed + s.snowMm * w.snow;
  return 100 * interpolate(PRECIPITATION_CURVE, effective);
}

/**
 * Vind 72 h: medelvind, andel hård vind och extrem max. `stableIce` (0–1) dämpar
 * vindens negativa effekt när Sentinel antyder stabil sammanhängande yta.
 */
export function calculateWindScore(s: WindSummary | null, stableIce = 0, maxRecovery = 0.5): number | null {
  if (!s) return null;
  let base = interpolate(WIND_MEAN_CURVE, s.mean72Ms) * (1 - WIND_STRONG_PENALTY * s.fracStrong72);
  if (s.max72Ms >= WIND_EXTREME.maxMs) base *= WIND_EXTREME.factor;
  const damped = base + (1 - base) * maxRecovery * Math.max(0, Math.min(1, stableIce));
  return 100 * damped;
}
