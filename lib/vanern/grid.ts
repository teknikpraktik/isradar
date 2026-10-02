/**
 * Analysgrid för Vänern: rutnät (standard 2 × 2 km) klippt mot vattenytan.
 * Ren logik utan I/O. Gridet förutsätter inte att Vänern slutar vid
 * länsgränsen – det byggs av de polygoner som ges.
 */
import type { MultiPolygon, Polygon } from "geojson";
import { clipGeometryToBox, geometryAreaKm2, geometryBox, type Box } from "../geo/clip.ts";
import { VANERN_GRID } from "./config.ts";

export interface GridMember {
  id: number;
  name: string;
  geometry: Polygon | MultiPolygon;
}

export interface VanernCell {
  /** `${medlemsid}:${i}:${j}` – stabil mellan laddningar för samma gridstorlek. */
  id: string;
  /** Vattenobjektet (objektid) cellen ligger i. */
  areaId: number;
  geometry: Polygon | MultiPolygon;
  /** Mitt i den klippta geometrins omslutande ruta [lon, lat]. */
  centroid: [number, number];
  areaKm2: number;
  /** Väderruta (se groupWeatherTiles). */
  weatherTile: string;
}

export interface GridOptions {
  cellKm?: number;
  minCellAreaKm2?: number;
  weatherTileDeg?: number;
}

/** Cellstorlek i grader för en nominell km-storlek vid referenslatituden. */
export function cellSizeDeg(cellKm: number, refLat: number): { dLon: number; dLat: number } {
  return { dLat: cellKm / 110.574, dLon: cellKm / (111.32 * Math.cos((refLat * Math.PI) / 180)) };
}

export function generateVanernGrid(members: GridMember[], opts: GridOptions = {}): VanernCell[] {
  const cellKm = opts.cellKm ?? VANERN_GRID.defaultCellKm;
  const minArea = opts.minCellAreaKm2 ?? VANERN_GRID.minCellAreaKm2;
  const tileDeg = opts.weatherTileDeg ?? VANERN_GRID.weatherTileDeg;
  const boxes = members.map((m) => geometryBox(m.geometry));
  if (boxes.length === 0) return [];
  const refLat = boxes.reduce((s, b) => s + (b[1] + b[3]) / 2, 0) / boxes.length;
  const { dLon, dLat } = cellSizeDeg(cellKm, refLat);

  const cells: VanernCell[] = [];
  members.forEach((m, k) => {
    const [w, s, e, n] = boxes[k];
    for (let j = Math.floor(s / dLat); j <= Math.floor(n / dLat); j++) {
      for (let i = Math.floor(w / dLon); i <= Math.floor(e / dLon); i++) {
        const box: Box = [i * dLon, j * dLat, (i + 1) * dLon, (j + 1) * dLat];
        const geometry = clipGeometryToBox(m.geometry, box);
        if (!geometry) continue;
        const areaKm2 = geometryAreaKm2(geometry);
        if (areaKm2 < minArea) continue;
        const [cw, cs, ce, cn] = geometryBox(geometry);
        const centroid: [number, number] = [(cw + ce) / 2, (cs + cn) / 2];
        cells.push({
          id: `${m.id}:${i}:${j}`,
          areaId: m.id,
          geometry,
          centroid,
          areaKm2,
          weatherTile: `${Math.floor(centroid[0] / tileDeg)}:${Math.floor(centroid[1] / tileDeg)}`,
        });
      }
    }
  });
  return cells;
}

export interface WeatherTile {
  id: string;
  /** Medelposition för tilens celler – väderunderlaget hämtas här. */
  lon: number;
  lat: number;
  cellIds: string[];
}

/** Grupperar celler i väderrutor så att väderdata hämtas en gång per ruta, inte per cell. */
export function groupWeatherTiles(cells: VanernCell[]): WeatherTile[] {
  const byTile = new Map<string, VanernCell[]>();
  for (const c of cells) byTile.set(c.weatherTile, [...(byTile.get(c.weatherTile) ?? []), c]);
  return [...byTile.entries()].map(([id, cs]) => ({
    id,
    lon: cs.reduce((s, c) => s + c.centroid[0], 0) / cs.length,
    lat: cs.reduce((s, c) => s + c.centroid[1], 0) / cs.length,
    cellIds: cs.map((c) => c.id),
  }));
}
