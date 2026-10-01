/**
 * Datamodeller för kommande datakällor. Ingen av dessa är ansluten ännu.
 *
 * Varje typ bär sin Provenance med rätt tidsvariant:
 *   ColdAmountObservation – observation  (härledd ur uppmätta stationstemperaturer)
 *   MepsObservation       – model | forecast (MEPS är en modell, inte en observation,
 *                           trots typnamnet – namnet följer projektets terminologi)
 *   SatelliteObservation  – observation
 *   WeatherObservation    – observation;  WeatherForecast – forecast
 */
import type { LakeId } from "./lake";
import type {
  DataQuality,
  ForecastTime,
  IsoDateTime,
  ModelTime,
  ObservationTime,
  Provenance,
  Quantity,
} from "./provenance";

/* ------------------------------------------------------------------ */
/* Aktuell köldmängd                                                   */
/* ------------------------------------------------------------------ */

/**
 * Aktuell köldmängd vid sjöns temperaturstation, härledd ur uppmätta
 * dygnsmedeltemperaturer. Värdet gäller stationen, inte sjön själv.
 */
export interface ColdAmountObservation {
  lakeId: LakeId;
  stationId: number;
  /** Mätstationen data kommer från (t.ex. SMHI "Örebro Flygplats"). */
  measuringStation: { id: string; name: string };
  /** Ackumulerad köldmängd för säsongen fram till observedAt. */
  accumulated: Quantity<"GD">;
  /** Från vilken tidpunkt säsongens ackumulering räknas. */
  seasonStart: IsoDateTime;
  change24h: Quantity<"GD"> | null;
  change7d: Quantity<"GD"> | null;
  /** Antal dygn i säsongen som saknar temperaturvärde (hoppas över). */
  missingDays: number;
  methodDescription: string;
  /**
   * provenance.time.observedAt = slutet av sista dygnet med data,
   * time.period = säsongsstart → observedAt.
   */
  provenance: Provenance<ObservationTime>;
}

/* ------------------------------------------------------------------ */
/* MEPS sjöismodell                                                    */
/* ------------------------------------------------------------------ */

export interface MepsValues {
  iceThickness: Quantity<"cm"> | null;
  snowOnIce: Quantity<"cm"> | null;
  surfaceTemperature: Quantity<"°C"> | null;
}

/** Ett modellsteg: analys (model) eller prognos (forecast). */
export interface MepsObservation {
  lakeId: LakeId;
  values: MepsValues;
  provenance: Provenance<ModelTime | ForecastTime>;
}

/** En MEPS-körning för en sjö: analys + prognossteg (+24, +48, +66 h …). */
export interface MepsRun {
  lakeId: LakeId;
  modelRun: IsoDateTime;
  analysis: MepsObservation | null;
  forecasts: MepsObservation[];
}

/* ------------------------------------------------------------------ */
/* Satellit (Sentinel)                                                 */
/* ------------------------------------------------------------------ */

export type SatellitePlatform =
  | "Sentinel-1A"
  | "Sentinel-1B"
  | "Sentinel-1C"
  | "Sentinel-2A"
  | "Sentinel-2B"
  | "Sentinel-2C";

export type SatelliteSensor = "SAR" | "optical";

export interface SatelliteObservation {
  lakeId: LakeId;
  platform: SatellitePlatform;
  sensor: SatelliteSensor;
  /** Andelar av sjöytan. Summan ska bli ~100. */
  icePct: number;
  waterPct: number;
  unknownPct: number;
  /** cloudCoverPct, resolutionM m.m. ligger i provenance.quality. */
  provenance: Provenance<ObservationTime> & { quality: DataQuality };
}

/* ------------------------------------------------------------------ */
/* Väder                                                               */
/* ------------------------------------------------------------------ */

export interface WeatherValues {
  temperature?: Quantity<"°C">;
  temperatureMin?: Quantity<"°C">;
  temperatureMax?: Quantity<"°C">;
  precipitation?: Quantity<"mm">;
  windSpeed?: Quantity<"m/s">;
  windGust?: Quantity<"m/s">;
  windDirection?: Quantity<"deg">;
}

/** Uppmätt väder, t.ex. senaste 24 h vid närmaste station. */
export interface WeatherObservation {
  lakeId: LakeId;
  stationId?: string;
  values: WeatherValues;
  provenance: Provenance<ObservationTime>;
}

export interface WeatherForecast {
  lakeId: LakeId;
  values: WeatherValues;
  provenance: Provenance<ForecastTime>;
}
