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
  historicalColdAmount: HistoricalColdAmount | null;
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
  /** Historisk köldmängd i GD, null om okänd. */
  hca: number | null;
  stationId: number | null;
  hasPolygon: boolean;
}

/** Properties på features i genererad lakes.geojson. Hålls minimala. */
export interface LakeFeatureProperties {
  id: LakeId;
  name: string;
  hca: number | null;
  stationId: number | null;
}

export type LakeFeature = GeoJSON.Feature<
  Polygon | MultiPolygon | Point,
  LakeFeatureProperties
>;
