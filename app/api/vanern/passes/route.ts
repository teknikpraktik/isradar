import { NextResponse, type NextRequest } from "next/server";
import type { ApiError } from "@/lib/cold/api";
import { PLANETARY_SOURCE } from "@/lib/server/planetary";
import { findPasses } from "@/lib/server/vanernSentinel";
import type { SentinelPassesResponse } from "@/lib/vanern/api";

/**
 * Senaste Sentinel-1-pass över regionen (bbox=w,s,e,n) och föregående pass från
 * samma bana, med vind vid passagen. Cachas på servernivå (1 h).
 */
export async function GET(request: NextRequest) {
  const bbox = (request.nextUrl.searchParams.get("bbox") ?? "").split(",").map(Number);
  if (bbox.length !== 4 || !bbox.every(Number.isFinite) || bbox[0] < 10 || bbox[2] > 25 || bbox[1] < 54.5 || bbox[3] > 69.5) {
    return NextResponse.json<ApiError>({ error: "bbox måste vara w,s,e,n i Sverige" }, { status: 400 });
  }
  try {
    const b = bbox as [number, number, number, number];
    const passes = await findPasses(b, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
    const body: SentinelPassesResponse = { passes, source: PLANETARY_SOURCE, retrievedAt: new Date().toISOString() };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-cache", "CDN-Cache-Control": "public, max-age=1800, stale-while-revalidate=3600" } });
  } catch (err) {
    console.error(err);
    return NextResponse.json<ApiError>({ error: "Kunde inte hämta Sentinel-1-pass" }, { status: 502 });
  }
}
