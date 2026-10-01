import { NextResponse, type NextRequest } from "next/server";
import { isIsoDate, type ApiError } from "@/lib/cold/api";
import { CLEAR_MAX_CLOUD_PCT, SATELLITE_WINDOW_DAYS, type SatelliteApiResponse } from "@/lib/satellite/api";
import { COPERNICUS_SOURCE, StacError, latestPasses } from "@/lib/server/stac";

/** Senaste Sentinel-1/2-passager över ett vattens bbox (metadata, ingen bildanalys). */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const bbox = (p.get("bbox") ?? "").split(",").map(Number) as [number, number, number, number];
  const valid =
    bbox.length === 4 &&
    bbox.every(Number.isFinite) &&
    bbox[0] < bbox[2] &&
    bbox[1] < bbox[3] &&
    bbox[0] > 10 && bbox[2] < 25 && bbox[1] > 54.5 && bbox[3] < 69.5 &&
    bbox[2] - bbox[0] < 3 && bbox[3] - bbox[1] < 3;
  if (!valid) return NextResponse.json<ApiError>({ error: "Ogiltig bbox" }, { status: 400 });

  const asOf = p.get("asOf");
  if (asOf !== null && !isIsoDate(asOf)) return NextResponse.json<ApiError>({ error: "Ogiltigt asOf" }, { status: 400 });
  // Sökfönstrets slut: slutet av asOf-dygnet, annars nu (avrundat till timme för cache).
  const to = asOf
    ? new Date(Math.min(Date.parse(`${asOf}T23:59:59Z`), Date.now()))
    : new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000);

  try {
    const passes = await latestPasses(bbox, to, { days: SATELLITE_WINDOW_DAYS, clearMaxCloud: CLEAR_MAX_CLOUD_PCT });
    const body: SatelliteApiResponse = {
      to: to.toISOString(),
      windowDays: SATELLITE_WINDOW_DAYS,
      clearMaxCloudPct: CLEAR_MAX_CLOUD_PCT,
      ...passes,
      source: COPERNICUS_SOURCE,
      retrievedAt: new Date().toISOString(),
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (err) {
    console.error(err);
    const msg = err instanceof StacError ? err.message : "Kunde inte hämta satellitkatalogen";
    return NextResponse.json<ApiError>({ error: msg }, { status: 502 });
  }
}
