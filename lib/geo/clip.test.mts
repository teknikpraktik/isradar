import assert from "node:assert/strict";
import { test } from "node:test";
import { clipGeometryToBox, clipPolygonToBox, geometryAreaKm2, geometryBox, ringSignedArea } from "./clip.ts";

const sq = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

test("klipper en polygon som korsar rutans kant", () => {
  const out = clipPolygonToBox([sq(0, 0, 2, 2)], [1, 0, 3, 3]);
  assert.ok(out);
  assert.ok(Math.abs(Math.abs(ringSignedArea(out[0])) - 2) < 1e-9);
});

test("polygon utanför rutan försvinner", () => {
  assert.equal(clipPolygonToBox([sq(0, 0, 1, 1)], [5, 5, 6, 6]), null);
});

test("hål innanför rutan bevaras, hål utanför försvinner", () => {
  const outer = sq(0, 0, 10, 10);
  const hole = sq(2, 2, 3, 3).reverse();
  const out = clipPolygonToBox([outer, hole], [0, 0, 5, 5]);
  assert.equal(out?.length, 2);
  const none = clipPolygonToBox([outer, hole], [6, 6, 9, 9]);
  assert.equal(none?.length, 1);
});

test("MultiPolygon: delar utanför tas bort", () => {
  const g = { type: "MultiPolygon" as const, coordinates: [[sq(0, 0, 1, 1)], [sq(5, 5, 6, 6)]] };
  const out = clipGeometryToBox(g, [4, 4, 7, 7]);
  assert.equal(out?.type, "Polygon");
  assert.deepEqual(geometryBox(out!), [5, 5, 6, 6]);
});

test("geometryAreaKm2: ~1 grad² vid 59° N ≈ 6 300 km²", () => {
  const a = geometryAreaKm2({ type: "Polygon", coordinates: [sq(13, 59, 14, 60)] });
  assert.ok(a > 6000 && a < 6600, String(a));
});
