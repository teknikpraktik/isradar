/**
 * Kontrakt för Vänernmodellens endpoints:
 *   POST /api/weather/history     – observerat väderunderlag per väderruta
 *   GET  /api/vanern/passes       – senaste Sentinel-1-passen över regionen
 *   POST /api/vanern/sentinel     – VV-statistik per gridcell och pass
 */
import type { MultiPolygon, Polygon } from "geojson";
import type { DataSource, IsoDateTime } from "@/types/provenance";
import type { WeatherContextSummary } from "./weatherContext.ts";

export const WEATHER_HISTORY_MAX_POINTS = 100;
export const SENTINEL_MAX_CELLS = 120;

export interface WeatherHistoryPoint {
  id: string;
  lat: number;
  lon: number;
}

export interface WeatherHistoryResponse {
  /** Per begärd punkt (samma ordning). */
  results: { id: string; summary: WeatherContextSummary; stations: { temperature?: string; precipitation?: string; wind?: string } }[];
  source: DataSource;
  retrievedAt: IsoDateTime;
}

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
  /** Observerad vind vid passagen (SMHI), m/s. */
  windMs: number | null;
  gustMs: number | null;
}

export interface SentinelPassesResponse {
  /** [0] = senaste, [1] = föregående pass från samma bana (om det finns). */
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
  validPercent: number;
}

export interface SentinelStatsRequest {
  cells: SentinelCellRequest[];
  passes: { key: string; items: SentinelItemRef[] }[];
}

export interface SentinelStatsResponse {
  /** cellId → passnyckel → statistik (null = ingen täckning eller fel). */
  results: Record<string, Record<string, SentinelCellStats | null>>;
  retrievedAt: IsoDateTime;
}
