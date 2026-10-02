/**
 * Kontrakt för GET /api/weather?lat=..&lon=..
 * Delas av API-routen (server) och lib/data/weather.ts (klient).
 */
import type {
  PrecipitationSummary,
  TemperatureSummary,
  WindSummary,
} from "@/lib/weather/compute";
import type { DataSource, IsoDateTime } from "@/types/provenance";
import type { ObservationSource } from "@/lib/weather/stations";
import type { PrecipitationType } from "@/lib/weather/precipitation";

export interface WeatherStationRef {
  id: string;
  name: string;
  distanceKm: number;
  source: ObservationSource;
}

/** En uppmätt variabel – varje variabel kan komma från olika station. */
export interface ObservedVariable<T> {
  station: WeatherStationRef;
  period: { from: IsoDateTime; to: IsoDateTime };
  summary: T;
  /** Timserie inom period (stationens egna tidsstämplar, inga interpolerade värden). */
  series: { time: IsoDateTime; value: number }[];
}

/** En prognostimme. Alla variabler delar samma tidsstämpel. */
export interface ForecastHour {
  /** Timmens slut (UTC). Nederbörd avser timmen före. */
  time: IsoDateTime;
  temperature: number | null;
  /** mm VATTENEKVIVALENT under timmen. */
  precipitationMm: number | null;
  /** null när ingen nederbörd faller. */
  precipitationType: PrecipitationType | null;
  windSpeed: number | null;
  /** Meteorologisk riktning: varifrån vinden blåser (grader). */
  windFromDirection: number | null;
  gust: number | null;
}

export interface WeatherApiResponse {
  position: [number, number];
  observed: {
    temperature: ObservedVariable<TemperatureSummary> | null;
    precipitation: ObservedVariable<PrecipitationSummary> | null;
    wind: (ObservedVariable<WindSummary & { gustMax: number | null }> & {
      /** Riktning (varifrån) och byvind per timme från SAMMA station som vindhastigheten. */
      directionSeries: { time: IsoDateTime; value: number }[];
      gustSeries: { time: IsoDateTime; value: number }[];
    }) | null;
  };
  forecast: {
    referenceTime: IsoDateTime;
    createdTime: IsoDateTime;
    /** Närmaste 48 timmarna, en post per timme. */
    hours: ForecastHour[];
    /** Beräknad nysnö över 48 h (cm, min–max), null om ingen. */
    snowfall48hCm: [number, number] | null;
    estimatedSnowfall: boolean;
  } | null;
  sources: { observed: DataSource; observedSecondary: DataSource; forecast: DataSource };
  /** Delar som inte kunde hämtas (övriga delar kan ändå vara giltiga). */
  errors: string[];
  retrievedAt: IsoDateTime;
}

/** Stationsavstånd över vilket inga observationer används. */
export const WEATHER_STATION_MAX_KM = 50;
