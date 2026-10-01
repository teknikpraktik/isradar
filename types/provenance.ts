/**
 * Proveniens, tid och kvalitet för all data i ISRADAR.
 *
 * Central princip: varje värde som visas måste bära VILKEN SORTS uppgift det
 * är. En observation, en modellanalys, en prognos och en historisk referens
 * får aldrig kunna förväxlas – varken i koden eller i gränssnittet.
 *
 *   observation           – något som faktiskt uppmätts/observerats (satellitbild,
 *                           stationstemperatur, uppmätt nederbörd)
 *   model                 – modellens skattning av ett NU- eller dåtida tillstånd
 *                           (t.ex. MEPS analys av istjocklek)
 *   forecast              – modellens skattning av ett FRAMTIDA tillstånd
 *   historical_reference  – statistik ur tidigare säsonger (t.ex. historisk
 *                           köldmängd). Beskriver inte nuläget.
 */

/** ISO 8601-tidsstämpel i UTC, t.ex. "2026-01-14T06:00:00Z". */
export type IsoDateTime = string;

export type DataKind =
  | "observation"
  | "model"
  | "forecast"
  | "historical_reference";

export interface DataSource {
  /** Stabil intern nyckel, t.ex. "skridskonatet", "met-meps", "sentinel-2". */
  id: string;
  /** Visningsnamn. */
  name: string;
  url?: string;
  license?: string;
}

/* ------------------------------------------------------------------ */
/* Tid – en variant per datakategori                                    */
/* ------------------------------------------------------------------ */

export interface ObservationTime {
  kind: "observation";
  /** När observationen gjordes (t.ex. satellitens passage). */
  observedAt: IsoDateTime;
  /** Om observationen avser ett intervall (t.ex. nederbörd senaste 24 h). */
  period?: { from: IsoDateTime; to: IsoDateTime };
}

export interface ModelTime {
  kind: "model";
  /** Modellkörningens referenstid (analystid), t.ex. MEPS 06Z. */
  modelRun: IsoDateTime;
  /** Tidpunkt modellvärdet gäller för. */
  validAt: IsoDateTime;
}

export interface ForecastTime {
  kind: "forecast";
  modelRun: IsoDateTime;
  validAt: IsoDateTime;
  /** validAt − modelRun i timmar, t.ex. 24, 48, 66. */
  leadTimeHours: number;
}

export interface HistoricalReferenceTime {
  kind: "historical_reference";
  /** Vilka säsonger referensen bygger på, om känt. Gissa inte. */
  seasons?: { from: string; to: string };
  /** Kort metodbeskrivning, t.ex. "median vid första rapporterade åkning". */
  method: string;
}

export type DataTime =
  | ObservationTime
  | ModelTime
  | ForecastTime
  | HistoricalReferenceTime;

/* ------------------------------------------------------------------ */
/* Kvalitet                                                            */
/* ------------------------------------------------------------------ */

export type QualityFlag = "good" | "degraded" | "poor" | "unknown";

/**
 * Kvalitetsmetadata. Alla fält är valfria: fyll ENDAST i det källan faktiskt
 * levererar – gissa aldrig.
 */
export interface DataQuality {
  flag?: QualityFlag;
  /** Rumslig upplösning i meter. */
  resolutionM?: number;
  /** Molntäckning i procent (optiska satelliter). */
  cloudCoverPct?: number;
  /** Andel av ytan som inte kunnat klassas, procent. */
  unknownPct?: number;
  /** Fri text från källan eller pipeline. */
  notes?: string[];
}

/* ------------------------------------------------------------------ */
/* Proveniens                                                          */
/* ------------------------------------------------------------------ */

export interface Provenance<T extends DataTime = DataTime> {
  source: DataSource;
  time: T;
  /** När ISRADAR hämtade/beräknade värdet. Används för dataålder. */
  retrievedAt?: IsoDateTime;
  quality?: DataQuality;
}

/** Ett värde med enhet. */
export interface Quantity<U extends Unit = Unit> {
  value: number;
  unit: U;
}

export type Unit = "GD" | "cm" | "°C" | "mm" | "m/s" | "%" | "deg" | "h";

/* ------------------------------------------------------------------ */
/* Resultat från en datakälla                                          */
/* ------------------------------------------------------------------ */

/**
 * Alla datakällor returnerar en DataResult så att UI:t alltid kan skilja på
 * "källan är inte ansluten än", "källan svarade inte/saknar värde" och
 * faktiska värden.
 */
export type DataResult<T> =
  | { status: "not_connected"; source: DataSource }
  | {
      status: "unavailable";
      source: DataSource;
      reason: string;
      /** no_data_yet = källan svarar men har inga värden ännu (t.ex. säsongsstart).
       *  not_historical = källan har bara aktuella värden och kan inte visa ett tidigare datum. */
      code?: "no_data_yet" | "error" | "not_historical";
    }
  /**
   * Medvetet modellval: datakällan används inte för detta vatten (t.ex. GD för
   * Vänerns öppna vatten). Inte samma sak som saknad data eller värdet 0.
   */
  | { status: "not_applicable"; reason: string }
  | { status: "ok"; value: T };
