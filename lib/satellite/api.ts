/**
 * Kontrakt för GET /api/satellite?lon=..&lat=..[&asOf=YYYY-MM-DD]
 */
import type { DataSource, IsoDateTime } from "@/types/provenance";

/** En Sentinel-scen som kan visas som rasterlager på kartan. */
export interface SatelliteScene {
  id: string;
  sensor: "SAR" | "optical";
  acquiredAt: IsoDateTime;
  /** t.ex. "Sentinel-1C" */
  platform: string;
  /** Molnighet för hela scenrutan (~100 km), inte vattnet. Endast optisk. */
  cloudCoverPct: number | null;
  orbitState: string | null;
  bounds: [number, number, number, number] | null;
  /** XYZ-tilemall för MapLibre ({z}/{x}/{y}). */
  tileUrl: string;
}

export interface SatelliteApiResponse {
  to: IsoDateTime;
  windowDays: number;
  clearMaxCloudPct: number;
  /** Radarscener, nyast först. */
  sar: SatelliteScene[];
  /** Optiska scener med molnighet ≤ clearMaxCloudPct, nyast först. */
  optical: SatelliteScene[];
  /** Senaste optiska oavsett moln – bara om inga klara scener finns. */
  opticalAny: SatelliteScene | null;
  source: DataSource;
  retrievedAt: IsoDateTime;
}

export const SATELLITE_WINDOW_DAYS = 30;
export const CLEAR_MAX_CLOUD_PCT = 30;
