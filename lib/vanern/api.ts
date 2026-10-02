/**
 * Kontrakt för Vänernmodellens endpoints:
 *   POST /api/weather/history     – observerat väderunderlag per väderruta
 * (Sentinel-1-endpoints delas med sjömodellen: lib/sentinel/api.ts.)
 */
import type { DataSource, IsoDateTime } from "@/types/provenance";
import type { WeatherContextSummary } from "./weatherContext.ts";

export const WEATHER_HISTORY_MAX_POINTS = 100;

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
