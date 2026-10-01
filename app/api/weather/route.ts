import { NextResponse, type NextRequest } from "next/server";
import type { ApiError } from "@/lib/cold/api";
import {
  SMHI_FORECAST_SOURCE,
  SMHI_PARAM,
  SMHI_SOURCE,
  latestDayForStation,
  nearestLatestDay,
  pointForecast,
  type NearestSeries,
} from "@/lib/server/smhi";
import {
  WEATHER_STATION_MAX_KM,
  type ForecastWindow,
  type ObservedVariable,
  type WeatherApiResponse,
} from "@/lib/weather/api";
import {
  hoursBelow,
  maxInWindow,
  summarizePrecipitation,
  summarizeTemperature,
  summarizeWind,
  type HourlyValue,
  type Window,
} from "@/lib/weather/compute";

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Sverige med marginal – skyddar mot godtyckliga anrop. */
const inSweden = (lat: number, lon: number) => lat > 54.5 && lat < 69.5 && lon > 10 && lon < 25;

function observed<T>(
  series: NearestSeries,
  w: Window,
  summary: T | null,
): ObservedVariable<T> | null {
  if (!summary) return null;
  return {
    station: { id: series.station.id, name: series.station.name, distanceKm: series.station.distanceKm },
    period: { from: iso(w.from), to: iso(w.to) },
    summary,
  };
}

/**
 * Väder för en position: uppmätt senaste 24 h från närmaste SMHI-station per
 * variabel (inom 50 km) och punktprognos (snow1g) för 0–24 h och 24–48 h.
 */
export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inSweden(lat, lon)) {
    return NextResponse.json<ApiError>({ error: "lat/lon saknas eller ligger utanför Sverige" }, { status: 400 });
  }

  const now = Math.floor(Date.now() / HOUR) * HOUR;
  // Senaste 24 h fram till nu (värden med t i (nu−24 h, nu]).
  const past: Window = { from: Date.now() - 24 * HOUR, to: Date.now() };
  const errors: string[] = [];
  const opts = { maxKm: WEATHER_STATION_MAX_KM };
  const safe = async <T,>(label: string, p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch (err) {
      console.error(err);
      errors.push(label);
      return null;
    }
  };
  const vals = (s: { values: { t: number; v: number }[] } | null): HourlyValue[] =>
    s ? s.values.map(({ t, v }) => ({ t, v })) : [];

  const [temp, precip, wind, fc] = await Promise.all([
    safe("temperatur", nearestLatestDay(SMHI_PARAM.temperature, lat, lon, opts)),
    safe("nederbörd", nearestLatestDay(SMHI_PARAM.precipitation, lat, lon, opts)),
    safe("vind", nearestLatestDay(SMHI_PARAM.windSpeed, lat, lon, opts)),
    safe("prognos", pointForecast(lat, lon)),
  ]);

  // Riktning och byar från SAMMA station som vindhastigheten – blandas inte.
  const [dir, gust] = wind
    ? await Promise.all([
        safe("vindriktning", latestDayForStation(SMHI_PARAM.windDirection, wind.station.id)),
        safe("byvind", latestDayForStation(SMHI_PARAM.gust, wind.station.id)),
      ])
    : [null, null];

  const windSummary = wind ? summarizeWind(vals(wind), dir ? dir.map(({ t, v }) => ({ t, v })) : [], past) : null;
  const gustMax = gust ? (maxInWindow(gust.map(({ t, v }) => ({ t, v })), past)?.max ?? null) : null;

  let forecast: WeatherApiResponse["forecast"] = null;
  if (fc) {
    const series = (k: "airTemperature" | "precipitation" | "windSpeed" | "windGust" | "probabilityFrozenPrecipitation") =>
      fc.steps.flatMap((s) => (s[k] === undefined ? [] : [{ t: s.t, v: s[k] as number }]));
    const temps = series("airTemperature");
    const windows: ForecastWindow[] = [
      [0, 24],
      [24, 48],
    ].map(([a, b]) => {
      const w = { from: now + a * HOUR, to: now + b * HOUR };
      const t = summarizeTemperature(temps, w);
      const p = summarizePrecipitation(series("precipitation"), w);
      const frozen = maxInWindow(series("probabilityFrozenPrecipitation"), w);
      return {
        fromH: a,
        toH: b,
        from: iso(w.from),
        to: iso(w.to),
        temperatureMin: t?.min ?? null,
        temperatureMax: t?.max ?? null,
        precipitation: p?.sum ?? null,
        frozenPrecipitationProbabilityMax: frozen ? Math.round(frozen.max * 100) : null,
        windMax: maxInWindow(series("windSpeed"), w)?.max ?? null,
        gustMax: maxInWindow(series("windGust"), w)?.max ?? null,
        subzeroHours: hoursBelow(temps, w)?.hours ?? null,
        coverage: t?.coverage ?? { hours: 0, expectedHours: b - a },
      };
    });
    forecast = { referenceTime: fc.referenceTime, createdTime: fc.createdTime, windows };
  }

  const body: WeatherApiResponse = {
    position: [lon, lat],
    observed: {
      temperature: temp ? observed(temp, past, summarizeTemperature(vals(temp), past)) : null,
      precipitation: precip ? observed(precip, past, summarizePrecipitation(vals(precip), past)) : null,
      wind: wind && windSummary ? observed(wind, past, { ...windSummary, gustMax }) : null,
    },
    forecast,
    sources: { observed: SMHI_SOURCE, forecast: SMHI_FORECAST_SOURCE },
    errors,
    retrievedAt: new Date().toISOString(),
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=1800" },
  });
}
