"use client";

/**
 * Vänernmodellen för kartlagret Modellerad åkbarhet: bygger analysgrid, hämtar
 * väderunderlag (en gång per väderruta) och Sentinel-1-statistik (successivt),
 * och returnerar cellernas kartfeatures. Hämtar inget förrän lagret är på.
 */
import { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { loadPassGroups, loadSentinelFor } from "@/lib/data/sentinel";
import { loadWeatherContext } from "@/lib/data/vanern";
import type { RegionLakeData } from "@/lib/data/lakes";
import type { SentinelCellInput } from "@/lib/sentinel/score";
import { geometryBox } from "@/lib/geo/clip";
import { generateVanernGrid, groupWeatherTiles, type VanernCell } from "@/lib/vanern/grid";
import { vanernGridMembers, vanernMemberIds } from "@/lib/vanern/members";
import { computeVanernCells, vanernCellFeatures } from "@/lib/vanern/results";
import type { VanernCellResult } from "@/lib/vanern/score";
import type { WeatherContextSummary } from "@/lib/vanern/weatherContext";
import type { RegionDefinition } from "@/types/region";

export interface VanernCells {
  /** Kartfeatures per analyscell, eller null om regionen saknar Vänernmodell. */
  features: FeatureCollection<Polygon | MultiPolygon> | null;
  /** Objektid som täcks av Vänernmodellen (ska inte få sjömodell). */
  memberIds: Set<number>;
  cellCount: number;
  /**
   * Grunddata (väderunderlag) har hämtats eller misslyckats, så cellernas färger är slutgiltiga utöver
   * Sentinel-1, som fyller på successivt. Sant när lagret är av, i historiskt läge och utan celler.
   */
  baseReady: boolean;
  loading: boolean;
  failed: string[];
  /** Internt: resultat per cell (delscore, tak, datatillit) för felsökning och kalibrering. */
  results: Map<string, VanernCellResult>;
}

const EMPTY_IDS = new Set<number>();
const EMPTY_CELLS: VanernCell[] = [];

export function useVanernCells({
  region,
  data,
  currentColdByStation,
  enabled,
  asOf,
}: {
  region: RegionDefinition;
  data: RegionLakeData | null;
  /** Aktuell köldmängd (GD) per temperaturstation. */
  currentColdByStation: Map<number, number | null> | null;
  enabled: boolean;
  asOf?: string;
}): VanernCells {
  const def = region.waterModels?.find((m) => m.model === "vanern") ?? null;

  const grid = useMemo(() => {
    if (!def || !data) return null;
    const memberIds = vanernMemberIds(def, data.index);
    const cells = generateVanernGrid(vanernGridMembers(memberIds, data.features), { cellKm: def.cellKm });
    return { memberIds, cells, tiles: groupWeatherTiles(cells) };
  }, [def, data]);

  const [weatherByTile, setWeatherByTile] = useState<Map<string, WeatherContextSummary> | null>(null);
  const [sentinel, setSentinel] = useState<Map<string, SentinelCellInput>>(new Map());
  const [failed, setFailed] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [baseDoneKey, setBaseDoneKey] = useState<string | null>(null);
  const gridKey = grid ? `${region.id}|${grid.cells.length}` : null;

  useEffect(() => {
    // MEPS-lika historiska data finns inte för väder/Sentinel – i historiskt läge hämtas inget.
    if (!enabled || !grid || grid.cells.length === 0 || asOf) return;
    let cancelled = false;
    const fail = (what: string) => !cancelled && setFailed((f) => (f.includes(what) ? f : [...f, what]));
    (async () => {
      const bbox = grid.cells.map((c) => geometryBox(c.geometry)).reduce(
        (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])],
      );
      const [weather, passes] = await Promise.all([
        loadWeatherContext(grid.tiles).catch(() => (fail("Vänern väder"), null)),
        loadPassGroups(bbox as [number, number, number, number]).catch(() => (fail("Vänern Sentinel-1"), null)),
      ]);
      if (cancelled) return;
      if (weather) setWeatherByTile(weather);
      setBaseDoneKey(gridKey);
      if (passes && passes.length > 0) {
        await loadSentinelFor(
          grid.cells.map((c) => ({ id: c.id, geometry: c.geometry, centroid: c.centroid })),
          passes,
          (all) => setSentinel(all),
          () => cancelled,
        );
      }
      if (!cancelled) setDone(true);
    })();
    return () => {
      cancelled = true;
    };
    // gridKey identifierar gridet; enabled/asOf styr om något hämtas.
  }, [enabled, asOf, gridKey, grid]);
  const baseReady = !enabled || !!asOf || !grid || grid.cells.length === 0 || baseDoneKey === gridKey;

  // Aktuell GD i % av objektets egen historiska referens. Samlingsområden (Vänerns delar) saknar
  // kartfärgens progress, men har referens och station i indexet – därför räknas det här direkt.
  const coldPercentByArea = useMemo(() => {
    const m = new Map<number, number | null>();
    for (const l of data?.index ?? []) {
      const cur = l.stationId !== null ? currentColdByStation?.get(l.stationId) : null;
      m.set(l.id, l.hca !== null && l.hca > 0 && typeof cur === "number" ? (Math.max(0, cur) / l.hca) * 100 : null);
    }
    return m;
  }, [data, currentColdByStation]);

  const cells: VanernCell[] = grid?.cells ?? EMPTY_CELLS;
  const results = useMemo(
    () =>
      computeVanernCells(cells, {
        coldPercentByArea,
        weatherByTile: weatherByTile ?? new Map(),
        sentinelByCell: sentinel,
      }),
    [cells, coldPercentByArea, weatherByTile, sentinel],
  );
  const features = useMemo(() => (grid ? vanernCellFeatures(cells, results) : null), [grid, cells, results]);

  // Endast utveckling: gör cellernas delscore inspekterbara från konsolen.
  useEffect(() => {
    if (process.env.NODE_ENV === "development") (window as unknown as { __isvakVanern?: unknown }).__isvakVanern = { cells, results };
  }, [cells, results]);

  return {
    features,
    memberIds: grid?.memberIds ?? EMPTY_IDS,
    cellCount: cells.length,
    baseReady,
    loading: enabled && !asOf && cells.length > 0 && !done,
    failed,
    results,
  };
}
