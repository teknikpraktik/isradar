/**
 * Väder från SMHI via /api/weather:
 *   - uppmätt senaste 24 h (OBSERVATION) vid närmaste station per variabel
 *   - punktprognos 0–24 h och 24–48 h (FORECAST) vid vattnets position
 *
 * Endast nuläge – SMHI:s timvärden (latest-day) finns bara för senaste dygnet.
 */
import type { ApiError } from "@/lib/cold/api";
import { SOURCES } from "@/lib/sources";
import type { ObservedVariable, WeatherApiResponse } from "@/lib/weather/api";
import type { Lake } from "@/types/lake";
import type {
  ObservedWeatherVariable,
  WeatherForecast,
  WeatherObservation,
} from "@/types/observations";
import type { DataResult, Quantity, Unit } from "@/types/provenance";

const cache = new Map<number, Promise<WeatherApiResponse>>();

function fetchWeather(lake: Lake): Promise<WeatherApiResponse> {
  let p = cache.get(lake.id);
  if (!p) {
    const [lon, lat] = lake.centroid;
    p = fetch(`/api/weather?lat=${lat}&lon=${lon}`).then(async (res) => {
      const body = (await res.json()) as WeatherApiResponse | ApiError;
      if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : `HTTP ${res.status}`);
      return body;
    });
    p.catch(() => cache.delete(lake.id));
    cache.set(lake.id, p);
  }
  return p;
}

const q = <U extends Unit>(value: number, unit: U): Quantity<U> => ({ value, unit });
const qn = <U extends Unit>(value: number | null, unit: U): Quantity<U> | null =>
  value === null ? null : { value, unit };

function toVariable<S, V>(
  v: ObservedVariable<S & { coverage: { hours: number; expectedHours: number } }>,
  latestAt: number | null,
  values: V,
  r: WeatherApiResponse,
): ObservedWeatherVariable<V> {
  return {
    values,
    // Äldre cachade API-svar saknar serie – visa då bara textvärden.
    series: v.series ?? [],
    station: v.station,
    coverage: v.summary.coverage,
    provenance: {
      source: v.station.source === "TRAFIKVERKET_VVIS" ? r.sources.observedSecondary : r.sources.observed,
      time: {
        kind: "observation",
        observedAt: latestAt ? new Date(latestAt).toISOString() : v.period.to,
        period: v.period,
      },
      retrievedAt: r.retrievedAt,
    },
  };
}

const notHistorical = (): DataResult<never> => ({
  status: "unavailable",
  source: SOURCES.weather,
  reason: "Väderdata finns bara för nuläget",
  code: "not_historical",
});

const failed = (err: unknown): DataResult<never> => ({
  status: "unavailable",
  source: SOURCES.weather,
  reason: err instanceof Error ? err.message : "Okänt fel",
  code: "error",
});

export async function getRecentWeather(
  lake: Lake,
  asOf?: string,
): Promise<DataResult<WeatherObservation>> {
  if (asOf) return notHistorical();
  try {
    const r = await fetchWeather(lake);
    const { temperature: t, precipitation: p, wind: w } = r.observed;
    if (!t && !p && !w) {
      return {
        status: "unavailable",
        source: SOURCES.weather,
        reason: r.errors.length
          ? `Kunde inte hämta: ${r.errors.join(", ")}`
          : "Ingen SMHI-station med data inom 50 km",
        code: r.errors.length ? "error" : "no_data_yet",
      };
    }
    return {
      status: "ok",
      value: {
        lakeId: lake.id,
        temperature: t
          ? toVariable(t, t.summary.latestAt, {
              min: q(t.summary.min, "°C"),
              max: q(t.summary.max, "°C"),
              latest: q(t.summary.latest, "°C"),
            }, r)
          : null,
        precipitation: p ? toVariable(p, null, { sum: q(p.summary.sum, "mm") }, r) : null,
        wind: w
          ? {
              ...toVariable(w, w.summary.latestAt, {
                latest: q(w.summary.latest, "m/s"),
                latestDirection: qn(w.summary.latestDirection, "deg"),
                maxMean: q(w.summary.maxMean, "m/s"),
                gustMax: qn(w.summary.gustMax, "m/s"),
              }, r),
              // Äldre cachade svar saknar serierna – då visas ingen vindrad.
              directionSeries: w.directionSeries ?? [],
              gustSeries: w.gustSeries ?? [],
            }
          : null,
      },
    };
  } catch (err) {
    return failed(err);
  }
}

export async function getWeatherForecast(
  lake: Lake,
  asOf?: string,
): Promise<DataResult<WeatherForecast>> {
  if (asOf) return notHistorical();
  try {
    const r = await fetchWeather(lake);
    const fc = r.forecast;
    if (!fc || fc.hours.length === 0) {
      return { status: "unavailable", source: SOURCES.weather, reason: "Prognosen kunde inte hämtas", code: "error" };
    }
    return {
      status: "ok",
      value: {
        lakeId: lake.id,
        hours: fc.hours,
        forecastSnowfall: fc.snowfall48hCm
          ? { minCm: fc.snowfall48hCm[0], maxCm: fc.snowfall48hCm[1], estimated: fc.estimatedSnowfall }
          : null,
        provenance: {
          source: r.sources.forecast,
          time: {
            kind: "forecast",
            modelRun: fc.referenceTime,
            validAt: fc.hours[fc.hours.length - 1].time,
            leadTimeHours: 48,
          },
          retrievedAt: r.retrievedAt,
        },
      },
    };
  } catch (err) {
    return failed(err);
  }
}
