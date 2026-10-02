/**
 * Sentinel-scener för ett vatten via /api/satellite (Planetary Computer).
 * Scenerna visas som rasterlager på kartan – ingen is/vatten-klassning ännu.
 */
import type { ApiError } from "@/lib/cold/api";
import type { PassWindResponse, SatelliteApiResponse } from "@/lib/satellite/api";
import { SOURCES } from "@/lib/sources";
import type { Lake } from "@/types/lake";
import type { SatelliteScenes } from "@/types/observations";
import type { DataResult } from "@/types/provenance";

const cache = new Map<string, Promise<SatelliteApiResponse>>();

function fetchScenes(lake: Lake, asOf?: string): Promise<SatelliteApiResponse> {
  const key = `${lake.id}|${asOf ?? ""}`;
  let p = cache.get(key);
  if (!p) {
    const [lon, lat] = lake.centroid;
    const qs = new URLSearchParams({ lon: String(lon), lat: String(lat) });
    if (asOf) qs.set("asOf", asOf);
    p = fetch(`/api/satellite?${qs}`).then(async (res) => {
      const body = (await res.json()) as SatelliteApiResponse | ApiError;
      if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : `HTTP ${res.status}`);
      return body;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export async function getSatelliteScenes(lake: Lake, asOf?: string): Promise<DataResult<SatelliteScenes>> {
  try {
    const r = await fetchScenes(lake, asOf);
    return {
      status: "ok",
      value: {
        sar: r.sar,
        optical: r.optical,
        opticalAny: r.opticalAny,
        windowDays: r.windowDays,
        clearMaxCloudPct: r.clearMaxCloudPct,
      },
    };
  } catch (err) {
    return { status: "unavailable", source: SOURCES.sentinel, reason: err instanceof Error ? err.message : "Okänt fel", code: "error" };
  }
}

const windCache = new Map<string, Promise<PassWindResponse>>();

/** Observerad vind vid en passage (cachas per position + tid). */
export function getPassWind(centroid: [number, number], time: string): Promise<PassWindResponse> {
  const [lon, lat] = centroid;
  const key = `${lon},${lat}|${time}`;
  let p = windCache.get(key);
  if (!p) {
    const qs = new URLSearchParams({ lon: String(lon), lat: String(lat), time });
    p = fetch(`/api/satellite/wind?${qs}`).then(async (res) => {
      const body = (await res.json()) as PassWindResponse | ApiError;
      if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : `HTTP ${res.status}`);
      return body;
    });
    p.catch(() => windCache.delete(key));
    windCache.set(key, p);
  }
  return p;
}
