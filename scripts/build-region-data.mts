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
 * Regionfiltrering sker GEOMETRISKT: ett vatten ingår om dess centroid ligger
 * inom regionens boundary-polygon (data/regions/<id>.json). Sjönamn används
 * aldrig för att avgöra region.
 *
 * Kräver Node >= 22.18 / 24 (kör TypeScript direkt via type stripping).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { MultiPolygon, Polygon, Position } from "geojson";
import type {
  BBox,
  LakeFeature,
  LakeIndexEntry,
  LngLat,
  TemperatureStation,
} from "../types/lake";
import type { RegionDataManifest, RegionDefinition } from "../types/region";

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
  let kmMismatch = 0;

  type Prepared = { feature: LakeFeature; index: LakeIndexEntry };
  const all: Prepared[] = [];
  for (const r of waterRows) {
    const id = num(r.objektid);
    if (id === null) continue;
    const name = (r.name ?? "").trim() || `Namnlöst vatten ${id}`;
    const hca = num(r.km);
    const stationId = num(r.measurepoint);
    if (geoKmById.has(id) && geoKmById.get(id) !== hca) kmMismatch++;

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

    all.push({
      feature: {
        type: "Feature",
        id,
        geometry: geometry ?? { type: "Point", coordinates: centroid },
        properties: { id, name, hca, stationId },
      },
      index: { id, name, centroid, bbox, hca, stationId, hasPolygon: geometry !== null },
    });
  }

  console.log(`[data] ${all.length} vatten lästa, ${geomById.size} med polygon.`);
  if (kmMismatch) console.warn(`[data] VARNING: ${kmMismatch} vatten har olika km i CSV och GeoJSON (CSV används).`);

  for (const region of regions) {
    const selected = all.filter((p) => pointInGeometry(p.index.centroid, region.boundary.geometry));
    selected.sort((a, b) => a.index.name.localeCompare(b.index.name, "sv") || a.index.id - b.index.id);

    const usedStations = [...new Set(selected.map((p) => p.index.stationId))]
      .filter((id): id is number => id !== null)
      .map((id) => stations.get(id))
      .filter((s): s is TemperatureStation => !!s);

    const hcas = selected.map((p) => p.index.hca).filter((v): v is number => v !== null).sort((a, b) => a - b);
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
    const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: selected.map((p) => p.feature) };
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
