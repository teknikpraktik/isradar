import { NextResponse, type NextRequest } from "next/server";
import type { ApiError } from "@/lib/cold/api";
import {
  PRECIP_POINTS_MAX,
  type PrecipitationPoint,
  type PrecipitationPointResult,
  type PrecipitationPointsResponse,
} from "@/lib/rideability/api";
import { SMHI_PARAM, SMHI_SOURCE, nearestLatestDayForPoints } from "@/lib/server/smhi";
import { WEATHER_STATION_MAX_KM } from "@/lib/weather/api";
import { summarizePrecipitation } from "@/lib/weather/compute";

const HOUR = 3_600_000;
const inSweden = (lat: number, lon: number) => lat > 54.5 && lat < 69.5 && lon > 10 && lon < 25;

/**
 * Observerad nederbörd senaste 24 h (SMHI, närmaste station inom 50 km) för
 * många punkter, till kartlagret Förmodad åkbarhet. Body: { points: [{id, lat, lon}] }.
 * Samma stationsval och summering som /api/weather, men utan VViS.
 */
export async function POST(request: NextRequest) {
  let points: PrecipitationPoint[] = [];
  try {
    const body = (await request.json()) as { points?: unknown };
    if (Array.isArray(body.points)) points = body.points as PrecipitationPoint[];
  } catch {
    /* hanteras nedan */
  }
  const ok = (p: PrecipitationPoint) =>
    p && Number.isFinite(p.id) && Number.isFinite(p.lat) && Number.isFinite(p.lon) && inSweden(p.lat, p.lon);
  if (points.length === 0 || points.length > PRECIP_POINTS_MAX || !points.every(ok)) {
    return NextResponse.json<ApiError>({ error: `points måste vara 1–${PRECIP_POINTS_MAX} punkter i Sverige` }, { status: 400 });
  }
  try {
    const past = { from: Date.now() - 24 * HOUR, to: Date.now() };
    const nearest = await nearestLatestDayForPoints(SMHI_PARAM.precipitation, points, { maxKm: WEATHER_STATION_MAX_KM });
    const results = nearest.map((n): PrecipitationPointResult | null => {
      if (!n) return null;
      const sum = summarizePrecipitation(n.values.map(({ t, v }) => ({ t, v })), past);
      if (!sum) return null;
      return {
        mm: sum.sum,
        station: { id: n.station.id, name: n.station.name, distanceKm: n.station.distanceKm },
        coverage: sum.coverage,
      };
    });
    const out: PrecipitationPointsResponse = { results, source: SMHI_SOURCE, retrievedAt: new Date().toISOString() };
    return NextResponse.json(out, { headers: { "Cache-Control": "no-cache" } });
  } catch (err) {
    console.error(err);
    return NextResponse.json<ApiError>({ error: "Kunde inte hämta nederbörd" }, { status: 502 });
  }
}
