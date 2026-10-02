/**
 * Sentinel-1-underlag för Vänernmodellen via Microsoft Planetary Computer.
 * Endast server.
 *
 *   passes()  – senaste pass över regionen och föregående pass från samma bana
 *   cellStats – median/std av 10·log10(VV) för en gridcell (ett anrop per cell och pass)
 *
 * Cache: statistik per (scen, cellgeometri) cachas länge i Nexts datacache
 * (scener ändras inte) och dessutom i minnet med dedupe av pågående anrop, så att
 * kartöppningar inte ger nya externa anrop. Anropsstrategin (ett anrop per cell)
 * är isolerad här och kan ersättas med t.ex. batch utan att resten ändras.
 */
import "server-only";
import { smhiWindAt } from "@/lib/server/smhi";
import { SENTINEL_SERVER } from "@/lib/vanern/config";
import type {
  SentinelCellRequest,
  SentinelCellStats,
  SentinelItemRef,
  SentinelPassRef,
  SentinelStatsRequest,
} from "@/lib/vanern/api";

const STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const STATS = "https://planetarycomputer.microsoft.com/api/data/v1/item/statistics";
const COLLECTION = "sentinel-1-rtc";
const EXPRESSION = "10*log10(vv)";

interface StacItem {
  id: string;
  bbox: [number, number, number, number];
  properties: {
    datetime: string;
    platform?: string;
    "sat:orbit_state"?: string;
    "sat:relative_orbit"?: number;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const platformName = (p?: string) =>
  p ? p.replace(/^sentinel-(\d)([a-z])$/i, (_m, n: string, l: string) => `Sentinel-${n}${l.toUpperCase()}`) : "Sentinel-1";

async function stacSearch(body: Record<string, unknown>): Promise<StacItem[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(STAC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "force-cache",
      next: { revalidate: SENTINEL_SERVER.passesRevalidateS },
    });
    if (res.status === 429 && attempt < 3) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`Planetary Computer svarade ${res.status}`);
    return ((await res.json()) as { features?: StacItem[] }).features ?? [];
  }
}

const contains = (b: [number, number, number, number], [lon, lat]: [number, number]) =>
  lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];

interface PassGroup {
  items: StacItem[];
  time: string;
  orbit: string | null;
  relativeOrbit: number | null;
  platform: string;
}

/** Skivor från samma pass (inom 2 min, samma bana) slås ihop. Nyast först. */
function groupPasses(items: StacItem[]): PassGroup[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.properties.datetime) - Date.parse(a.properties.datetime));
  const groups: PassGroup[] = [];
  for (const it of sorted) {
    const t = Date.parse(it.properties.datetime);
    const rel = it.properties["sat:relative_orbit"] ?? null;
    const g = groups.find((x) => Math.abs(Date.parse(x.time) - t) <= 120_000 && x.relativeOrbit === rel);
    if (g) g.items.push(it);
    else
      groups.push({
        items: [it],
        time: it.properties.datetime,
        orbit: it.properties["sat:orbit_state"] ?? null,
        relativeOrbit: rel,
        platform: platformName(it.properties.platform),
      });
  }
  return groups;
}

/**
 * Senaste pass som täcker `center` och föregående pass från samma bana (samma
 * omloppsriktning och relativa bana), med vind vid passagen från SMHI.
 */
