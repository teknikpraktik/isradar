/**
 * MEPS sjöismodell (MET Norway, FLake). MODEL (+0 h) och FORECAST (+24/+48/+66 h).
 * Hämtas via /api/meps för vattnets gitterrutor (lakes-index mepsCells).
 *
 * Värdet gäller modellens sjöyta i 2,5 km-rutorna – inte nödvändigtvis just
 * detta vatten. Endast senaste körning (inget historiskt läge).
 */
import type { ApiError } from "@/lib/cold/api";
import type { MepsApiResponse, MepsStep } from "@/lib/meps/api";
import { SOURCES } from "@/lib/sources";
import type { Lake } from "@/types/lake";
import type { MepsObservation, MepsRun } from "@/types/observations";
import type { DataResult } from "@/types/provenance";

const cache = new Map<number, Promise<MepsApiResponse>>();

function fetchMeps(lake: Lake): Promise<MepsApiResponse> {
  let p = cache.get(lake.id);
  if (!p) {
    const cells = lake.mepsCells.map(([y, x]) => `${y}:${x}`).join(",");
    p = fetch(`/api/meps?cells=${cells}`).then(async (res) => {
      const body = (await res.json()) as MepsApiResponse | ApiError;
      if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : `HTTP ${res.status}`);
      return body;
    });
    p.catch(() => cache.delete(lake.id));
    cache.set(lake.id, p);
  }
  return p;
}

const qn = <U extends "cm" | "°C">(v: number | null, unit: U) => (v === null ? null : { value: v, unit });

function toObservation(lake: Lake, r: MepsApiResponse, s: MepsStep): MepsObservation {
  return {
    lakeId: lake.id,
    values: {
      iceThickness: qn(s.iceCm, "cm"),
      snowOnIce: qn(s.snowCm, "cm"),
      surfaceTemperature: qn(s.surfaceC, "°C"),
    },
    provenance: {
      source: r.source,
      time:
        s.leadH === 0
          ? { kind: "model", modelRun: r.modelRun, validAt: s.validAt }
          : { kind: "forecast", modelRun: r.modelRun, validAt: s.validAt, leadTimeHours: s.leadH },
      retrievedAt: r.retrievedAt,
      quality: {
        resolutionM: r.resolutionM,
        cells: { valid: r.validCells, total: r.totalCells },
      },
    },
  };
}

export async function getMepsRun(lake: Lake, asOf?: string): Promise<DataResult<MepsRun>> {
  if (asOf) {
    return { status: "unavailable", source: SOURCES.meps, reason: "MEPS finns bara för senaste körning", code: "not_historical" };
  }
  if (lake.mepsCells.length === 0) {
    return { status: "unavailable", source: SOURCES.meps, reason: "Utanför MEPS-området", code: "no_data_yet" };
  }
  try {
    const r = await fetchMeps(lake);
    if (r.validCells === 0) {
      return { status: "unavailable", source: SOURCES.meps, reason: "Ingen sjöyta i MEPS-rutan", code: "no_data_yet" };
    }
    const [analysis, ...forecasts] = r.steps;
    return {
      status: "ok",
      value: {
        lakeId: lake.id,
        modelRun: r.modelRun,
        analysis: analysis ? toObservation(lake, r, analysis) : null,
        forecasts: forecasts.map((s) => toObservation(lake, r, s)),
      },
    };
  } catch (err) {
    return {
      status: "unavailable",
      source: SOURCES.meps,
      reason: err instanceof Error ? err.message : "Okänt fel",
      code: "error",
    };
  }
}
