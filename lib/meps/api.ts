/**
 * Kontrakt för GET /api/meps?cells=y:x,y:x,…  (rutor från lakes-index mepsCells)
 * Delas av API-routen och lib/data/meps.ts.
 */
import type { DataSource, IsoDateTime } from "@/types/provenance";

export interface MepsStep {
  /** Timmar efter modellkörningen (0 = analys). */
  leadH: number;
  validAt: IsoDateTime;
  /** Median över rutor med sjöyta. null = inget värde. */
  iceCm: number | null;
  snowCm: number | null;
  surfaceC: number | null;
}

export interface MepsApiResponse {
  modelRun: IsoDateTime;
  steps: MepsStep[];
  validCells: number;
  totalCells: number;
  resolutionM: number;
  source: DataSource;
  retrievedAt: IsoDateTime;
}

/** Tidssteg som visas: analys + prognoser. */
export const MEPS_LEADS_H = [0, 24, 48, 66] as const;
export const MEPS_MAX_CELLS = 25;

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
