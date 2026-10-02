/**
 * Klientsidans hämtning för Vänernmodellen: väderunderlag per väderruta och
 * Sentinel-1-statistik per gridcell. Allt cachas i minnet per session och
 * Sentinel-statistiken hämtas i delar så att kartan fylls på successivt.
 */
import type { ApiError } from "@/lib/cold/api";
import { SENTINEL_SERVER } from "@/lib/vanern/config";
import type {
  SentinelCellStats,
  SentinelPassesResponse,
  SentinelStatsResponse,
  WeatherHistoryResponse,
} from "@/lib/vanern/api";
import type { VanernCell, WeatherTile } from "@/lib/vanern/grid";
import type { WeatherContextSummary } from "@/lib/vanern/weatherContext";

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T | ApiError;
  if (!res.ok || (body && typeof body === "object" && "error" in body)) {
    throw new Error(body && typeof body === "object" && "error" in body ? String(body.error) : `HTTP ${res.status}`);
  }
  return body as T;
}

const post = <T>(url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => json<T>(r));

const weatherCache = new Map<string, Promise<Map<string, WeatherContextSummary>>>();

/** Väderunderlag per väderruta (en begäran för hela Vänern; SMHI-stationer delas mellan rutor). */
export function loadWeatherContext(tiles: WeatherTile[]): Promise<Map<string, WeatherContextSummary>> {
  const key = tiles.map((t) => t.id).join("|");
  let p = weatherCache.get(key);
  if (!p) {
    p = post<WeatherHistoryResponse>(
      "/api/weather/history",
      { points: tiles.map((t) => ({ id: t.id, lat: t.lat, lon: t.lon })) },
    ).then((r) => new Map(r.results.map((x) => [x.id, x.summary] as const)));
    p.catch(() => weatherCache.delete(key));
    weatherCache.set(key, p);
  }
  return p;
}

export function loadPasses(bbox: [number, number, number, number]): Promise<SentinelPassesResponse> {
  return fetch(`/api/vanern/passes?bbox=${bbox.join(",")}`).then((r) => json<SentinelPassesResponse>(r));
}

/** cellId → passnyckel → statistik. */
export type SentinelResults = Map<string, Record<string, SentinelCellStats | null>>;

/**
 * Hämtar Sentinel-statistik i delar om `chunkSize` celler (två delar samtidigt) och
 * anropar onChunk efter varje del. Avbryts av `isCancelled`.
 */
export async function loadSentinelStats(
  cells: VanernCell[],
  passes: SentinelPassesResponse["passes"],
  onChunk: (partial: SentinelResults) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const size = SENTINEL_SERVER.chunkSize;
  const chunks: VanernCell[][] = [];
  for (let i = 0; i < cells.length; i += size) chunks.push(cells.slice(i, i + size));
  const refs = passes.map((p) => ({ key: p.key, items: p.items }));
  let next = 0;
  const worker = async () => {
    while (next < chunks.length && !isCancelled()) {
      const chunk = chunks[next++];
      try {
        const r = await post<SentinelStatsResponse>("/api/vanern/sentinel", {
          cells: chunk.map((c) => ({ id: c.id, geometry: c.geometry })),
          passes: refs,
        });
        if (!isCancelled()) onChunk(new Map(Object.entries(r.results)));
      } catch (err) {
        console.error("[vanern] sentinel-del misslyckades", err);
      }
    }
  };
  await Promise.all([worker(), worker()]);
}
