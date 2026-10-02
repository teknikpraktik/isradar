/**
 * Kontrakt för bulk-endpoints som kartlagret Förmodad åkbarhet använder.
 *   POST /api/meps/cells            – MEPS analys (+0 h) för gitterrutor
 *   POST /api/weather/precipitation – observerad nederbörd 24 h för punkter
 */
import type { DataSource, IsoDateTime } from "@/types/provenance";

export const MEPS_CELLS_MAX = 20000;
export const PRECIP_POINTS_MAX = 5000;

export interface MepsCellsResponse {
  modelRun: IsoDateTime;
  validAt: IsoDateTime;
  resolutionM: number;
  /** Per begärd ruta (samma ordning): [istjocklek cm, snö på is cm]. null = ingen sjöyta i rutan. */
  cells: [number | null, number | null][];
  source: DataSource;
  retrievedAt: IsoDateTime;
}

export interface PrecipitationPoint {
  id: number;
  lat: number;
  lon: number;
}

export interface PrecipitationPointResult {
  /** Summa mm senaste 24 h. */
  mm: number;
  station: { id: string; name: string; distanceKm: number };
  coverage: { hours: number; expectedHours: number };
}

export interface PrecipitationPointsResponse {
  /** Per begärd punkt (samma ordning). null = ingen station med data inom avståndet. */
  results: (PrecipitationPointResult | null)[];
  source: DataSource;
  retrievedAt: IsoDateTime;
}
