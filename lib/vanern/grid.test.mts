import assert from "node:assert/strict";
import { test } from "node:test";
import { geometryAreaKm2 } from "../geo/clip.ts";
import { cellSizeDeg, generateVanernGrid, groupWeatherTiles } from "./grid.ts";

const sq = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
// ~ 20 × 10 km vid 59° N
const lake = { id: 1, name: "Testvik", geometry: { type: "Polygon" as const, coordinates: [sq(13.0, 59.2, 13.35, 59.29)] } };

test("cellSizeDeg: 2 km ≈ 0,018° lat", () => {
  const { dLat, dLon } = cellSizeDeg(2, 59.25);
  assert.ok(Math.abs(dLat - 0.01809) < 1e-4);
  assert.ok(dLon > dLat);
});

test("gridet täcker vattenytan: summan av cellarealer ≈ polygonens area", () => {
  const cells = generateVanernGrid([lake], { minCellAreaKm2: 0 });
  const total = cells.reduce((s, c) => s + c.areaKm2, 0);
  assert.ok(Math.abs(total - geometryAreaKm2(lake.geometry)) / total < 0.01);
  assert.ok(cells.length >= 40 && cells.length <= 80, `celler: ${cells.length}`);
  assert.ok(new Set(cells.map((c) => c.id)).size === cells.length);
});

test("finare grid ger fler celler", () => {
  const a = generateVanernGrid([lake], { cellKm: 2 }).length;
  const b = generateVanernGrid([lake], { cellKm: 1 }).length;
  assert.ok(b > a * 3);
});

test("minimal cellarea filtrerar bort småflisor", () => {
  const all = generateVanernGrid([lake], { minCellAreaKm2: 0 }).length;
  const filtered = generateVanernGrid([lake], { minCellAreaKm2: 3.9 }).length;
  assert.ok(filtered < all);
});

test("väderrutor: varje cell hör till exakt en ruta", () => {
  const cells = generateVanernGrid([lake]);
  const tiles = groupWeatherTiles(cells);
  assert.equal(tiles.reduce((s, t) => s + t.cellIds.length, 0), cells.length);
  assert.ok(tiles.length < cells.length);
});
