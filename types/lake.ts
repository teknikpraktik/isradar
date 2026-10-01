import type { MultiPolygon, Point, Polygon } from "geojson";
import type {
  HistoricalReferenceTime,
  Provenance,
  Quantity,
} from "./provenance";

/**
 * Primär identifierare = Skridskonätets/Vattenkartans `objektid`.
 * Sjönamn är INTE unika (det finns t.ex. 33 "Långsjön") och får aldrig
 * användas som nyckel.
 */
export type LakeId = number;

/** [longitud, latitud] i WGS84. */
export type LngLat = [number, number];

/** [minLon, minLat, maxLon, maxLat] */
export type BBox = [number, number, number, number];

/**
 * Vilken modell som är rimlig för vattnet.
 *
 *   STANDARD_LAKE          – klassificeras med köldmängd (GD) från temperaturstation.
 *   LARGE_LAKE_OPEN_WATER  – öppen huvudbassäng i stor sjö (t.ex. Vänern). Får INGEN
 *                            GD-klass och ingen stationskoppling; ska senare bedömas med
 *                            andra indikatorer (ytvattentemperatur, vind, satellit,
 *                            isobservationer, ev. särskild stor-sjö-modell).
 *
 * Konfigureras i data/large-lakes.json.
 */
export type WaterModelType = "STANDARD_LAKE" | "LARGE_LAKE_OPEN_WATER";

/** Koppling till en stor sjö (endast för LARGE_LAKE_OPEN_WATER). */
export interface LargeLakeRef {
  /** Nyckel i data/large-lakes.json, t.ex. "vanern". */
  id: string;
  name: string;
}

export interface TemperatureStation {
  /** Skridskonätets `measurepoint`. */
  id: number;
  name: string;
  position: LngLat;
}

/**
 * Historisk köldmängd: median av tidigare säsongers köldmängd den dag vattnet
 * första gången rapporterades som åkbart (Skridskonätets empiriska modell).
 *
 * Detta är en HISTORISK REFERENS – inte en säkerhetsgräns och inte en
 * beskrivning av nuläget.
 */
export interface HistoricalColdAmount {
  amount: Quantity<"GD">;
  provenance: Provenance<HistoricalReferenceTime>;
}

export interface Lake {
  id: LakeId;
  name: string;
  /** null för de få vatten som bara finns som punkt i källdatan. */
  geometry: Polygon | MultiPolygon | null;
  /** Areaviktad centroid (eller källans punkt om geometri saknas). */
  centroid: LngLat;
  bbox: BBox;
  modelType: WaterModelType;
  /** Satt för delar av stora sjöar (LARGE_LAKE_OPEN_WATER). */
  largeLake: LargeLakeRef | null;
  /** null = värde saknas. Alltid null för LARGE_LAKE_OPEN_WATER (ej klassificerad). */
  historicalColdAmount: HistoricalColdAmount | null;
  /** Alltid null för LARGE_LAKE_OPEN_WATER – ingen fallback till närmaste station. */
  temperatureStation: TemperatureStation | null;
}

/**
 * Lättviktig post för sökning och listor (utan geometri). Samma form kan
 * senare levereras av ett sök-API i en nationell version.
 */
export interface LakeIndexEntry {
  id: LakeId;
  name: string;
  centroid: LngLat;
  bbox: BBox;
  /** Historisk köldmängd i GD. null = saknas ELLER ej klassificerad (se modelType). */
  hca: number | null;
  stationId: number | null;
  hasPolygon: boolean;
  /** SCB-länskod, t.ex. "17". null om inget län kunde tilldelas. */
  countyCode: string | null;
  modelType: WaterModelType;
  largeLake: LargeLakeRef | null;
}

/** Properties på features i genererad lakes.geojson. Hålls minimala. */
export interface LakeFeatureProperties {
  id: LakeId;
  name: string;
  hca: number | null;
  stationId: number | null;
  modelType: WaterModelType;
}

export type LakeFeature = GeoJSON.Feature<
  Polygon | MultiPolygon | Point,
  LakeFeatureProperties
>;
