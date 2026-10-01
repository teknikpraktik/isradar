/**
 * Importerar länsgränser från SCB:s digitala gränser.
 *
 *   node scripts/import-scb-counties.mts <Lan_Sweref99TM_region.shp> [<länskod> <region-id>]
 *   node scripts/import-scb-counties.mts ./Lan_Sweref99TM_region.shp 17 varmland
 *
 * Skriver alltid data/boundaries/scb-lan.geojson (alla län, properties
 * { code, name }). Med länskod + region-id sätts dessutom regionens boundary
 * (kind "official", countyCodes, geometri) och view i data/regions/<id>.json.
 *
 * Källa: SCB, "Län, kommuner och LA-regioner, ArcView-shape"
 *   https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/digitala-granser/
 *   Licens CC0. Gränserna är förenklade (anpassade för tematiska kartor) och
 *   omfattar land – stora sjöar som Vänern ligger utanför länspolygonerna.
 *
 * Shapefilen ligger i SWEREF 99 TM (EPSG:3006) och räknas om till WGS84 med
 * Lantmäteriets Gauss–Krüger-formler. Själva SCB-filen behöver inte ligga i repot.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { MultiPolygon, Polygon, Position } from "geojson";
import type { RegionDefinition } from "../types/region";

const ROOT = resolve(import.meta.dirname, "..");
const DECIMALS = 5;

/* ------------------------------------------------------------------ */
/* SWEREF 99 TM → WGS84 (Lantmäteriet, "Gauss–Krügers formler")        */
/* ------------------------------------------------------------------ */

const A = 6378137;
const F = 1 / 298.257222101;
const LON0 = 15;
const K0 = 0.9996;
const FN = 0;
const FE = 500000;

const E2 = F * (2 - F);
const N = F / (2 - F);
const A_ROOF = (A / (1 + N)) * (1 + N ** 2 / 4 + N ** 4 / 64);
const D1 = N / 2 - (2 * N ** 2) / 3 + (37 * N ** 3) / 96 - N ** 4 / 360;
const D2 = N ** 2 / 48 + N ** 3 / 15 - (437 * N ** 4) / 1440;
const D3 = (17 * N ** 3) / 480 - (37 * N ** 4) / 840;
const D4 = (4397 * N ** 4) / 161280;
const AS = E2 + E2 ** 2 + E2 ** 3 + E2 ** 4;
const BS = -(7 * E2 ** 2 + 17 * E2 ** 3 + 30 * E2 ** 4) / 6;
const CS = (224 * E2 ** 3 + 889 * E2 ** 4) / 120;
const DS = -(4279 * E2 ** 4) / 1260;

function swerefToWgs84(easting: number, northing: number): Position {
  const xi = (northing - FN) / (K0 * A_ROOF);
  const eta = (easting - FE) / (K0 * A_ROOF);
  const xiP =
    xi -
    D1 * Math.sin(2 * xi) * Math.cosh(2 * eta) -
    D2 * Math.sin(4 * xi) * Math.cosh(4 * eta) -
    D3 * Math.sin(6 * xi) * Math.cosh(6 * eta) -
    D4 * Math.sin(8 * xi) * Math.cosh(8 * eta);
  const etaP =
    eta -
    D1 * Math.cos(2 * xi) * Math.sinh(2 * eta) -
    D2 * Math.cos(4 * xi) * Math.sinh(4 * eta) -
    D3 * Math.cos(6 * xi) * Math.sinh(6 * eta) -
    D4 * Math.cos(8 * xi) * Math.sinh(8 * eta);
  const phiStar = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
  const dLambda = Math.atan(Math.sinh(etaP) / Math.cos(xiP));
  const s2 = Math.sin(phiStar) ** 2;
  const phi =
    phiStar + Math.sin(phiStar) * Math.cos(phiStar) * (AS + BS * s2 + CS * s2 ** 2 + DS * s2 ** 3);
  const r = (v: number) => Math.round(v * 10 ** DECIMALS) / 10 ** DECIMALS;
  return [r(LON0 + (dLambda * 180) / Math.PI), r((phi * 180) / Math.PI)];
}

/* ------------------------------------------------------------------ */
/* Shapefile (.shp polygon + .dbf)                                     */
/* ------------------------------------------------------------------ */

function readDbf(path: string): Record<string, string>[] {
  const b = readFileSync(path);
  const count = b.readUInt32LE(4);
  const headerLen = b.readUInt16LE(8);
  const recordLen = b.readUInt16LE(10);
  const fields: { name: string; len: number }[] = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) {
    fields.push({ name: b.toString("latin1", o, o + 11).replace(/\0.*$/, ""), len: b[o + 16] });
  }
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < count; i++) {
    let o = headerLen + i * recordLen + 1; // första byten = raderingsflagga
    const row: Record<string, string> = {};
    for (const f of fields) {
      row[f.name] = b.toString("latin1", o, o + f.len).trim();
      o += f.len;
    }
    rows.push(row);
  }
  return rows;
}

