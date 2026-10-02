/**
 * Hämtar bulkdata för kartlagret Modellerad åkbarhet (MEPS-analys och nederbörd 24 h;
 * Sentinel-1 hämtas separat och successivt av components/useLakeSentinel). Varje källa fallerar för sig – en källa som saknas gör
 * bara att den räknas som "data saknas" i bedömningen.
 */
import type { ApiError } from "@/lib/cold/api";
import type { MepsCellsResponse, PrecipitationPointsResponse } from "@/lib/rideability/api";
import { cellKey, type RideabilityBulkData } from "@/lib/rideability/inputs";
import type { LakeId, LakeIndexEntry } from "@/types/lake";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as T | ApiError;
  if (!res.ok || (json && typeof json === "object" && "error" in json)) {
    throw new Error(json && typeof json === "object" && "error" in json ? String(json.error) : `HTTP ${res.status}`);
  }
  return json as T;
}

async function loadMepsCells(index: LakeIndexEntry[]): Promise<RideabilityBulkData["mepsCells"]> {
  const unique = new Map<string, [number, number]>();
  for (const l of index) for (const [y, x] of l.mepsCells) unique.set(cellKey(y, x), [y, x]);
  if (unique.size === 0) return new Map();
  const cells = [...unique.values()];
  const r = await post<MepsCellsResponse>("/api/meps/cells", { cells });
  return new Map(cells.map(([y, x], i) => [cellKey(y, x), r.cells[i] ?? [null, null]]));
}

async function loadPrecipitation(index: LakeIndexEntry[]): Promise<Map<LakeId, number | null>> {
  const points = index.map((l) => ({ id: l.id, lon: l.centroid[0], lat: l.centroid[1] }));
  const r = await post<PrecipitationPointsResponse>("/api/weather/precipitation", { points });
  return new Map(points.map((p, i) => [p.id, r.results[i]?.mm ?? null]));
}

export interface RideabilityBulkResult {
  data: Omit<RideabilityBulkData, "gdPercent" | "sentinel">;
  /** Källor som inte kunde hämtas. */
  failed: string[];
}

export async function loadRideabilityBulk(index: LakeIndexEntry[]): Promise<RideabilityBulkResult> {
  const failed: string[] = [];
  const guard = async <T,>(label: string, p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch (err) {
      console.error(`[åkbarhet] ${label}`, err);
      failed.push(label);
      return null;
    }
  };
  const [mepsCells, precipitationMm] = await Promise.all([
    guard("MEPS", loadMepsCells(index)),
    guard("nederbörd", loadPrecipitation(index)),
  ]);
  return { data: { mepsCells, precipitationMm }, failed };
}
