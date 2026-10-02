import { NextResponse, type NextRequest } from "next/server";
import type { ApiError } from "@/lib/cold/api";
import { MEPS_GRID, isValidCell, type MepsCell } from "@/lib/meps/grid";
import { MEPS_CELLS_MAX, type MepsCellsResponse } from "@/lib/rideability/api";
import { MEPS_SOURCE, MepsError, latestCompleteRun, sampleAnalysis } from "@/lib/server/meps";

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * MEPS analys (+0 h): istjocklek och snö på is per gitterruta, för kartlagret
 * Modellerad åkbarhet. Body: { cells: [[y, x], …] }.
 */
export async function POST(request: NextRequest) {
  let cells: MepsCell[] = [];
  try {
    const body = (await request.json()) as { cells?: unknown };
    if (Array.isArray(body.cells)) cells = body.cells as MepsCell[];
  } catch {
    /* hanteras nedan */
  }
  if (cells.length === 0 || cells.length > MEPS_CELLS_MAX || !cells.every((c) => Array.isArray(c) && isValidCell(c))) {
    return NextResponse.json<ApiError>({ error: `cells måste vara 1–${MEPS_CELLS_MAX} rutor [y, x]` }, { status: 400 });
  }
  try {
    const run = await latestCompleteRun();
    const sample = await sampleAnalysis(run.file, run.runTime, cells);
    const out: MepsCellsResponse = {
      modelRun: run.runTime,
      validAt: sample.validAt,
      resolutionM: MEPS_GRID.dx,
      cells: sample.values.map((v) => (v ? [round1(v[0] * 100), v[1] === null ? null : round1(v[1] * 100)] : [null, null])),
      source: MEPS_SOURCE,
      retrievedAt: new Date().toISOString(),
    };
    return NextResponse.json(out, { headers: { "Cache-Control": "no-cache" } });
  } catch (err) {
    console.error(err);
    const msg = err instanceof MepsError ? err.message : "Kunde inte hämta MEPS";
    return NextResponse.json<ApiError>({ error: msg }, { status: 502 });
  }
}
