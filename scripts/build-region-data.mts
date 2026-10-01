/**
 * Bygger regionsdataset för ISRADAR ur Skridskonätet-researchdatan.
 *
 *   node scripts/build-region-data.mts            # alla regioner i data/regions/
 *   node scripts/build-region-data.mts varmland   # en region
 *
 * Läser (ändras ALDRIG):
 *   isradar_koldmangd/waters.csv
 *   isradar_koldmangd/waters_unique.geojson
 *   isradar_koldmangd/stations.csv
 *
 * Skriver:
 *   public/data/generated/<region>/lakes.geojson     geometri + minimala props
 *   public/data/generated/<region>/lakes-index.json  sökindex utan geometri
 *   public/data/generated/<region>/stations.json
 *   public/data/generated/<region>/manifest.json
 *
 * Regionfiltrering sker GEOMETRISKT (data/regions/<id>.json):
 *  - med boundary.countyCodes: varje vatten tilldelas ett län ur
 *    data/boundaries/scb-lan.geojson – länet som innehåller centroiden, annars
 *    närmaste län inom 20 km (SCB:s länspolygoner omfattar bara land, så
 *    t.ex. Vänerns delar hamnar hos närmaste strandlän);
 *  - annars: centroiden ska ligga inom boundary.geometry.
 * Sjönamn används
 * aldrig för att avgöra region.
 *
 * Kräver Node >= 22.18 / 24 (kör TypeScript direkt via type stripping).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon, Position } from "geojson";
import type {
  BBox,
  LakeFeature,
  LakeIndexEntry,
  LngLat,
  TemperatureStation,
} from "../types/lake";
import type { RegionDataManifest, RegionDefinition } from "../types/region";
import { cellCenter, nearestCell, type MepsCell } from "../lib/meps/grid.ts";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE_DIR = resolve(ROOT, process.env.ISRADAR_SOURCE_DIR ?? "isradar_koldmangd");
const REGIONS_DIR = join(ROOT, "data", "regions");
const OUT_ROOT = join(ROOT, "public", "data", "generated");

/** 5 decimaler ≈ 1 m. Räcker för visning och halverar filstorleken. */
const COORD_DECIMALS = 5;

/* ------------------------------------------------------------------ */
/* CSV (RFC 4180 – källan har citerade fält med kommatecken)           */
/* ------------------------------------------------------------------ */

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.replace(/^﻿/, ""), r[i] ?? ""])));
}

const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === "" || s === "None") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------------ */
/* Geometri                                                            */
/* ------------------------------------------------------------------ */

type Rings = Position[][];

const polygonsOf = (g: Polygon | MultiPolygon): Rings[] =>
  g.type === "Polygon" ? [g.coordinates] : g.coordinates;

const round = (v: number) => Math.round(v * 10 ** COORD_DECIMALS) / 10 ** COORD_DECIMALS;

