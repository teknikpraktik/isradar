/**
 * Kontrakt för GET /api/satellite?bbox=x0,y0,x1,y1[&asOf=YYYY-MM-DD]
 */
import type { DataSource, IsoDateTime } from "@/types/provenance";

export interface SatellitePassInfo {
  productId: string;
  acquiredAt: IsoDateTime;
  /** t.ex. "Sentinel-1C" */
  platform: string;
  sensor: "SAR" | "optical";
  /** Molnighet för hela produktens tile (~110 km), inte för vattnet. Endast optisk. */
  tileCloudCoverPct: number | null;
  /** "ascending" | "descending" */
  orbitState: string | null;
}

export interface SatelliteApiResponse {
  /** Sökfönstrets slut (asOf eller nu). */
  to: IsoDateTime;
  windowDays: number;
  clearMaxCloudPct: number;
  sar: SatellitePassInfo | null;
  optical: SatellitePassInfo | null;
  opticalClear: SatellitePassInfo | null;
  source: DataSource;
  retrievedAt: IsoDateTime;
}

export const SATELLITE_WINDOW_DAYS = 30;
export const CLEAR_MAX_CLOUD_PCT = 30;
