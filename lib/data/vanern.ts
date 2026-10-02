/**
 * Klientsidans väderhämtning för modellen för stora sjöar: väderunderlag per väderruta,
 * cachat i minnet per session. (Sentinel-1 hämtas av lib/data/sentinel.ts, som delas med sjömodellen.)
 */
import type { ApiError } from "@/lib/cold/api";
import type { WeatherHistoryResponse } from "@/lib/vanern/api";
import type { WeatherTile } from "@/lib/vanern/grid";
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
