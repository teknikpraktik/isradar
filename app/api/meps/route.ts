import { NextResponse, type NextRequest } from "next/server";
import type { ApiError } from "@/lib/cold/api";
import { MEPS_LEADS_H, MEPS_MAX_CELLS, median, type MepsApiResponse } from "@/lib/meps/api";
import { MEPS_GRID, isValidCell, type MepsCell } from "@/lib/meps/grid";
import { MEPS_SOURCE, MepsError, latestCompleteRun, sampleCells } from "@/lib/server/meps";

const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

/**
 * MEPS sjöis för ett vattens gitterrutor: median över rutor med sjöyta, för
 * analys (+0 h) och prognos +24/+48/+66 h från senaste kompletta körning.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("cells") ?? "";
  const cells = raw
    .split(",")
    .filter(Boolean)
    .map((s) => s.split(":").map(Number) as MepsCell);
  if (cells.length === 0 || cells.length > MEPS_MAX_CELLS || !cells.every(isValidCell)) {
    return NextResponse.json<ApiError>({ error: `cells måste vara 1–${MEPS_MAX_CELLS} rutor y:x` }, { status: 400 });
  }

  try {
    const run = await latestCompleteRun();
    const sample = await sampleCells(run.file, cells);
    const runMs = Date.parse(run.runTime);
    const steps = MEPS_LEADS_H.map((h) => {
      const t = sample.times.findIndex((ms) => Math.round((ms - runMs) / 3_600_000) === h);
      const s = t >= 0 ? sample.perStep[t] : null;
      const ice = s ? median(s.ice) : null;
      const snow = s ? median(s.snow) : null;
      const surf = s ? median(s.surface) : null;
      return {
        leadH: h,
        validAt: new Date(runMs + h * 3_600_000).toISOString(),
        iceCm: round1(ice === null ? null : ice * 100),
        snowCm: round1(snow === null ? null : snow * 100),
        surfaceC: round1(surf === null ? null : surf - 273.15),
      };
    });
    const body: MepsApiResponse = {
      modelRun: run.runTime,
      steps,
      validCells: sample.validCells,
      totalCells: sample.totalCells,
      resolutionM: MEPS_GRID.dx,
      source: MEPS_SOURCE,
      retrievedAt: new Date().toISOString(),
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (err) {
    console.error(err);
    const msg = err instanceof MepsError ? err.message : "Kunde inte hämta MEPS";
    return NextResponse.json<ApiError>({ error: msg }, { status: 502 });
  }
}
