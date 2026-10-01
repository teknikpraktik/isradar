import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compassSv,
  maxInWindow,
  summarizePrecipitation,
  summarizeTemperature,
  summarizeWind,
} from "./compute.ts";

const H = 3_600_000;
const T0 = Date.parse("2026-01-10T00:00:00Z");
const w = { from: T0, to: T0 + 24 * H };
const at = (h: number, v: number) => ({ t: T0 + h * H, v });

test("temperatur: min, max och senaste inom fönstret", () => {
  const r = summarizeTemperature([at(0, -20), at(1, -5), at(12, -12.04), at(24, -3), at(25, 9)], w);
  assert.ok(r);
  assert.equal(r.min, -12, "värdet exakt på from ingår inte, 25 h ligger utanför");
  assert.equal(r.max, -3);
  assert.equal(r.latest, -3);
  assert.deepEqual(r.coverage, { hours: 3, expectedHours: 24 });
});

test("nederbörd: summa med redovisad täckning", () => {
  const r = summarizePrecipitation([at(1, 0.4), at(2, 1.25), at(3, 0)], w);
  assert.deepEqual(r, { sum: 1.7, coverage: { hours: 3, expectedHours: 24 } });
});

test("inga värden ger null, inte 0", () => {
  assert.equal(summarizeTemperature([], w), null);
  assert.equal(summarizePrecipitation([at(30, 5)], w), null);
  assert.equal(summarizeWind([], [], w), null);
  assert.equal(maxInWindow([], w), null);
});

test("vind: senaste med riktning och högsta medel", () => {
  const r = summarizeWind([at(1, 3), at(5, 8.2), at(10, 4)], [at(10, 225)], w);
  assert.ok(r);
  assert.equal(r.latest, 4);
  assert.equal(r.latestDirection, 225);
  assert.equal(r.maxMean, 8.2);
});

test("väderstreck", () => {
  assert.equal(compassSv(0), "N");
  assert.equal(compassSv(359), "N");
  assert.equal(compassSv(225), "SV");
  assert.equal(compassSv(100), "O");
});

test("timmar under 0 °C", async () => {
  const { hoursBelow } = await import("./compute.ts");
  assert.deepEqual(hoursBelow([at(1, 2), at(2, 0), at(3, -0.1), at(4, -5)], w), {
    hours: 2,
    coverage: { hours: 4, expectedHours: 24 },
  });
  assert.equal(hoursBelow([at(1, 3)], w)?.hours, 0, "0 h är ett riktigt värde");
  assert.equal(hoursBelow([], w), null, "saknad prognos är inte 0 h");
});
