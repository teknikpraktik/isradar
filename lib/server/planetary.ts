/**
 * Sentinel-scener via Microsoft Planetary Computer (öppen STAC + tile-tjänst,
 * ingen nyckel). Endast server – klienten får färdiga tile-URL:er och hämtar
 * rastertiles direkt från Planetary Computer (CORS öppet, tiles cachas 1 h).
 *
 *   STAC:  https://planetarycomputer.microsoft.com/api/stac/v1
 *   Tiles: https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/…
 *
 * Sentinel-1: samlingen sentinel-1-rtc (radiometriskt terrängkorrigerad, VV/VH).
 * Sentinel-2: sentinel-2-l2a, tillgången "visual" (sann färg).
 * Copernicus Sentinel-data, fri användning; Planetary Computers användarvillkor.
 */
import "server-only";
import type { SatelliteScene } from "@/lib/satellite/api";

const STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const TILES = "https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png";
const REVALIDATE = 3600;

export class PlanetaryError extends Error {}

/** Visualisering per sensor – neutral, ingen klassificering. */
const RENDER: Record<"SAR" | "optical", Record<string, string>> = {
  // VV-backscatter i dB, gråskala. Lugnt vatten blir mörkt.
  SAR: { expression: "10*log10(vv)", asset_as_band: "true", rescale: "-25,0", colormap_name: "gray" },
  // Sann färg (TCI). nodata=0 gör ytan utanför scenen genomskinlig.
  optical: { assets: "visual", asset_bidx: "visual|1,2,3", nodata: "0" },
};

const COLLECTION = { SAR: "sentinel-1-rtc", optical: "sentinel-2-l2a" } as const;

export function tileUrl(sensor: "SAR" | "optical", itemId: string): string {
  const qs = new URLSearchParams({ collection: COLLECTION[sensor], item: itemId, ...RENDER[sensor] });
  return `${TILES}?${qs.toString()}`;
}

interface StacItem {
  id: string;
  bbox?: [number, number, number, number];
  properties: { datetime: string; platform?: string; "eo:cloud_cover"?: number; "sat:orbit_state"?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(body: Record<string, unknown>): Promise<StacItem[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(STAC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: REVALIDATE },
    });
    if (res.status === 429 && attempt < 3) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new PlanetaryError(`Planetary Computer svarade ${res.status}`);
    return ((await res.json()) as { features?: StacItem[] }).features ?? [];
  }
}

/** "sentinel-1c" / "Sentinel-2C" → "Sentinel-1C" */
const platformName = (p?: string) =>
  p ? p.replace(/^sentinel-(\d)([a-z])$/i, (_m, n: string, l: string) => `Sentinel-${n}${l.toUpperCase()}`) : "Sentinel";

function toScene(item: StacItem, sensor: "SAR" | "optical"): SatelliteScene {
  return {
    id: item.id,
    sensor,
    acquiredAt: item.properties.datetime,
    platform: platformName(item.properties.platform),
    cloudCoverPct: sensor === "optical" ? (item.properties["eo:cloud_cover"] ?? null) : null,
    orbitState: item.properties["sat:orbit_state"] ?? null,
    bounds: item.bbox ?? null,
    tileUrl: tileUrl(sensor, item.id),
  };
}

/**
 * Scener som täcker punkten (vattnets centroid) inom [to − days, to], nyast först.
 * Sentinel-2 delas i 100 km-rutor – punktsökning ger rutan som täcker vattnet.
 */
export async function scenesAt(
  point: [number, number],
  to: Date,
  { days = 30, limit = 8, maxCloud = 30 } = {},
): Promise<{ sar: SatelliteScene[]; optical: SatelliteScene[]; opticalAny: SatelliteScene | null }> {
  const from = new Date(to.getTime() - days * 86_400_000);
  const base = {
    intersects: { type: "Point", coordinates: point },
    datetime: `${from.toISOString()}/${to.toISOString()}`,
    sortby: [{ field: "datetime", direction: "desc" }],
  };
  // Sekventiellt för att hålla anropstakten nere.
  const s1 = await search({ ...base, collections: [COLLECTION.SAR], limit });
  const s2 = await search({
    ...base,
    collections: [COLLECTION.optical],
    limit,
    query: { "eo:cloud_cover": { lte: maxCloud } },
  });
  // Senaste optiska oavsett moln – bara om ingen klar scen finns.
  const s2any = s2.length ? [] : await search({ ...base, collections: [COLLECTION.optical], limit: 1 });
  // Samma passage kan ge flera 100 km-rutor över punkten – behåll en per tidpunkt
  // (lägst molnighet).
  const byTime = new Map<string, StacItem>();
  for (const i of s2) {
    const k = i.properties.datetime.slice(0, 16);
    const prev = byTime.get(k);
    if (!prev || (i.properties["eo:cloud_cover"] ?? 100) < (prev.properties["eo:cloud_cover"] ?? 100)) byTime.set(k, i);
  }
  return {
    sar: s1.map((i) => toScene(i, "SAR")),
    optical: [...byTime.values()].map((i) => toScene(i, "optical")),
    opticalAny: s2any[0] ? toScene(s2any[0], "optical") : null,
  };
}

export const PLANETARY_SOURCE = {
  id: "planetary-computer",
  name: "Copernicus Sentinel via Microsoft Planetary Computer",
  url: "https://planetarycomputer.microsoft.com",
  license: "Copernicus Sentinel-data (fri användning)",
} as const;
