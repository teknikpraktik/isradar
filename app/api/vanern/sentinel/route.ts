import { NextResponse, type NextRequest } from "next/server";
import type { ApiError } from "@/lib/cold/api";
import { statsForCells } from "@/lib/server/vanernSentinel";
import { SENTINEL_MAX_CELLS, type SentinelStatsRequest, type SentinelStatsResponse } from "@/lib/vanern/api";

/** Vänernmodellen räknar bara på en handfull gridceller per anrop. */
export const maxDuration = 120;

/**
 * VV-statistik (median, standardavvikelse) per gridcell och pass: ett anrop mot
 * Planetary Computer per cell och pass, med server- och datacache. Body: { cells, passes }.
 */
export async function POST(request: NextRequest) {
  let req: SentinelStatsRequest | null = null;
  try {
    req = (await request.json()) as SentinelStatsRequest;
  } catch {
    /* hanteras nedan */
  }
  const valid =
    req &&
    Array.isArray(req.cells) &&
    Array.isArray(req.passes) &&
    req.cells.length > 0 &&
    req.cells.length <= SENTINEL_MAX_CELLS &&
    req.passes.length >= 1 &&
    req.passes.length <= 2 &&
    req.cells.every((c) => typeof c.id === "string" && c.geometry && (c.geometry.type === "Polygon" || c.geometry.type === "MultiPolygon"));
  if (!valid || !req) {
    return NextResponse.json<ApiError>({ error: `cells (1–${SENTINEL_MAX_CELLS}) och passes (1–2) krävs` }, { status: 400 });
  }
  try {
    const results = await statsForCells(req);
    const body: SentinelStatsResponse = { results, retrievedAt: new Date().toISOString() };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-cache" } });
  } catch (err) {
    console.error(err);
    return NextResponse.json<ApiError>({ error: "Kunde inte hämta Sentinel-1-statistik" }, { status: 502 });
  }
}
