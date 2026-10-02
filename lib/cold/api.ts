/**
 * Kontrakt för GET /api/cold/station/[measurepoint]?asOf=YYYY-MM-DD
 * Delas av API-routen (server) och lib/data/cold.ts (klient).
 */
import type { ColdAmountPoint, IsoDate } from "@/lib/cold/compute";
import type { DataSource, IsoDateTime } from "@/types/provenance";

export interface StationColdAmountResponse {
  /** Skridskonätets station-id. */
  measurepoint: number;
  stationName: string;
  smhi: { id: string; name: string; distanceM: number };
  /** Datum beräkningen avser (default: idag, UTC). */
  asOf: IsoDate;
  seasonStart: IsoDate;
  /** Sista dygnet med data. null om säsongen saknar data ännu. */
  lastDate: IsoDate | null;
  /** Slutet av lastDate (UTC) – observationstiden för det ackumulerade värdet. */
  observedAt: IsoDateTime | null;
  accumulated: number;
  change24h: number | null;
  change7d: number | null;
  missingDays: IsoDate[];
  series: ColdAmountPoint[];
  method: { id: string; description: string };
  /** SMHI:s kvalitetskoder i perioden, t.ex. { Y: 120, G: 3 }. */
  qualityCodes: Record<string, number>;
  source: DataSource;
  retrievedAt: IsoDateTime;
}

export interface ApiError {
  error: string;
}

export const isIsoDate = (s: string): s is IsoDate =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** GET /api/cold/current?stations=1,2[&asOf] */
export interface CurrentColdResponse {
  asOf: string;
  /** measurepoint → aktuell köldmängd (GD), null om data saknas. */
  values: Record<string, number | null>;
  retrievedAt: string;
}
