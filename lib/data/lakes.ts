/**
 * Åtkomst till sjöar.
 *
 * All sjödata går via LakeRepository. V1 läser statiska filer som genererats
 * av scripts/build-region-data.mts. En nationell version byter till en
 * implementation mot ett API (PostGIS) och vector tiles för geometrin –
 * komponenterna behöver då inte ändras.
 */
import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import { historicalColdAmountFromIndex } from "@/lib/data/cold";
import { canRenderColdDays } from "@/lib/map/coldScale";
import type {
  Lake,
  LakeFeatureProperties,
  LakeId,
  LakeIndexEntry,
  TemperatureStation,
} from "@/types/lake";
import type { RegionDataManifest } from "@/types/region";

export type LakeFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon | Point,
  LakeFeatureProperties
>;

export interface RegionLakeData {
  regionId: string;
  manifest: RegionDataManifest;
  /** Geometri för kartan. */
  features: LakeFeatureCollection;
  /** Sökindex utan geometri. */
  index: LakeIndexEntry[];
  stations: Map<number, TemperatureStation>;
}

export interface LakeRepository {
  loadRegion(regionId: string): Promise<RegionLakeData>;
}

/* ------------------------------------------------------------------ */

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kunde inte hämta ${url} (${res.status})`);
  return (await res.json()) as T;
};

export function createStaticLakeRepository(baseUrl = "/data/generated"): LakeRepository {
  const cache = new Map<string, Promise<RegionLakeData>>();

  async function load(regionId: string): Promise<RegionLakeData> {
    const dir = `${baseUrl}/${regionId}`;
    const [manifest, features, index, stations] = await Promise.all([
      fetchJson<RegionDataManifest>(`${dir}/manifest.json`),
      fetchJson<LakeFeatureCollection>(`${dir}/lakes.geojson`),
      fetchJson<LakeIndexEntry[]>(`${dir}/lakes-index.json`),
      fetchJson<TemperatureStation[]>(`${dir}/stations.json`),
    ]);
    return {
      regionId,
      manifest,
      features,
      index,
      stations: new Map(stations.map((s) => [s.id, s])),
    };
  }

  return {
    loadRegion(regionId) {
      let p = cache.get(regionId);
      if (!p) {
        p = load(regionId);
        p.catch(() => cache.delete(regionId));
        cache.set(regionId, p);
      }
      return p;
    },
  };
}

export const lakeRepository: LakeRepository = createStaticLakeRepository();

/* ------------------------------------------------------------------ */

/** Sätter ihop en fullständig Lake ur regionsdatan. */
export function buildLake(data: RegionLakeData, id: LakeId): Lake | null {
  const entry = data.index.find((l) => l.id === id);
  if (!entry) return null;
  const feature = data.features.features.find((f) => f.properties.id === id);
  const geometry =
    feature && feature.geometry.type !== "Point" ? feature.geometry : null;
  return {
    id: entry.id,
    name: entry.name,
    geometry,
    centroid: entry.centroid,
    bbox: entry.bbox,
    areaType: entry.areaType,
    parent: entry.parent,
    // Samlingsområdets värde hålls semantiskt isär från sjöspecifik GD.
    historicalColdAmount: canRenderColdDays(entry.areaType) ? historicalColdAmountFromIndex(entry) : null,
    areaHistoricalColdAmount: canRenderColdDays(entry.areaType) ? null : historicalColdAmountFromIndex(entry),
    temperatureStation:
      entry.stationId !== null ? (data.stations.get(entry.stationId) ?? null) : null,
  };
}
