/**
 * Kontrakt för GET /api/weather?lat=..&lon=..
 * Delas av API-routen (server) och lib/data/weather.ts (klient).
 */
import type {
  Coverage,
  PrecipitationSummary,
  TemperatureSummary,
  WindSummary,
} from "@/lib/weather/compute";
import type { DataSource, IsoDateTime } from "@/types/provenance";

export interface WeatherStationRef {
  id: string;
  name: string;
  distanceKm: number;
}

/** En uppmätt variabel – varje variabel kan komma från olika station. */
export interface ObservedVariable<T> {
  station: WeatherStationRef;
  period: { from: IsoDateTime; to: IsoDateTime };
  summary: T;
}

export interface ForecastWindow {
  /** Timmar från "nu" (from exklusiv, to inklusiv). */
  fromH: number;
  toH: number;
  from: IsoDateTime;
  to: IsoDateTime;
  temperatureMin: number | null;
  temperatureMax: number | null;
  /** Summa medelnederbörd (mm). */
  precipitation: number | null;
  /** Högsta sannolikhet för fryst nederbörd (0–100 %). */
  frozenPrecipitationProbabilityMax: number | null;
  windMax: number | null;
  gustMax: number | null;
  coverage: Coverage;
}

export interface WeatherApiResponse {
  position: [number, number];
  observed: {
    temperature: ObservedVariable<TemperatureSummary> | null;
    precipitation: ObservedVariable<PrecipitationSummary> | null;
    wind: ObservedVariable<WindSummary & { gustMax: number | null }> | null;
  };
  forecast: {
    referenceTime: IsoDateTime;
    createdTime: IsoDateTime;
    windows: ForecastWindow[];
  } | null;
  sources: { observed: DataSource; forecast: DataSource };
  /** Delar som inte kunde hämtas (övriga delar kan ändå vara giltiga). */
  errors: string[];
  retrievedAt: IsoDateTime;
}

/** Stationsavstånd över vilket inga observationer används. */
export const WEATHER_STATION_MAX_KM = 50;
