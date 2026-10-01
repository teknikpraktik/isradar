import { NextResponse, type NextRequest } from "next/server";
import { isIsoDate, type ApiError } from "@/lib/cold/api";
import { CLEAR_MAX_CLOUD_PCT, SATELLITE_WINDOW_DAYS, type SatelliteApiResponse } from "@/lib/satellite/api";
import { PLANETARY_SOURCE, PlanetaryError, scenesAt } from "@/lib/server/planetary";

/** Sentinel-1/2-scener som täcker en punkt, med tile-URL:er för kartan. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const lon = Number(p.get("lon"));
  const lat = Number(p.get("lat"));
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 10 || lon > 25 || lat < 54.5 || lat > 69.5) {
    return NextResponse.json<ApiError>({ error: "Ogiltig position" }, { status: 400 });
  }
  const asOf = p.get("asOf");
  if (asOf !== null && !isIsoDate(asOf)) return NextResponse.json<ApiError>({ error: "Ogiltigt asOf" }, { status: 400 });
  // Fönstrets slut avrundas till timme så att svaret kan cachas.
  const to = asOf
    ? new Date(Math.min(Date.parse(`${asOf}T23:59:59Z`), Date.now()))
    : new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000);

  try {
    const scenes = await scenesAt([lon, lat], to, { days: SATELLITE_WINDOW_DAYS, maxCloud: CLEAR_MAX_CLOUD_PCT });
    const body: SatelliteApiResponse = {
      to: to.toISOString(),
      windowDays: SATELLITE_WINDOW_DAYS,
      clearMaxCloudPct: CLEAR_MAX_CLOUD_PCT,
      ...scenes,
      source: PLANETARY_SOURCE,
      retrievedAt: new Date().toISOString(),
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch (err) {
    console.error(err);
    const msg = err instanceof PlanetaryError ? err.message : "Kunde inte hämta satellitscener";
    return NextResponse.json<ApiError>({ error: msg }, { status: 502 });
  }
}
