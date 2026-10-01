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
 * Vilken sorts vattenobjekt polygonen representerar. Styr bl.a. om GD får
 * färgsättas (se canRenderColdDays i lib/map/coldScale.ts) och kan senare
 * användas av satellit-, modell- och observationslager.
 *
 *   WATER           – faktisk sjö eller tydligt avgränsat vattenobjekt.
 *   SUBAREA         – avgränsad del av ett större vatten (ligger inuti ett annat
 *                     objekt) med eget historikvärde. GD-färgsätts.
 *   COLLECTION_AREA – samlingsområde med flera olika vattenmiljöer. GD-färgsätts
 *                     INTE; ev. historiskt värde visas som områdeshistorik.
 *
 * COLLECTION_AREA anges manuellt i data/area-types.json. SUBAREA härleds ur
 * geometrin vid bygget. Storlek används inte som kriterium.
 */
export type AreaType = "WATER" | "SUBAREA" | "COLLECTION_AREA";

/** Omslutande vattenobjekt för en SUBAREA. */
export interface ParentAreaRef {
  id: LakeId;
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
  areaType: AreaType;
  /** Omslutande objekt (SUBAREA). */
  parent: ParentAreaRef | null;
  /**
   * Sjöspecifik historisk köldmängd. null = saknas, eller COLLECTION_AREA
   * (då ligger värdet i areaHistoricalColdAmount).
   */
  historicalColdAmount: HistoricalColdAmount | null;
  /**
   * Endast COLLECTION_AREA: källans historiska värde för hela området. Behålls
   * för analys/kalibrering men används aldrig för färgsättning.
   */
  areaHistoricalColdAmount: HistoricalColdAmount | null;
  temperatureStation: TemperatureStation | null;
  /** MEPS-gitterrutor [y, x] för vattnet. */
  mepsCells: [number, number][];
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
  /** Källans historiska köldmängd i GD (för alla areaType). null = saknas. */
  hca: number | null;
  stationId: number | null;
  hasPolygon: boolean;
  /** SCB-länskod, t.ex. "17". null om inget län kunde tilldelas. */
  countyCode: string | null;
  areaType: AreaType;
  parent: ParentAreaRef | null;
  /** MEPS-gitterrutor [y, x] vars mittpunkt ligger i vattnet (max 25), annars närmaste ruta. */
  mepsCells: [number, number][];
}

/** Properties på features i genererad lakes.geojson. Hålls minimala. */
export interface LakeFeatureProperties {
  id: LakeId;
  name: string;
  hca: number | null;
  stationId: number | null;
  areaType: AreaType;
}

export type LakeFeature = GeoJSON.Feature<
  Polygon | MultiPolygon | Point,
  LakeFeatureProperties
>;
