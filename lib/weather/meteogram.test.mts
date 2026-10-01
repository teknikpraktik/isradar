import assert from "node:assert/strict";
import { test } from "node:test";
import type { ForecastHour } from "./api.ts";
import {
  dayLabels,
  meteogramSummary,
  temperatureDomain,
  temperatureSegments,
  timeTicks,
  windArrowRotation,
} from "./meteogram.ts";

const hour = (time: string, p: Partial<ForecastHour> = {}): ForecastHour => ({
  time,
  temperature: 0,
  precipitationMm: 0,
  precipitationType: null,
  windSpeed: 3,
  windFromDirection: 270,
  gust: 6,
  ...p,
});

test("temperaturdomän tar med 0 °C nära fryspunkten", () => {
  const d = temperatureDomain([-8, -2, 3]);
  assert.ok(d.min <= -8 && d.max >= 3);
  assert.ok(d.min < 0 && d.max > 0, "0 °C inom domänen");
  const warm = temperatureDomain([8, 15]);
  assert.ok(warm.min > 0, "varm prognos behöver inte visa minusgrader");
  const cold = temperatureDomain([-20, -12]);
  assert.ok(cold.max < 0, "sträng kyla långt från 0 behöver inte nollan");
  const near = temperatureDomain([2, 4]);
  assert.ok(near.min <= 0, "2–4 °C ligger nära fryspunkten → 0 med");
});

test("vindpil visar vart vinden blåser (från-riktning + 180°)", () => {
  assert.equal(windArrowRotation(270), 90); // västlig vind blåser österut
  assert.equal(windArrowRotation(0), 180); // nordlig vind blåser söderut
  assert.equal(windArrowRotation(135), 315);
});

test("tidsmarkeringar och midnatt i svensk tid", () => {
  // 2026-10-01 21:00Z = 23:00 lokal (CEST), 22:00Z = 00:00
  const hs = ["2026-10-01T21:00:00Z", "2026-10-01T22:00:00Z", "2026-10-02T03:00:00Z", "2026-10-02T04:00:00Z"].map((t) => hour(t));
  assert.deepEqual(timeTicks(hs, 6), [
    { index: 1, label: "00", midnight: true },
    { index: 3, label: "06", midnight: false },
  ]);
});

const hourly = (fromIso: string, n: number) =>
  Array.from({ length: n }, (_, i) => hour(new Date(Date.parse(fromIso) + i * 3_600_000).toISOString()));

test("dagsetiketter: IDAG och veckodag", () => {
  // 16:00 lokal torsdag → 48 h framåt
  const labels = dayLabels(hourly("2026-10-01T14:00:00Z", 48), new Date("2026-10-01T13:30:00Z"));
  assert.deepEqual(labels.map((l) => l.label), ["IDAG", "FRE", "LÖR"]);
});

test("dag med bara någon timme i bild får ingen krockande etikett", () => {
  // 23:00 lokal torsdag → bara en timme "idag"
  const labels = dayLabels(hourly("2026-10-01T21:00:00Z", 48), new Date("2026-10-01T20:30:00Z"));
  assert.deepEqual(labels.map((l) => l.label), ["FRE", "LÖR"]);
});

test("saknad temperatur ger lucka, inte interpolation", () => {
  const hs = [hour("a", { temperature: 1 }), hour("b", { temperature: null }), hour("c", { temperature: -1 }), hour("d", { temperature: -2 })];
  assert.deepEqual(temperatureSegments(hs).map((s) => s.map((p) => p.index)), [[0], [2, 3]]);
});

test("sammanfattning för skärmläsare", () => {
  const hs = [
    hour("2026-10-01T22:00:00Z", { temperature: -7, precipitationMm: 0 }),
    hour("2026-10-01T23:00:00Z", { temperature: 2.4, precipitationMm: 1.2, windSpeed: 8 }),
  ];
  const s = meteogramSummary(hs);
  assert.match(s, /mellan -7 och 2 grader/);
  assert.match(s, /1 timmar under noll/);
  assert.match(s, /1,2 millimeter/);
  assert.match(meteogramSummary([hour("x", { precipitationMm: 0 })]), /Ingen nederbörd/);
});