export async function findPasses(bbox: [number, number, number, number], center: [number, number]): Promise<SentinelPassRef[]> {
  const to = new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000);
  const from = new Date(to.getTime() - SENTINEL_SERVER.searchDays * 86_400_000);
  const items = await stacSearch({
    collections: [COLLECTION],
    bbox,
    datetime: `${from.toISOString()}/${to.toISOString()}`,
    sortby: [{ field: "datetime", direction: "desc" }],
    limit: 100,
  });
  const groups = groupPasses(items).filter((g) => g.items.some((i) => contains(i.bbox, center)));
  const latest = groups[0];
  if (!latest) return [];
  const previous = groups.find(
    (g) => g !== latest && g.orbit === latest.orbit && g.relativeOrbit === latest.relativeOrbit && Date.parse(latest.time) - Date.parse(g.time) > 86_400_000,
  );
  return Promise.all(
    [latest, previous].filter((g): g is PassGroup => !!g).map(async (g): Promise<SentinelPassRef> => {
      let windMs: number | null = null;
      let gustMs: number | null = null;
      try {
        const t = Date.parse(g.time);
        const obs = await smhiWindAt(center[1], center[0], t, { maxKm: 60, limit: 3 });
        const best = obs.sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
        if (best) {
          windMs = best.speed;
          gustMs = best.gust;
        }
      } catch (err) {
        console.error("[vanern/wind]", err);
      }
      return {
        key: g.time,
        time: g.time,
        platform: g.platform,
        orbit: g.orbit,
        relativeOrbit: g.relativeOrbit,
        items: g.items.map((i): SentinelItemRef => ({ id: i.id, bbox: i.bbox })),
        windMs,
        gustMs,
      };
    }),
  );
}

/** Cache i minnet (utöver Nexts datacache) + dedupe av pågående anrop. */
const memo = new Map<string, Promise<SentinelCellStats | null>>();

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const roundCoords = (c: unknown): unknown => (Array.isArray(c) ? (typeof c[0] === "number" ? c.map((x) => round5(x as number)) : c.map(roundCoords)) : c);

async function fetchStats(itemId: string, geometry: SentinelCellRequest["geometry"]): Promise<SentinelCellStats | null> {
  const qs = new URLSearchParams([
    ["collection", COLLECTION],
    ["item", itemId],
    ["assets", "vv"],
    ["asset_as_band", "true"],
    ["expression", EXPRESSION],
    ["max_size", "1024"],
  ]);
  const body = JSON.stringify({
    type: "Feature",
    properties: {},
    geometry: { type: geometry.type, coordinates: roundCoords(geometry.coordinates) },
  });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${STATS}?${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "force-cache",
      next: { revalidate: SENTINEL_SERVER.statsRevalidateS },
    });
    if (res.status === 429 && attempt < 3) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    // 500 = cellen ligger utanför scenens giltiga yta – ingen täckning, inte ett fel.
    if (!res.ok) return null;
    const json = (await res.json()) as { properties?: { statistics?: Record<string, { median: number; std: number; valid_percent: number }> } };
    const s = json.properties?.statistics?.[EXPRESSION];
    if (!s || !Number.isFinite(s.median) || !Number.isFinite(s.std)) return null;
    return { medianDb: s.median, stdDb: s.std, validPercent: s.valid_percent };
  }
}

export function cellStats(itemId: string, cell: SentinelCellRequest): Promise<SentinelCellStats | null> {
  const key = `${itemId}|${cell.id}|${JSON.stringify(cell.geometry).length}`;
  let p = memo.get(key);
  if (!p) {
    p = fetchStats(itemId, cell.geometry).catch(() => null);
    memo.set(key, p);
  }
  return p;
}

const centerOf = (g: SentinelCellRequest["geometry"]): [number, number] => {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  const xs = polys.flatMap((p) => p[0].map((c) => c[0]));
  const ys = polys.flatMap((p) => p[0].map((c) => c[1]));
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};

/** Statistik för celler × pass; ett anrop per cell och pass med begränsad samtidighet. */
export async function statsForCells(req: SentinelStatsRequest): Promise<Record<string, Record<string, SentinelCellStats | null>>> {
  const jobs: { cell: SentinelCellRequest; passKey: string; itemId: string | null }[] = [];
  for (const cell of req.cells) {
    const c = centerOf(cell.geometry);
    for (const pass of req.passes) {
      jobs.push({ cell, passKey: pass.key, itemId: pass.items.find((i) => contains(i.bbox, c))?.id ?? null });
    }
  }
  const out: Record<string, Record<string, SentinelCellStats | null>> = {};
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const r = job.itemId ? await cellStats(job.itemId, job.cell) : null;
      (out[job.cell.id] ??= {})[job.passKey] = r;
    }
  };
  await Promise.all(Array.from({ length: SENTINEL_SERVER.concurrency }, worker));
  return out;
}
