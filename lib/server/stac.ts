/**
 * Copernicus Data Space Ecosystem – öppen STAC-katalog (ingen nyckel krävs för
 * metadata). Endast server. https://stac.dataspace.copernicus.eu/v1
 *
 * Används för att hitta senaste Sentinel-1/2-passage över ett vatten. Själva
 * bilddatan (för is/vatten-klassning) kräver konto och hämtas inte här.
 */
import "server-only";
import type { SatellitePassInfo } from "@/lib/satellite/api";

const STAC = "https://stac.dataspace.copernicus.eu/v1/search";
const REVALIDATE = 1800;

export class StacError extends Error {}

interface StacFeature {
  id: string;
  properties: {
    datetime: string;
    platform?: string;
    "eo:cloud_cover"?: number;
    "sat:orbit_state"?: string;
    "sar:instrument_mode"?: string;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** STAC-sökning. Tjänsten begränsar anropstakten (429) – då väntar vi och försöker igen. */
async function search(body: Record<string, unknown>): Promise<StacFeature[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(STAC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: REVALIDATE },
    });
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new StacError(`STAC svarade ${res.status}`);
    return ((await res.json()) as { features?: StacFeature[] }).features ?? [];
  }
}

/** "sentinel-1c" → "Sentinel-1C" */
const platformName = (p?: string) => (p ? p.replace(/^sentinel-(\d)([a-z])$/i, (_, n, l) => `Sentinel-${n}${l.toUpperCase()}`) : "Sentinel");

function toPass(f: StacFeature, sensor: "SAR" | "optical"): SatellitePassInfo {
  return {
    productId: f.id,
    acquiredAt: f.properties.datetime,
    platform: platformName(f.properties.platform),
    sensor,
    tileCloudCoverPct: sensor === "optical" ? (f.properties["eo:cloud_cover"] ?? null) : null,
    orbitState: f.properties["sat:orbit_state"] ?? null,
  };
}

/**
 * Senaste passager inom [to − days, to] som korsar bbox.
 * Sentinel-1 GRD (radar, IW) och Sentinel-2 L2A (optisk); för Sentinel-2 även
 * senaste med tile-molnighet ≤ clearMaxCloud.
 */
export async function latestPasses(
  bbox: [number, number, number, number],
  to: Date,
  { days = 30, clearMaxCloud = 30 } = {},
): Promise<{ sar: SatellitePassInfo | null; optical: SatellitePassInfo | null; opticalClear: SatellitePassInfo | null }> {
  const from = new Date(to.getTime() - days * 86_400_000);
  const base = {
    bbox,
    datetime: `${from.toISOString()}/${to.toISOString()}`,
    limit: 1,
    sortby: [{ field: "properties.datetime", direction: "desc" }],
  };
  // Sekventiellt för att hålla anropstakten nere.
  const s1 = await search({ ...base, collections: ["sentinel-1-grd"] });
  const s2 = await search({ ...base, collections: ["sentinel-2-l2a"] });
  const s2clear = await search({
      ...base,
      collections: ["sentinel-2-l2a"],
      filter: { op: "<=", args: [{ property: "eo:cloud_cover" }, clearMaxCloud] },
      "filter-lang": "cql2-json",
  });
  return {
    sar: s1[0] ? toPass(s1[0], "SAR") : null,
    optical: s2[0] ? toPass(s2[0], "optical") : null,
    opticalClear: s2clear[0] ? toPass(s2clear[0], "optical") : null,
  };
}

export const COPERNICUS_SOURCE = {
  id: "copernicus-stac",
  name: "Copernicus Data Space Ecosystem (STAC)",
  url: "https://dataspace.copernicus.eu",
  license: "Copernicus Sentinel-data, fri användning",
} as const;