/** Returnerar ringar (i källans koordinater) per post i .shp. */
function readShpPolygons(path: string): Position[][][] {
  const b = readFileSync(path);
  const shapeType = b.readInt32LE(32);
  if (shapeType !== 5) throw new Error(`Förväntade polygon-shapefil (5), fick ${shapeType}`);
  const records: Position[][][] = [];
  let o = 100;
  while (o < b.length) {
    const contentLen = b.readInt32BE(o + 4) * 2;
    const c = o + 8;
    const type = b.readInt32LE(c);
    const rings: Position[][] = [];
    if (type === 5) {
      const numParts = b.readInt32LE(c + 36);
      const numPoints = b.readInt32LE(c + 40);
      const parts = Array.from({ length: numParts }, (_, i) => b.readInt32LE(c + 44 + i * 4));
      const pts = c + 44 + numParts * 4;
      for (let p = 0; p < numParts; p++) {
        const end = p + 1 < numParts ? parts[p + 1] : numPoints;
        const ring: Position[] = [];
        for (let i = parts[p]; i < end; i++) {
          ring.push([b.readDoubleLE(pts + i * 16), b.readDoubleLE(pts + i * 16 + 8)]);
        }
        rings.push(ring);
      }
    }
    records.push(rings);
    o = c + contentLen;
  }
  return records;
}

/** Signerad area; i shapefiler är yttre ringar medurs (negativ area). */
const signedArea = (ring: Position[]) => {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return s / 2;
};

function pointInRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Grupperar shapefil-ringar till GeoJSON-polygoner (yttre ring + hål). */
function toGeometry(rings: Position[][]): Polygon | MultiPolygon {
  const outers: Position[][][] = [];
  const holes: Position[][] = [];
  for (const ring of rings) {
    if (signedArea(ring) < 0) outers.push([ring]);
    else holes.push(ring);
  }
  for (const hole of holes) {
    const owner = outers.find((poly) => pointInRing(hole[0], poly[0]));
    if (owner) owner.push(hole);
  }
  // GeoJSON (RFC 7946): yttre ring moturs, hål medurs.
  const polys = outers.map((poly) =>
    poly.map((ring, i) => {
      const r = ring.map(([e, n]) => swerefToWgs84(e, n));
      const ccw = signedArea(r) > 0;
      return (i === 0) === ccw ? r : r.reverse();
    }),
  );
  return polys.length === 1
    ? { type: "Polygon", coordinates: polys[0] }
    : { type: "MultiPolygon", coordinates: polys };
}

/* ------------------------------------------------------------------ */

/** Kompakt JSON: indenterad struktur men koordinatpar på en rad. */
const toJson = (v: unknown) =>
  JSON.stringify(v, null, 2).replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, "[$1, $2]") + "\n";

const SOURCE_NOTE = "Källa: SCB, digitala gränser (CC0), SWEREF 99 TM omräknad till WGS84";

function main() {
  const [shpArg, code, regionId] = process.argv.slice(2);
  if (!shpArg || (code && !regionId)) {
    console.error("Användning: node scripts/import-scb-counties.mts <fil.shp> [<länskod> <region-id>]");
    process.exit(1);
  }
  const shp = resolve(shpArg);
  const rows = readDbf(shp.replace(/\.shp$/i, ".dbf"));
  const shapes = readShpPolygons(shp);

  const counties: GeoJSON.FeatureCollection<Polygon | MultiPolygon, { code: string; name: string }> = {
    type: "FeatureCollection",
    features: rows.map((r, i) => ({
      type: "Feature",
      properties: { code: r.LnKod, name: `${r.LnNamn} län` },
      geometry: toGeometry(shapes[i]),
    })),
  };
  const boundariesFile = join(ROOT, "data", "boundaries", "scb-lan.geojson");
  mkdirSync(dirname(boundariesFile), { recursive: true });
  writeFileSync(boundariesFile, JSON.stringify(counties) + "\n");
  console.log(`[scb] ${counties.features.length} län → ${boundariesFile}`);

  if (!code) return;
  const county = counties.features.find((f) => f.properties.code === code);
  if (!county) throw new Error(`Länskod ${code} finns inte i ${shp}`);
  const { name } = county.properties;
  const geometry = county.geometry;

  const all =(geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates).flatMap((p) => p[0]);
  const lons = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const sw: [number, number] = [Math.min(...lons), Math.min(...lats)];
  const ne: [number, number] = [Math.max(...lons), Math.max(...lats)];

  const file = join(ROOT, "data", "regions", `${regionId}.json`);
  const region = JSON.parse(readFileSync(file, "utf8")) as RegionDefinition;
  region.boundary = {
    kind: "official",
    countyCodes: [code],
    note: `${name} (länskod ${code}). ${SOURCE_NOTE}. Förenklad gräns för tematiska kartor som bara omfattar land; vatten utanför alla län (t.ex. Vänern) tilldelas närmaste län av build-region-data. Importerad med scripts/import-scb-counties.mts.`,
    geometry,
  };
  region.view = {
    center: [+((sw[0] + ne[0]) / 2).toFixed(3), +((sw[1] + ne[1]) / 2).toFixed(3)],
    zoom: region.view.zoom,
    bounds: [sw, ne],
  };
  writeFileSync(file, toJson(region));
  console.log(
    `[scb] ${name} → ${file}: ${geometry.type}, ${all.length} punkter, bbox ${sw.join(",")} – ${ne.join(",")}`,
  );
}

main();
