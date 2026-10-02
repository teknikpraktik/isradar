import { NextResponse, type NextRequest } from "next/server";
import type { ApiError } from "@/lib/cold/api";
import type { SentinelPassesResponse } from "@/lib/sentinel/api";
import { PLANETARY_SOURCE } from "@/lib/server/planetary";
import { findPassGroups } from "@/lib/server/sentinel";

/**
 * Alla Sentinel-1-pass över ett område (bbox=w,s,e,n) de senaste dygnen, nyast först, med
 * vind vid passagen för de nyaste. Cachas på servernivå (1 h).
 */
export async function GET(request: NextRequest) {
  const bbox = (request.nextUrl.searchParams.get("bbox") ?? "").split(",").map(Number);
  if (bbox.length !== 4 || !bbox.every(Number.isFinite) || bbox[0] < 10 || bbox[2] > 25 || bbox[1] < 54.5 || bbox[3] > 69.5) {
    return NextResponse.json<ApiError>({ error: "bbox måste vara w,s,e,n i Sverige" }, { status: 400 });
  }
  try {
    const passes = await findPassGroups(bbox as [number, number, number, number]);
    const body: SentinelPassesResponse = { passes, source: PLANETARY_SOURCE, retrievedAt: new Date().toISOString() };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-cache", "CDN-Cache-Control": "public, max-age=1800, stale-while-revalidate=3600" } });
  } catch (err) {
    console.error(err);
    return NextResponse.json<ApiError>({ error: "Kunde inte hämta Sentinel-1-pass" }, { status: 502 });
  }
}
