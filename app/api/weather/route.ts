import { NextResponse, type NextRequest } from "next/server";
import type { ApiError } from "@/lib/cold/api";
import {
  SMHI_FORECAST_SOURCE,
  SMHI_PARAM,
  SMHI_SOURCE,
  distKm,
  latestDayForStation,
  nearestLatestDay,
  pointForecast,
  type NearestSeries,
} from "@/lib/server/smhi";
import {
  WEATHER_STATION_MAX_KM,
  type ForecastHour,
  type ObservedVariable,
  type WeatherApiResponse,
} from "@/lib/weather/api";
import {
  maxInWindow,
  summarizePrecipitation,
  summarizeTemperature,
  summarizeWind,
  type HourlyValue,
  type Window,
} from "@/lib/weather/compute";
import { hourType, summarizePrecipitationTyped } from "@/lib/weather/precipitation";
import { chooseBest, type ObservationParameter, type ScoredSeries, type StationSeries } from "@/lib/weather/stations";
import { VVIS_SOURCE, nearbyVvis, vvisSeries, vvisStations } from "@/lib/server/vvis";

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Sverige med marginal – skyddar mot godtyckliga anrop. */
const inSweden = (lat: number, lon: number) => lat > 54.5 && lat < 69.5 && lon > 10 && lon < 25;

function observed<T>(best: ScoredSeries, w: Window, summary: T | null): ObservedVariable<T> | null {
  if (!summary) return null;
  const st = best.station;
  return {
    station: { id: st.id, name: st.name, distanceKm: st.distanceKm, source: st.source },
    period: { from: iso(w.from), to: iso(w.to) },
    summary,
  };
}

/** SMHI-resultat → gemensam serie. */
const fromSmhi = (n: NearestSeries | null, parameter: ObservationParameter): StationSeries[] =>
  n
    ? [{
        station: { id: n.station.id, source: "SMHI", name: n.station.name, lat: n.station.lat, lon: n.station.lon, distanceKm: n.station.distanceKm },
        parameter,
        values: n.values.map(({ t, v }) => ({ t, v })),
      }]
    : [];

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

  // VViS är en kompletterande källa: fel loggas men stoppar aldrig SMHI.
  const vvisPromise = (async () => {
    try {
      const near = nearbyVvis(await vvisStations(), lat, lon, distKm, { maxKm: WEATHER_STATION_MAX_KM });
      return await vvisSeries(near, past.from);
    } catch (err) {
      console.error("[vvis]", err);
      return [] as StationSeries[];
    }
  })();

  const [temp, precip, wind, fc, vvis] = await Promise.all([
    safe("temperatur", nearestLatestDay(SMHI_PARAM.temperature, lat, lon, opts)),
    safe("nederbörd", nearestLatestDay(SMHI_PARAM.precipitation, lat, lon, opts)),
    safe("vind", nearestLatestDay(SMHI_PARAM.windSpeed, lat, lon, opts)),
    safe("prognos", pointForecast(lat, lon)),
    vvisPromise,
  ]);
  const fromVvis = (p: ObservationParameter) => vvis.filter((x) => x.parameter === p);

  // Bästa station per parameter – SMHI och VViS är likvärdiga kandidater.
  const bestTemp = chooseBest([...fromSmhi(temp, "temperature"), ...fromVvis("temperature")], past);
  const bestPrecip = chooseBest([...fromSmhi(precip, "precipitation"), ...fromVvis("precipitation")], past);
  const bestWind = chooseBest([...fromSmhi(wind, "windSpeed"), ...fromVvis("windSpeed")], past);

  // Riktning och byar från SAMMA station som vald vind – blandas inte.
  let dirVals: HourlyValue[] = [];
  let gustVals: HourlyValue[] = [];
  if (bestWind?.station.source === "SMHI") {
    const [d, g] = await Promise.all([
      safe("vindriktning", latestDayForStation(SMHI_PARAM.windDirection, bestWind.station.id)),
      safe("byvind", latestDayForStation(SMHI_PARAM.gust, bestWind.station.id)),
    ]);
    dirVals = vals(d ? { values: d } : null);
    gustVals = vals(g ? { values: g } : null);
  } else if (bestWind) {
    const same = (p: ObservationParameter) => vvis.find((x) => x.parameter === p && x.station.id === bestWind.station.id)?.values ?? [];
    dirVals = same("windDirection");
    gustVals = same("gust");
  }
  const windSummary = bestWind ? summarizeWind(bestWind.values, dirVals, past) : null;
  const gustMax = maxInWindow(gustVals, past)?.max ?? null;

  let forecast: WeatherApiResponse["forecast"] = null;
  if (fc) {
    // En gemensam tidslinje: alla variabler per prognostimme (t = timmens slut).
    const steps = fc.steps.filter((s) => s.t > now && s.t <= now + 48 * HOUR);
    const hours: ForecastHour[] = steps.map((s) => {
      const mm = s.precipitation ?? null;
      return {
        time: iso(s.t),
        temperature: s.airTemperature ?? null,
        precipitationMm: mm,
        precipitationType:
          mm !== null && mm > 0
            ? hourType({ t: s.t, mm, ptype: s.precipitationType, frozenPct: s.frozenPartPct, tempC: s.airTemperature })
            : null,
        windSpeed: s.windSpeed ?? null,
        windFromDirection: s.windFromDirection ?? null,
        gust: s.windGust ?? null,
      };
    });
    const typed = summarizePrecipitationTyped(
      steps
        .filter((s) => s.precipitation !== undefined)
        .map((s) => ({ t: s.t, mm: s.precipitation as number, ptype: s.precipitationType, frozenPct: s.frozenPartPct, tempC: s.airTemperature })),
    );
    forecast = {
      referenceTime: fc.referenceTime,
      createdTime: fc.createdTime,
      hours,
      snowfall48hCm: typed.snowfallCm,
      estimatedSnowfall: typed.estimatedSnowfall,
    };
  }

  const body: WeatherApiResponse = {
    position: [lon, lat],
    observed: {
      temperature: bestTemp ? observed(bestTemp, past, summarizeTemperature(bestTemp.values, past)) : null,
      precipitation: bestPrecip ? observed(bestPrecip, past, summarizePrecipitation(bestPrecip.values, past)) : null,
      wind: bestWind && windSummary ? observed(bestWind, past, { ...windSummary, gustMax }) : null,
    },
    forecast,
    sources: { observed: SMHI_SOURCE, observedSecondary: VVIS_SOURCE, forecast: SMHI_FORECAST_SOURCE },
    errors,
    retrievedAt: new Date().toISOString(),
  };
  return NextResponse.json(body, {
    headers: {
        // Webbläsaren kontrollerar alltid; bara Vercels CDN cachar (annars kan
        // stale-while-revalidate ge användaren ett inaktuellt svar).
        "Cache-Control": "no-cache",
        "CDN-Cache-Control": "public, max-age=600, stale-while-revalidate=1800",
      },
  });
}
