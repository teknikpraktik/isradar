import { NextResponse, type NextRequest } from "next/server";
import { isIsoDate, type ApiError, type CurrentColdResponse } from "@/lib/cold/api";
import { computeColdAmount, seasonStartFor } from "@/lib/cold/compute";
import { getDailyMeans } from "@/lib/server/smhi";
import smhiStations from "@/data/stations/smhi.json";

const STATIONS = smhiStations as { measurepoint: number; smhiId: string | null }[];
const MAX_STATIONS = 60;

/**
 * Aktuell köldmängd för flera stationer på en gång – underlag för kartans
 * progressfärg. Samma beräkning som /api/cold/station/[measurepoint].
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const ids = (p.get("stations") ?? "").split(",").filter(Boolean);
  if (ids.length === 0 || ids.length > MAX_STATIONS || ids.some((id) => !/^\d+$/.test(id))) {
    return NextResponse.json<ApiError>({ error: "Ogiltig stationslista" }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const asOfParam = p.get("asOf");
  if (asOfParam !== null && (!isIsoDate(asOfParam) || asOfParam > today)) {
    return NextResponse.json<ApiError>({ error: "asOf måste vara YYYY-MM-DD och inte i framtiden" }, { status: 400 });
  }
  const asOf = asOfParam ?? today;

  const entries = await Promise.all(
    ids.map(async (id): Promise<[string, number | null]> => {
      const smhiId = STATIONS.find((s) => String(s.measurepoint) === id)?.smhiId;
      if (!smhiId) return [id, null];
      try {
        const r = computeColdAmount(await getDailyMeans(smhiId, seasonStartFor(asOf)), asOf);
        return [id, r.lastDate ? r.accumulated : null];
      } catch (err) {
        console.error(err);
        return [id, null];
      }
    }),
  );
  const body: CurrentColdResponse = { asOf, values: Object.fromEntries(entries), retrievedAt: new Date().toISOString() };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-cache", "CDN-Cache-Control": "public, max-age=1800, stale-while-revalidate=3600" },
  });
}
