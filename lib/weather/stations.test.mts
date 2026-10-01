import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseBest, isValid, scoreSeries, toHourly, type StationSeries } from "./stations.ts";

const H = 3_600_000;
const NOW = Date.parse("2026-01-10T12:00:00Z");
const w = { from: NOW - 24 * H, to: NOW };
const hourly = (n: number, v = 1, lastAgo = 0) =>
  Array.from({ length: n }, (_, i) => ({ t: NOW - lastAgo * H - (n - 1 - i) * H, v }));
const series = (id: string, source: "SMHI" | "TRAFIKVERKET_VVIS", km: number, values: { t: number; v: number }[]): StationSeries => ({
  station: { id, source, name: id, lat: 0, lon: 0, distanceKm: km },
  parameter: "temperature",
  values,
});

test("5-minutersdata → timvärden (senaste, summa, max)", () => {
  const five = [0, 5, 10, 55, 60, 65].map((m, i) => ({ t: NOW + m * 60_000, v: i + 1 }));
  assert.deepEqual(toHourly(five, "instant").map((x) => x.v), [1, 5, 6]);
  assert.deepEqual(toHourly(five, "sum").map((x) => x.v), [1, 2 + 3 + 4 + 5, 6]);
  assert.deepEqual(toHourly(five, "max").map((x) => x.v), [1, 5, 6]);
});

test("ogiltiga värden är inte 0", () => {
  assert.equal(isValid("precipitation", 0), true);
  assert.equal(isValid("precipitation", -1), false);
  assert.equal(isValid("temperature", null), false);
  assert.equal(isValid("windSpeed", 120), false);
});

test("VViS närmast vinner vid lika kvalitet", () => {
  const best = chooseBest([series("smhi", "SMHI", 20, hourly(24)), series("vvis", "TRAFIKVERKET_VVIS", 6, hourly(24))], w);
  assert.equal(best?.station.id, "vvis");
});

test("SMHI närmast vinner vid lika kvalitet", () => {
  const best = chooseBest([series("smhi", "SMHI", 5, hourly(24)), series("vvis", "TRAFIKVERKET_VVIS", 12, hourly(24))], w);
  assert.equal(best?.station.id, "smhi");
});

test("gammal observation utesluts även om stationen är närmast", () => {
  const old = series("vvis", "TRAFIKVERKET_VVIS", 2, hourly(10, 1, 5)); // senaste värde 5 h gammalt
  assert.equal(scoreSeries(old, w), null);
  assert.equal(chooseBest([old, series("smhi", "SMHI", 30, hourly(24))], w)?.station.id, "smhi");
});

test("dålig täckning kan väga tyngre än kort avstånd", () => {
  const sparse = series("vvis", "TRAFIKVERKET_VVIS", 4, hourly(3)); // 3 av 24 h
  const full = series("smhi", "SMHI", 10, hourly(24));
  assert.equal(chooseBest([sparse, full], w)?.station.id, "smhi");
});

test("inga kandidater ger null", () => {
  assert.equal(chooseBest([], w), null);
  assert.equal(chooseBest([series("x", "SMHI", 1, [])], w), null);
});
