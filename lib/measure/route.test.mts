import assert from "node:assert/strict";
import { test } from "node:test";
import { cumulativeM, distanceM, formatLength, routeLengthM } from "./route.ts";

test("distanceM: 1 breddgrad ≈ 111,2 km", () => {
  assert.ok(Math.abs(distanceM([13, 59], [13, 60]) - 111_195) < 200);
  assert.equal(distanceM([13, 59], [13, 59]), 0);
});

test("routeLengthM och cumulativeM", () => {
  const pts: [number, number][] = [[13, 59], [13, 59.01], [13, 59.02]];
  const c = cumulativeM(pts);
  assert.equal(c[0], 0);
  assert.ok(Math.abs(c[2] - routeLengthM(pts)) < 1e-6);
  assert.equal(routeLengthM([]), 0);
  assert.equal(routeLengthM([[13, 59]]), 0);
});

test("formatLength", () => {
  assert.equal(formatLength(420), "420 m");
  assert.equal(formatLength(3400), "3,4 km");
  assert.equal(formatLength(12_300), "12 km");
});
