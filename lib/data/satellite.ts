/**
 * Sentinel-satelliter. Steg 1: senaste passager över vattnet (metadata från
 * Copernicus öppna STAC-katalog via /api/satellite). Ingen bildanalys ännu –
 * is/vatten-andel (SatelliteObservation) kräver Copernicus-konto och byggs
 * i steg 2.
 */
import type { ApiError } from "@/lib/cold/api";
import type { SatelliteApiResponse, SatellitePassInfo } from "@/lib/satellite/api";
import { SOURCES } from "@/lib/sources";
import type { Lake } from "@/types/lake";
import type { SatellitePass, SatellitePasses } from "@/types/observations";
import type { DataResult } from "@/types/provenance";

const cache = new Map<string, Promise<SatelliteApiResponse>>();

function fetchPasses(lake: Lake, asOf?: string): Promise<SatelliteApiResponse> {
  const key = `${lake.id}|${asOf ?? ""}`;
  let p = cache.get(key);
  if (!p) {
    const qs = new URLSearchParams({ bbox: lake.bbox.join(",") });
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

function toPass(lake: Lake, r: SatelliteApiResponse, s: SatellitePassInfo | null): SatellitePass | null {
  if (!s) return null;
  return {
    lakeId: lake.id,
    productId: s.productId,
    platform: s.platform,
    sensor: s.sensor,
    orbitState: s.orbitState,
    provenance: {
      source: r.source,
      time: { kind: "observation", observedAt: s.acquiredAt },
      retrievedAt: r.retrievedAt,
      quality: s.tileCloudCoverPct === null ? {} : { cloudCoverPct: Math.round(s.tileCloudCoverPct) },
    },
  };
}

export async function getSatellitePasses(lake: Lake, asOf?: string): Promise<DataResult<SatellitePasses>> {
  try {
    const r = await fetchPasses(lake, asOf);
    return {
      status: "ok",
      value: {
        sar: toPass(lake, r, r.sar),
        optical: toPass(lake, r, r.optical),
        opticalClear: toPass(lake, r, r.opticalClear),
        windowDays: r.windowDays,
        clearMaxCloudPct: r.clearMaxCloudPct,
      },
    };
  } catch (err) {
    return {
      status: "unavailable",
      source: SOURCES.sentinel,
      reason: err instanceof Error ? err.message : "Okänt fel",
      code: "error",
    };
  }
}