function roundRing(ring: Position[]): Position[] | null {
  const out: Position[] = [];
  for (const [x, y] of ring) {
    const p = [round(x), round(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && (first[0] !== last[0] || first[1] !== last[1])) out.push([...first]);
  return out.length >= 4 ? out : null;
}

function roundGeometry(g: Polygon | MultiPolygon): Polygon | MultiPolygon | null {
  const polys: Rings[] = [];
  for (const rings of polygonsOf(g)) {
    const outer = roundRing(rings[0]);
    if (!outer) continue;
    const holes = rings.slice(1).map(roundRing).filter((r): r is Position[] => r !== null);
    polys.push([outer, ...holes]);
  }
  if (polys.length === 0) return null;
  return polys.length === 1
    ? { type: "Polygon", coordinates: polys[0] }
    : { type: "MultiPolygon", coordinates: polys };
}

/** Signerad area (shoelace) och centroid för en ring, i grad-enheter. */
function ringAreaCentroid(ring: Position[]): { a: number; cx: number; cy: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  a /= 2;
  return a === 0 ? { a: 0, cx: ring[0][0], cy: ring[0][1] } : { a, cx: cx / (6 * a), cy: cy / (6 * a) };
}

/** Areaviktad centroid över alla polygoner (hål dras av). */
function centroidOf(g: Polygon | MultiPolygon): LngLat {
  let A = 0;
  let X = 0;
  let Y = 0;
  for (const rings of polygonsOf(g)) {
    rings.forEach((ring, idx) => {
      const { a, cx, cy } = ringAreaCentroid(ring);
      const w = idx === 0 ? Math.abs(a) : -Math.abs(a);
      A += w;
      X += cx * w;
      Y += cy * w;
    });
  }
  if (A === 0) {
    const [x, y] = polygonsOf(g)[0][0][0];
    return [x, y];
  }
  return [round(X / A), round(Y / A)];
}

function bboxOf(g: Polygon | MultiPolygon): BBox {
  let b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const rings of polygonsOf(g))
    for (const [x, y] of rings[0]) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b;
}

function pointInRing([x, y]: LngLat, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInGeometry(p: LngLat, g: Polygon | MultiPolygon): boolean {
  return polygonsOf(g).some(
    (rings) => pointInRing(p, rings[0]) && !rings.slice(1).some((hole) => pointInRing(p, hole)),
  );
}

/** Avstånd i km från punkt till geometrins ringar (lokal plan approximation). */
function distanceToGeometryKm([px, py]: LngLat, g: Polygon | MultiPolygon): number {
  const kx = 111.32 * Math.cos((py * Math.PI) / 180);
  const ky = 110.57;
  let best = Infinity;
  for (const rings of polygonsOf(g))
    for (const ring of rings)
      for (let i = 0; i < ring.length - 1; i++) {
        const ax = (ring[i][0] - px) * kx;
        const ay = (ring[i][1] - py) * ky;
        const bx = (ring[i + 1][0] - px) * kx;
        const by = (ring[i + 1][1] - py) * ky;
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
        best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
      }
  return best;
}

/* ------------------------------------------------------------------ */
/* Län                                                                 */
/* ------------------------------------------------------------------ */

type County = { code: string; name: string; geometry: Polygon | MultiPolygon; bbox: BBox };

/** Vatten utanför alla länspolygoner (Vänern, kust) tilldelas närmaste län inom denna gräns. */
const NEAREST_COUNTY_MAX_KM = 20;

function loadCounties(): County[] {
  const file = join(ROOT, "data", "boundaries", "scb-lan.geojson");
  if (!existsSync(file)) return [];
  const fc = JSON.parse(readFileSync(file, "utf8")) as GeoJSON.FeatureCollection<
    Polygon | MultiPolygon,
    { code: string; name: string }
  >;
  return fc.features.map((f) => ({ ...f.properties, geometry: f.geometry, bbox: bboxOf(f.geometry) }));
}

/**
 * Län för en punkt: det län vars polygon innehåller punkten, annars närmaste
 * län inom NEAREST_COUNTY_MAX_KM. SCB:s länspolygoner omfattar bara land, så
 * t.ex. Vänerns delar fördelas på närmaste strandlän.
 */
function assignCounty(p: LngLat, counties: County[]): { code: string; nearest: boolean } | null {
  const [x, y] = p;
  for (const c of counties) {
    const [x0, y0, x1, y1] = c.bbox;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && pointInGeometry(p, c.geometry)) {
      return { code: c.code, nearest: false };
    }
  }
  let best: County | null = null;
  let bestKm = Infinity;
  for (const c of counties) {
    const d = distanceToGeometryKm(p, c.geometry);
    if (d < bestKm) {
      bestKm = d;
      best = c;
    }
  }
  return best && bestKm <= NEAREST_COUNTY_MAX_KM ? { code: best.code, nearest: true } : null;
}

/* ------------------------------------------------------------------ */
/* Objekttyp (data/area-types.json)                                     */
/* ------------------------------------------------------------------ */

type Prepared = { feature: LakeFeature; index: LakeIndexEntry; areaKm2: number };

function loadCollectionAreaIds(): Set<number> {
  const file = join(ROOT, "data", "area-types.json");
  if (!existsSync(file)) return new Set();
  return new Set((JSON.parse(readFileSync(file, "utf8")) as { collectionAreaIds: number[] }).collectionAreaIds);
}

/** Ungefärlig area i km² (plan approximation, räcker för jämförelser). */
function areaKm2(g: Polygon | MultiPolygon): number {
  let total = 0;
  for (const rings of polygonsOf(g))
    rings.forEach((ring, i) => {
      const a = Math.abs(ringAreaCentroid(ring).a) * 111.32 * Math.cos((ring[0][1] * Math.PI) / 180) * 110.57;
      total += i === 0 ? a : -a;
    });
  return total;
}

/**
 * Sätter areaType och parent:
 *  - COLLECTION_AREA: enligt data/area-types.json (manuellt).
 *  - SUBAREA: centroiden ligger inuti ett annat objekts källgeometri (hål
 *    räknas inte). Förälder = minsta omslutande objekt.
 *  - WATER: övriga.
 * Körs på okklippta källgeometrier, innan samlingsområden klipps.
 */
function assignAreaTypes(all: Prepared[], collectionIds: Set<number>) {
  const polys = all.filter((p) => p.feature.geometry.type !== "Point");
  for (const p of all) {
    if (collectionIds.has(p.index.id)) {
      p.index.areaType = "COLLECTION_AREA";
      continue;
    }
    const [x, y] = p.index.centroid;
    let parent: Prepared | null = null;
    for (const o of polys) {
      if (o === p || o.areaKm2 <= p.areaKm2) continue;
      const [x0, y0, x1, y1] = o.index.bbox;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (!pointInGeometry(p.index.centroid, o.feature.geometry as Polygon | MultiPolygon)) continue;
      if (!parent || o.areaKm2 < parent.areaKm2) parent = o;
    }
    if (parent) {
      p.index.areaType = "SUBAREA";
      p.index.parent = { id: parent.index.id, name: parent.index.name };
    }
  }
  for (const p of all) p.feature.properties.areaType = p.index.areaType;
}

/**
 * Samlingsområden (t.ex. "Norra Vänern") omsluter vikar och skärgårdar som
 * finns som egna vattenobjekt. Vi klipper bort alla sådana överlappande vatten,
 * så att den neutrala samlingsytan inte ritas över delvattnen.
 */
function clipCollectionAreas(all: Prepared[]) {
  const overlaps = (a: BBox, b: BBox) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  for (const area of all) {
    if (area.index.areaType !== "COLLECTION_AREA") continue;
    const g = area.feature.geometry;
    if (g.type === "Point") continue;
    const others = all.filter(
      (o) =>
        o !== area &&
        // även mindre samlingsområden inuti (t.ex. Värmlandsskärgården i Norra Vänern)
        (o.index.areaType !== "COLLECTION_AREA" || o.areaKm2 < area.areaKm2) &&
        o.feature.geometry.type !== "Point" &&
        overlaps(area.index.bbox, o.index.bbox),
    );
    const clip = others.map((o) => (o.feature.geometry as Polygon | MultiPolygon).coordinates) as polygonClipping.Geom[];
    const result = polygonClipping.difference(g.coordinates as polygonClipping.Geom, ...clip);
    if (result.length === 0) {
      console.warn(`[data] ${area.index.name}: ingen yta kvar efter klippning`);
      continue;
    }
    const clipped: Polygon | MultiPolygon =
      result.length === 1 ? { type: "Polygon", coordinates: result[0] } : { type: "MultiPolygon", coordinates: result };
    const rounded = roundGeometry(clipped) ?? clipped;
    area.feature.geometry = rounded;
    area.index.bbox = bboxOf(rounded);
  }
}

/* ------------------------------------------------------------------ */
/* MEPS-gitterrutor                                                    */
/* ------------------------------------------------------------------ */

const MAX_MEPS_CELLS = 25;

/**
 * Rutor i MEPS 2,5 km-gittret vars mittpunkt ligger i vattnets (slutliga)
 * geometri. Små vatten utan någon rutmittpunkt får närmaste ruta. Stora vatten
 * samplas jämnt till högst MAX_MEPS_CELLS.
 */
function assignMepsCells(all: Prepared[]) {
  for (const p of all) {
    const g = p.feature.geometry;
    const [x0, y0, x1, y1] = p.index.bbox;
    const cells: MepsCell[] = [];
    if (g.type !== "Point") {
      const corners = [nearestCell(x0, y0), nearestCell(x1, y0), nearestCell(x0, y1), nearestCell(x1, y1)].filter(
        (c): c is MepsCell => c !== null,
      );
      if (corners.length) {
        const js = corners.map((c) => c[0]);
        const is = corners.map((c) => c[1]);
        for (let j = Math.min(...js) - 1; j <= Math.max(...js) + 1; j++)
          for (let i = Math.min(...is) - 1; i <= Math.max(...is) + 1; i++) {
            const c = cellCenter([j, i]) as LngLat;
            if (pointInGeometry(c, g)) cells.push([j, i]);
          }
      }
    }
    if (cells.length === 0) {
      const c = nearestCell(p.index.centroid[0], p.index.centroid[1]);
      if (c) cells.push(c);
    }
    const step = cells.length / MAX_MEPS_CELLS;
    p.index.mepsCells = step > 1 ? Array.from({ length: MAX_MEPS_CELLS }, (_, k) => cells[Math.floor(k * step)]) : cells;
  }
}

/* ------------------------------------------------------------------ */
/* Huvudflöde                                                          */
/* ------------------------------------------------------------------ */

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function loadRegions(only?: string): RegionDefinition[] {
  return readdirSync(REGIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(REGIONS_DIR, f), "utf8")) as RegionDefinition)
    .filter((r) => !only || r.id === only);
}

