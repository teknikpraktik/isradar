import { NextResponse, type NextRequest } from "next/server";
import { isIsoDate, type ApiError, type StationColdAmountResponse } from "@/lib/cold/api";
import { addDays, computeColdAmount, seasonStartFor } from "@/lib/cold/compute";
import { SMHI_SOURCE, SmhiError, getDailyMeans } from "@/lib/server/smhi";
import smhiStations from "@/data/stations/smhi.json";

interface StationMapping {
  measurepoint: number;
  name: string;
  smhiId: string | null;
  smhiName: string | null;
  distanceM: number | null;
}

const STATIONS = smhiStations as StationMapping[];

/**
 * Aktuell köldmängd för en av Skridskonätets temperaturstationer, beräknad
 * ur SMHI:s dygnsmedeltemperaturer. Se lib/cold/compute.ts för metoden.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/cold/station/[measurepoint]">,
) {
  const { measurepoint } = await ctx.params;
  const station = STATIONS.find((s) => String(s.measurepoint) === measurepoint);
  if (!station?.smhiId || !station.smhiName || station.distanceM === null) {
    return NextResponse.json<ApiError>({ error: `Okänd station: ${measurepoint}` }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const asOfParam = request.nextUrl.searchParams.get("asOf");
  if (asOfParam !== null && (!isIsoDate(asOfParam) || asOfParam > today)) {
    return NextResponse.json<ApiError>({ error: "asOf måste vara YYYY-MM-DD och inte i framtiden" }, { status: 400 });
  }
  const asOf = asOfParam ?? today;

  try {
    const daily = await getDailyMeans(station.smhiId, seasonStartFor(asOf));
    const result = computeColdAmount(daily, asOf);
    const used = daily.filter((d) => d.date >= result.seasonStart && d.date <= asOf);
    const qualityCodes: Record<string, number> = {};
    for (const d of used) qualityCodes[d.quality] = (qualityCodes[d.quality] ?? 0) + 1;

    const body: StationColdAmountResponse = {
      measurepoint: station.measurepoint,
      stationName: station.name,
      smhi: { id: station.smhiId, name: station.smhiName, distanceM: station.distanceM },
      asOf,
      seasonStart: result.seasonStart,
      lastDate: result.lastDate,
      observedAt: result.lastDate ? `${addDays(result.lastDate, 1)}T00:00:00Z` : null,
      accumulated: result.accumulated,
      change24h: result.change24h,
      change7d: result.change7d,
      missingDays: result.missingDays,
      series: result.series,
      method: { id: result.method.id, description: result.method.description },
      qualityCodes,
      source: SMHI_SOURCE,
      retrievedAt: new Date().toISOString(),
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (err) {
    console.error(err);
    const msg = err instanceof SmhiError ? err.message : "Kunde inte hämta data från SMHI";
    return NextResponse.json<ApiError>({ error: msg }, { status: 502 });
  }
}
