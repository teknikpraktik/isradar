/**
 * Kontrakt för Sentinel-1-endpoints som delas av sjömodellen och modellen för stora sjöar:
 *   GET  /api/sentinel/passes?bbox=w,s,e,n   – senaste pass över ett område (nyast först)
 *   POST /api/sentinel/stats                 – VV-statistik per yta (sjö eller gridcell) och pass
 */
import type { MultiPolygon, Polygon } from "geojson";
import type { DataSource, IsoDateTime } from "@/types/provenance";

export const SENTINEL_MAX_CELLS = 120;

export interface SentinelItemRef {
  id: string;
  bbox: [number, number, number, number];
}

export interface SentinelPassRef {
  /** Stabil nyckel för passet (tid). */
  key: string;
  time: IsoDateTime;
  platform: string;
  orbit: string | null;
  relativeOrbit: number | null;
  /** Skivor (slices) som ingår i passet. */
  items: SentinelItemRef[];
  /** Observerad vind vid passagen (SMHI), m/s. null = ej hämtad eller saknas. */
  windMs: number | null;
  gustMs: number | null;
}

export interface SentinelPassesResponse {
  /** Alla pass över området, nyast först. */
  passes: SentinelPassRef[];
  source: DataSource;
  retrievedAt: IsoDateTime;
}

export interface SentinelCellRequest {
  id: string;
  geometry: Polygon | MultiPolygon;
}

export interface SentinelCellStats {
  medianDb: number;
  stdDb: number;
  /** Antal giltiga pixlar inom ytan (titilers valid_percent räknar mot omslutande ruta och duger inte som täckning). */
  validPixels: number;
}

export interface SentinelStatsRequest {
  cells: SentinelCellRequest[];
  passes: { key: string; items: SentinelItemRef[] }[];
}

export interface SentinelStatsResponse {
  /** ytans id → passnyckel → statistik (null = ingen täckning eller fel). */
  results: Record<string, Record<string, SentinelCellStats | null>>;
  retrievedAt: IsoDateTime;
}
