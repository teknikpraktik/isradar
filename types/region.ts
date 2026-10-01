import type { MultiPolygon, Polygon } from "geojson";
import type { LngLat } from "./lake";

export interface RegionDefinition {
  id: string;
  name: string;
  boundary: {
    /** "bbox_approximation" under utveckling, "official" när riktig gräns används. */
    kind: "bbox_approximation" | "official";
    note?: string;
    /**
     * SCB-länskoder som regionen består av. Om satt avgörs tillhörighet via
     * vattnets tilldelade län (se scripts/build-region-data.mts), annars via
     * punkt-i-polygon mot `geometry`.
     */
    countyCodes?: string[];
    geometry: Polygon | MultiPolygon;
  };
  view: {
    center: LngLat;
    zoom: number;
    bounds: [LngLat, LngLat];
  };
}

/** Skrivs av scripts/build-region-data.ts till manifest.json. */
export interface RegionDataManifest {
  regionId: string;
  generatedAt: string;
  boundaryKind: RegionDefinition["boundary"]["kind"];
  counts: { lakes: number; withPolygon: number; pointOnly: number };
  historicalColdAmount: {
    min: number;
    p25: number;
    median: number;
    p75: number;
    max: number;
  };
  sources: { file: string; bytes: number }[];
}
