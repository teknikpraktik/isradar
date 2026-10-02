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
  /** Sentinel-1: t.ex. ["VV","VH"]. Visas inte i UI. */
  polarizations: string[] | null;
  /** t.ex. "RTC (GRD, gamma0)" eller "L2A". */
  productType: string;
  /** Visningsvarianter (t.ex. sann/falsk färg). Första är standard. */
  renderings: { id: string; label: string; tileUrl: string }[];
  /** XYZ-tilemall för standardvisningen. */
  tileUrl: string;
}

/** Observerad vind vid en satellitpassage (GET /api/satellite/wind). */
export interface PassWind {
  /** Observationens tid (närmast passagen, högst ±1 h). */
  observedAt: IsoDateTime;
  speed: number;
  fromDirection: number | null;
  gust: number | null;
  station: { name: string; source: "SMHI" | "TRAFIKVERKET_VVIS"; distanceKm: number };
}

export interface PassWindResponse {
  passTime: IsoDateTime;
  wind: PassWind | null;
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
