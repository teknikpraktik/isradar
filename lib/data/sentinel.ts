/**
 * Klientsidans Sentinel-1-hämtning, gemensam för sjömodellen (en yta per sjö) och
 * modellen för stora sjöar (en yta per gridcell).
 *
 *   1. loadPassGroups   – alla pass över området (ett anrop, cachat på servern)
 *   2. loadSentinelFor  – för varje yta: senaste pass som täcker den + föregående pass från
 *                         samma bana; ytor med samma passpar hämtas i delar (ett statistikanrop
 *                         per yta och pass på servern). Ytor som ligger utanför ett pass svep
 *                         provas mot nästa pass (högst SENTINEL_SERVER.maxRounds omgångar).
 * Resultatet fylls på successivt via onUpdate så att kartan inte väntar på alla anrop.
 */
import type { MultiPolygon, Polygon } from "geojson";
import type { ApiError } from "@/lib/cold/api";
import { SENTINEL_SERVER } from "@/lib/sentinel/config";
import type { SentinelPassesResponse, SentinelPassRef, SentinelStatsResponse } from "@/lib/sentinel/api";
import { assignPasses } from "@/lib/sentinel/passes";
import { isUsableStats, type SentinelCellInput, type SentinelPassStats } from "@/lib/sentinel/score";

export interface SentinelEntity {
  id: string;
  geometry: Polygon | MultiPolygon;
  /** [lon, lat] – avgör vilka pass som täcker ytan. */
  centroid: [number, number];
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T | ApiError;
  if (!res.ok || (body && typeof body === "object" && "error" in body)) {
    throw new Error(body && typeof body === "object" && "error" in body ? String(body.error) : `HTTP ${res.status}`);
  }
  return body as T;
}

const passCache = new Map<string, Promise<SentinelPassRef[]>>();

/** Alla pass över området, nyast först (cachas per bbox under sessionen). */
export function loadPassGroups(bbox: [number, number, number, number]): Promise<SentinelPassRef[]> {
  const key = bbox.map((v) => v.toFixed(3)).join(",");
  let p = passCache.get(key);
  if (!p) {
    p = fetch(`/api/sentinel/passes?bbox=${bbox.join(",")}`)
      .then((r) => json<SentinelPassesResponse>(r))
      .then((r) => r.passes);
    p.catch(() => passCache.delete(key));
    passCache.set(key, p);
  }
  return p;
}

const post = <T>(url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => json<T>(r));

const toStats = (
  pass: SentinelPassRef | null,
  s: { medianDb: number; stdDb: number; validPixels: number } | null | undefined,
): SentinelPassStats | null => (pass && s ? { time: pass.time, windMs: pass.windMs, ...s } : null);

/**
 * Hämtar Sentinel-statistik för ytorna. Anropar onUpdate med hela resultatet hittills efter
 * varje del. Ytor utan användbart pass saknas i resultatet (= data saknas, aldrig 0).
 */
export async function loadSentinelFor(
  entities: SentinelEntity[],
  passes: SentinelPassRef[],
  onUpdate: (all: Map<string, SentinelCellInput>) => void,
  isCancelled: () => boolean,
): Promise<{ statsCalls: number }> {
  const result = new Map<string, SentinelCellInput>();
  const tried = new Map<string, Set<string>>();
  let pending = entities;
  let statsCalls = 0;

  for (let round = 0; round < SENTINEL_SERVER.maxRounds && pending.length > 0 && !isCancelled(); round++) {
    // Gruppera ytor efter passpar så att en begäran bara behöver två pass.
    const batches = new Map<string, { latest: SentinelPassRef; previous: SentinelPassRef | null; ents: SentinelEntity[] }>();
    for (const e of pending) {
      const { latest, previous } = assignPasses(passes, e.centroid, tried.get(e.id));
      if (!latest) continue;
      tried.set(e.id, new Set([...(tried.get(e.id) ?? []), latest.key]));
      const k = `${latest.key}|${previous?.key ?? ""}`;
      const b = batches.get(k) ?? { latest, previous, ents: [] };
      b.ents.push(e);
      batches.set(k, b);
    }
    const jobs = [...batches.values()].flatMap((b) => {
      const out: { latest: SentinelPassRef; previous: SentinelPassRef | null; ents: SentinelEntity[] }[] = [];
      for (let i = 0; i < b.ents.length; i += SENTINEL_SERVER.chunkSize) {
        out.push({ ...b, ents: b.ents.slice(i, i + SENTINEL_SERVER.chunkSize) });
      }
      return out;
    });
    const failed = new Set<string>();
    let next = 0;
    const worker = async () => {
      while (next < jobs.length && !isCancelled()) {
        const job = jobs[next++];
        const refs = [job.latest, ...(job.previous ? [job.previous] : [])].map((p) => ({ key: p.key, items: p.items }));
        try {
          const r = await post<SentinelStatsResponse>("/api/sentinel/stats", {
            cells: job.ents.map((e) => ({ id: e.id, geometry: e.geometry })),
            passes: refs,
          });
          statsCalls += job.ents.length * refs.length;
          for (const e of job.ents) {
            const res = r.results[e.id];
            const latest = toStats(job.latest, res?.[job.latest.key]);
            if (isUsableStats(latest)) {
              const prev = toStats(job.previous, job.previous ? res?.[job.previous.key] : null);
              result.set(e.id, { latest, previous: isUsableStats(prev) ? prev : null });
            } else {
              failed.add(e.id);
            }
          }
          if (!isCancelled()) onUpdate(new Map(result));
        } catch (err) {
          console.error("[sentinel] del misslyckades", err);
        }
      }
    };
    await Promise.all([worker(), worker()]);
    // Ytor utan användbar träff provas mot nästa pass i nästa omgång.
    pending = pending.filter((e) => !result.has(e.id) && failed.has(e.id));
  }
  return { statsCalls };
}
