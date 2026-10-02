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
import type { SatelliteScene } from "@/lib/satellite/api";
import type { ForecastHour } from "@/lib/weather/api";
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

/**
 * Sentinel-scener som täcker vattnet och kan visas som rasterlager (OBSERVATION:
 * rå satellitbild, ingen tolkning av is/vatten).
 */
export interface SatelliteScenes {
  /** Radar (Sentinel-1 RTC), nyast först. */
  sar: SatelliteScene[];
  /** Optiska (Sentinel-2) med molnighet ≤ clearMaxCloudPct, nyast först. */
  optical: SatelliteScene[];
  /** Senaste optiska oavsett moln, om inga klara finns. */
  opticalAny: SatelliteScene | null;
  windowDays: number;
  clearMaxCloudPct: number;
}

/* ------------------------------------------------------------------ */
/* Väder                                                               */
/* ------------------------------------------------------------------ */

/** Mätstation för en enskild vädervariabel. */
export interface WeatherStation {
  id: string;
  /** "SMHI" | "TRAFIKVERKET_VVIS" */
  source: string;
  name: string;
  /** Avstånd från vattnets centroid. */
  distanceKm: number;
}

/** Antal timmar med värde av förväntade – summor med luckor är underskattningar. */
export interface HourCoverage {
  hours: number;
  expectedHours: number;
}

/**
 * En uppmätt vädervariabel. Varje variabel bär egen station och proveniens,
 * eftersom närmaste station med t.ex. nederbördsmätning kan vara en annan än
 * för temperatur.
 */
export interface ObservedWeatherVariable<V> {
  values: V;
  /** Timserie för perioden (från stationen; luckor = saknade timmar). */
  series: { time: string; value: number }[];
  station: WeatherStation;
  coverage: HourCoverage;
  /** time.period = mätperioden (senaste 24 h), time.observedAt = senaste värdet. */
  provenance: Provenance<ObservationTime>;
}

/** Uppmätt väder senaste 24 h vid närmaste SMHI-station (per variabel). */
export interface WeatherObservation {
  lakeId: LakeId;
  temperature: ObservedWeatherVariable<{
    min: Quantity<"°C">;
    max: Quantity<"°C">;
    latest: Quantity<"°C">;
  }> | null;
  precipitation: ObservedWeatherVariable<{ sum: Quantity<"mm"> }> | null;
  wind: ObservedWeatherVariable<{
    latest: Quantity<"m/s">;
    latestDirection: Quantity<"deg"> | null;
    maxMean: Quantity<"m/s">;
    gustMax: Quantity<"m/s"> | null;
  }> & {
    /** Per timme, från samma station som vindhastigheten. */
    directionSeries: { time: string; value: number }[];
    gustSeries: { time: string; value: number }[];
  } | null;
}

/** 48 h prognos vid vattnets position: en tidslinje per timme. */
export interface WeatherForecast {
  lakeId: LakeId;
  hours: ForecastHour[];
  /**
   * BERÄKNAD NYSNÖ (cm nyfallen snö) över perioden – inte detsamma som
   * nederbörd (mm vattenekvivalent) eller MEPS "snö på is".
   */
  forecastSnowfall: { minCm: number; maxCm: number; estimated: boolean } | null;
  /** time.validAt = sista timmen, leadTimeHours = 48. */
  provenance: Provenance<ForecastTime>;
}
