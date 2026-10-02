import { NextResponse, type NextRequest } from "next/server";
import type { ApiError } from "@/lib/cold/api";
import type { PassWindResponse } from "@/lib/satellite/api";
import { pickPassWind, type WindCandidate } from "@/lib/satellite/passWind";
import { distKm, smhiWindAt } from "@/lib/server/smhi";
import { nearbyVvis, vvisStations, vvisWindAt } from "@/lib/server/vvis";

/**
 * Observerad vind vid en satellitpassage: närmaste observation (±1 h) från
 * SMHI eller Trafikverket VViS, vald på avstånd + tidsskillnad. Ingen gissning.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const lon = Number(p.get("lon"));
  const lat = Number(p.get("lat"));
  const time = Date.parse(p.get("time") ?? "");
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 10 || lon > 25 || lat < 54.5 || lat > 69.5) {
    return NextResponse.json<ApiError>({ error: "Ogiltig position" }, { status: 400 });
  }
  if (!Number.isFinite(time) || time > Date.now()) {
    return NextResponse.json<ApiError>({ error: "Ogiltig tid" }, { status: 400 });
  }

  const [smhi, vvis] = await Promise.all([
    smhiWindAt(lat, lon, time).catch((e) => (console.error(e), [])),
    vvisStations()
      .then((all) => {
        // nearbyVvis kräver färsk data; för historik räcker att stationen finns.
        const near = nearbyVvis(all.map((s) => ({ ...s, latestSample: Date.now() })), lat, lon, distKm);
        return vvisWindAt(near, time);
      })
      .catch((e) => (console.error(e), [])),
  ]);
  const candidates: WindCandidate[] = [
    ...smhi.map((w) => ({ ...w, station: { ...w.station, source: "SMHI" as const } })),
    ...vvis.map((w) => ({
      ...w,
      station: { name: w.station.name, source: "TRAFIKVERKET_VVIS" as const, distanceKm: w.station.distanceKm },
    })),
  ];
  const body: PassWindResponse = { passTime: new Date(time).toISOString(), wind: pickPassWind(candidates, time) };
  // Historiska observationer ändras sällan – cacha länge när svar finns.
  const maxAge = body.wind ? 86400 : 1800;
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-cache", "CDN-Cache-Control": `public, max-age=${maxAge}` },
  });
}
