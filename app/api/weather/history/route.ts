import { NextResponse, type NextRequest } from "next/server";
import type { ApiError } from "@/lib/cold/api";
import { SMHI_PARAM, SMHI_SOURCE, nearestLatestDayForPoints } from "@/lib/server/smhi";
import { MIN_WEATHER_COVERAGE, WEATHER_WINDOWS } from "@/lib/vanern/config";
import { WEATHER_HISTORY_MAX_POINTS, type WeatherHistoryPoint, type WeatherHistoryResponse } from "@/lib/vanern/api";
import { calculateWeatherContext, type HourlyPoint } from "@/lib/vanern/weatherContext";
import { WEATHER_STATION_MAX_KM } from "@/lib/weather/api";

const inSweden = (lat: number, lon: number) => lat > 54.5 && lat < 69.5 && lon > 10 && lon < 25;
const toPoints = (n: { values: { t: number; v: number }[] } | null): HourlyPoint[] => (n ? n.values.map(({ t, v }) => ({ t, v })) : []);

/**
 * Observerat väderunderlag (temperaturhistorik 7 dygn, nederbörd 48 h, vind 72 h)
 * för väderrutor, till Vänernmodellen. Varje SMHI-station hämtas högst en gång
 * även om flera rutor har samma närmaste station. Body: { points: [{id, lat, lon}] }.
 */
export async function POST(request: NextRequest) {
  let points: WeatherHistoryPoint[] = [];
  try {
    const body = (await request.json()) as { points?: unknown };
    if (Array.isArray(body.points)) points = body.points as WeatherHistoryPoint[];
  } catch {
    /* hanteras nedan */
  }
  const ok = (p: WeatherHistoryPoint) =>
    p && typeof p.id === "string" && Number.isFinite(p.lat) && Number.isFinite(p.lon) && inSweden(p.lat, p.lon);
  if (points.length === 0 || points.length > WEATHER_HISTORY_MAX_POINTS || !points.every(ok)) {
    return NextResponse.json<ApiError>({ error: `points måste vara 1–${WEATHER_HISTORY_MAX_POINTS} punkter i Sverige` }, { status: 400 });
  }
  try {
    // Närmaste station med tillräcklig täckning (en glesare närmare station hoppas över).
    const now = Date.now();
    const enough = (hours: number) => (v: { t: number }[]) =>
      v.filter((p) => p.t > now - hours * 3_600_000).length >= hours * MIN_WEATHER_COVERAGE;
    const base = { maxKm: WEATHER_STATION_MAX_KM, period: "latest-months" as const, tries: 5 };
    const [temp, precip, wind] = await Promise.all([
      nearestLatestDayForPoints(SMHI_PARAM.temperature, points, { ...base, accept: enough(WEATHER_WINDOWS.temperatureRecentHours) }),
      nearestLatestDayForPoints(SMHI_PARAM.precipitation, points, { ...base, accept: enough(WEATHER_WINDOWS.precipitationHours) }),
      nearestLatestDayForPoints(SMHI_PARAM.windSpeed, points, { ...base, accept: enough(WEATHER_WINDOWS.windHours) }),
    ]);
    const out: WeatherHistoryResponse = {
      results: points.map((p, i) => ({
        id: p.id,
        summary: calculateWeatherContext(
          { temperature: toPoints(temp[i]), precipitation: toPoints(precip[i]), wind: toPoints(wind[i]) },
          now,
        ),
        stations: {
          ...(temp[i] ? { temperature: temp[i]!.station.name } : {}),
          ...(precip[i] ? { precipitation: precip[i]!.station.name } : {}),
          ...(wind[i] ? { wind: wind[i]!.station.name } : {}),
        },
      })),
      source: SMHI_SOURCE,
      retrievedAt: new Date(now).toISOString(),
    };
    return NextResponse.json(out, { headers: { "Cache-Control": "no-cache" } });
  } catch (err) {
    console.error(err);
    return NextResponse.json<ApiError>({ error: "Kunde inte hämta väderhistorik" }, { status: 502 });
  }
}