function main() {
  const onlyRegion = process.argv[2];
  const regions = loadRegions(onlyRegion);
  if (regions.length === 0) throw new Error(`Ingen region hittades${onlyRegion ? `: ${onlyRegion}` : ""}`);

  const sourceFiles = ["waters.csv", "waters_unique.geojson", "stations.csv"].map((f) => join(SOURCE_DIR, f));
  const missing = sourceFiles.filter((f) => !existsSync(f));
  if (missing.length) {
    const haveOutput = regions.every((r) => existsSync(join(OUT_ROOT, r.id, "manifest.json")));
    if (haveOutput) {
      console.warn(`[data] Källdata saknas (${missing.join(", ")}) – använder befintliga genererade filer.`);
      return;
    }
    throw new Error(
      `Källdata saknas: ${missing.join(", ")}\nLägg researchdatan i ${SOURCE_DIR} eller sätt ISRADAR_SOURCE_DIR.`,
    );
  }

  const [watersCsv, watersGeo, stationsCsv] = sourceFiles;

  const stations = new Map<number, TemperatureStation>();
  for (const r of parseCsv(readFileSync(stationsCsv, "utf8"))) {
    const id = num(r.measurepoint);
    const lat = num(r.lat);
    const lon = num(r.lon);
    if (id === null || lat === null || lon === null) continue;
    stations.set(id, { id, name: r.name, position: [lon, lat] });
  }

  const geomById = new Map<number, Polygon | MultiPolygon>();
  const geoKmById = new Map<number, number | null>();
  const fc = JSON.parse(readFileSync(watersGeo, "utf8")) as GeoJSON.FeatureCollection;
  for (const f of fc.features) {
    const id = num(String(f.properties?.objektid));
    if (id === null || !f.geometry) continue;
    if (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") {
      geomById.set(id, f.geometry);
      geoKmById.set(id, num(String(f.properties?.km)));
    }
  }

  const waterRows = parseCsv(readFileSync(watersCsv, "utf8"));
  const counties = loadCounties();
  let kmMismatch = 0;
  let nearestAssigned = 0;
  let noCounty = 0;

  const all: Prepared[] = [];
  for (const r of waterRows) {
    const id = num(r.objektid);
    if (id === null) continue;
    const name = (r.name ?? "").trim() || `Namnlöst vatten ${id}`;
    // Källans värden behålls för alla objekt – även samlingsområden (där de
    // används som områdeshistorik men aldrig för färgsättning).
    const hca = num(r.km);
    const stationId = num(r.measurepoint);
    if (geoKmById.has(id) && geoKmById.get(id) !== num(r.km)) kmMismatch++;

    const raw = geomById.get(id);
    const geometry = raw ? roundGeometry(raw) : null;
    let centroid: LngLat;
    let bbox: BBox;
    if (geometry) {
      centroid = centroidOf(geometry);
      bbox = bboxOf(geometry);
    } else {
      const lon = num(r.point_lon);
      const lat = num(r.point_lat);
      if (lon === null || lat === null) continue;
      centroid = [round(lon), round(lat)];
      bbox = [centroid[0], centroid[1], centroid[0], centroid[1]];
    }

    const county = counties.length ? assignCounty(centroid, counties) : null;
    if (county?.nearest) nearestAssigned++;
    if (counties.length && !county) noCounty++;

    all.push({
      feature: {
        type: "Feature",
        id,
        geometry: geometry ?? { type: "Point", coordinates: centroid },
        properties: { id, name, hca, stationId, areaType: "WATER" },
      },
      index: {
        id,
        name,
        centroid,
        bbox,
        hca,
        stationId,
        hasPolygon: geometry !== null,
        countyCode: county?.code ?? null,
        areaType: "WATER",
        parent: null,
        mepsCells: [],
      },
      areaKm2: geometry ? areaKm2(geometry) : 0,
    });
  }

  assignAreaTypes(all, loadCollectionAreaIds());
  clipCollectionAreas(all);
  assignMepsCells(all);

  console.log(`[data] ${all.length} vatten lästa, ${geomById.size} med polygon.`);
  if (kmMismatch) console.warn(`[data] VARNING: ${kmMismatch} vatten har olika km i CSV och GeoJSON (CSV används).`);
  if (counties.length) {
    console.log(
      `[data] Län: ${counties.length} läst, ${nearestAssigned} vatten tilldelade närmaste län, ${noCounty} utan län.`,
    );
  }

  for (const region of regions) {
    const codes = region.boundary.countyCodes;
    if (codes && !counties.length) {
      throw new Error(`Region ${region.id} anger countyCodes men data/boundaries/scb-lan.geojson saknas.`);
    }
    const selected = codes
      ? all.filter((p) => p.index.countyCode !== null && codes.includes(p.index.countyCode))
      : all.filter((p) => pointInGeometry(p.index.centroid, region.boundary.geometry));
    selected.sort((a, b) => a.index.name.localeCompare(b.index.name, "sv") || a.index.id - b.index.id);

    const usedStations = [...new Set(selected.map((p) => p.index.stationId))]
      .filter((id): id is number => id !== null)
      .map((id) => stations.get(id))
      .filter((s): s is TemperatureStation => !!s);

    const typeCounts = Object.entries(
      selected.reduce<Record<string, number>>((m, p) => ((m[p.index.areaType] = (m[p.index.areaType] ?? 0) + 1), m), {}),
    )
      .map(([k, n]) => `${k} ${n}`)
      .join(", ");
    console.log(`[data] ${region.id}: ${typeCounts}`);
    // Fördelningen avser bara GD-färgsatta objekt.
    const hcas = selected
      .filter((p) => p.index.areaType !== "COLLECTION_AREA")
      .map((p) => p.index.hca).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const withPolygon = selected.filter((p) => p.index.hasPolygon).length;
    const manifest: RegionDataManifest = {
      regionId: region.id,
      generatedAt: new Date().toISOString(),
      boundaryKind: region.boundary.kind,
      counts: { lakes: selected.length, withPolygon, pointOnly: selected.length - withPolygon },
      historicalColdAmount: {
        min: hcas[0],
        p25: quantile(hcas, 0.25),
        median: quantile(hcas, 0.5),
        p75: quantile(hcas, 0.75),
        max: hcas[hcas.length - 1],
      },
      sources: sourceFiles.map((f) => ({ file: f.slice(ROOT.length + 1).replaceAll("\\", "/"), bytes: statSync(f).size })),
    };

    const outDir = join(OUT_ROOT, region.id);
    mkdirSync(outDir, { recursive: true });
    // Ritordning: största objekt först, så att delområden alltid ritas ovanpå
    // sitt omslutande vatten (indexet ovan är alfabetiskt).
    const drawOrder = [...selected].sort((a, b) => b.areaKm2 - a.areaKm2);
    const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: drawOrder.map((p) => p.feature) };
    writeFileSync(join(outDir, "lakes.geojson"), JSON.stringify(geojson));
    writeFileSync(join(outDir, "lakes-index.json"), JSON.stringify(selected.map((p) => p.index)));
    writeFileSync(join(outDir, "stations.json"), JSON.stringify(usedStations, null, 2));
    writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const sizeKb = Math.round(statSync(join(outDir, "lakes.geojson")).size / 1024);
    console.log(
      `[data] ${region.id}: ${selected.length} vatten (${withPolygon} polygon, ${selected.length - withPolygon} punkt), ` +
        `${usedStations.length} stationer, lakes.geojson ${sizeKb} kB`,
    );
    const h = manifest.historicalColdAmount;
    console.log(
      `[data] ${region.id}: historisk köldmängd GD min ${h.min} p25 ${h.p25} median ${h.median} p75 ${h.p75} max ${h.max}`,
    );
  }
}

main();
