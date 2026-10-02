"use client";

/**
 * Sentinel-1 för sjömodellen: statistik över varje sjös yta (senaste pass och föregående pass från
 * samma bana), med samma hämtning och heuristik som modellen för stora sjöar. Hämtar inget förrän
 * lagret Modellerad åkbarhet är på, och fyller på successivt (servern cachar statistiken).
 */
import { useEffect, useMemo, useState } from "react";
import type { RegionLakeData } from "@/lib/data/lakes";
import { loadPassGroups, loadSentinelFor, type SentinelEntity } from "@/lib/data/sentinel";
import { geometryAreaKm2 } from "@/lib/geo/clip";
import { toLakeSentinelIndication } from "@/lib/rideability/sentinel";
import type { SentinelIndication } from "@/lib/rideability/types";
import { LAKE_SENTINEL } from "@/lib/sentinel/config";
import type { SentinelCellInput } from "@/lib/sentinel/score";
import type { LakeId } from "@/types/lake";
import type { RegionDefinition } from "@/types/region";

export interface LakeSentinel {
  /** Sentinel-indikation per sjö. Sjöar utan data saknas i kartan (= data saknas, aldrig 0). */
  indications: Map<LakeId, SentinelIndication | null>;
  loading: boolean;
  failed: boolean;
  /** Antal sjöar som får statistik och antal statistikanrop som behövdes (för diagnostik). */
  lakeCount: number;
  statsCalls: number;
}

export function useLakeSentinel({
  region,
  data,
  skipIds,
  enabled,
  asOf,
}: {
  region: RegionDefinition;
  data: RegionLakeData | null;
  /** Vatten som har egen modell (stora sjöar) och inte ska få sjömodellens Sentinel-faktor. */
  skipIds: ReadonlySet<number>;
  enabled: boolean;
  asOf?: string;
}): LakeSentinel {
  const entities = useMemo<SentinelEntity[]>(() => {
    if (!data) return [];
    const byId = new Map(data.features.features.map((f) => [f.properties.id, f]));
    return data.index.flatMap((l) => {
      if (l.areaType === "COLLECTION_AREA" || !l.hasPolygon || skipIds.has(l.id)) return [];
      const g = byId.get(l.id)?.geometry;
      if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return [];
      // För små vatten ger bara kantpixlar – ingen statistik (data saknas).
      if (geometryAreaKm2(g) < LAKE_SENTINEL.minAreaKm2) return [];
      return [{ id: String(l.id), geometry: g, centroid: l.centroid }];
    });
  }, [data, skipIds]);

  const [raw, setRaw] = useState<Map<string, SentinelCellInput>>(new Map());
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [statsCalls, setStatsCalls] = useState(0);
  const key = data ? `${region.id}|${entities.length}` : null;

  useEffect(() => {
    // Ingen historisk Sentinel-statistik i ?asOf=-läget (passen hämtas för nuläget).
    if (!enabled || entities.length === 0 || asOf) return;
    let cancelled = false;
    (async () => {
      const [w, s, e, n] = [region.view.bounds[0][0], region.view.bounds[0][1], region.view.bounds[1][0], region.view.bounds[1][1]];
      try {
        const passes = await loadPassGroups([w, s, e, n]);
        if (cancelled || passes.length === 0) return;
        const r = await loadSentinelFor(entities, passes, (all) => setRaw(all), () => cancelled);
        if (!cancelled) setStatsCalls(r.statsCalls);
      } catch (err) {
        console.error("[sentinel] sjöar", err);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // key identifierar sjöuppsättningen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, asOf, key]);

  const indications = useMemo(() => {
    const out = new Map<LakeId, SentinelIndication | null>();
    const now = new Date();
    for (const [id, input] of raw) out.set(Number(id), toLakeSentinelIndication(input, now));
    return out;
  }, [raw]);

  // Endast utveckling: gör sjöarnas Sentinel-underlag inspekterbart från konsolen.
  useEffect(() => {
    if (process.env.NODE_ENV === "development") (window as unknown as { __isvakLakeSentinel?: unknown }).__isvakLakeSentinel = { raw, entities };
  }, [raw, entities]);

  return {
    indications,
    loading: enabled && !asOf && entities.length > 0 && !done,
    failed,
    lakeCount: entities.length,
    statsCalls,
  };
}
