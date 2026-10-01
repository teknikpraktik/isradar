import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatPrecipitation,
  formatSubzeroDuration,
  formatTemperatureRange,
  formatWind,
} from "./format.ts";

test("temperaturintervall över, kring och under 0 °C", () => {
  assert.equal(formatTemperatureRange(10.1, 18.6), "10,1–18,6 °C");
  assert.equal(formatTemperatureRange(-3, 2, 0), "−3 – 2 °C");
  assert.equal(formatTemperatureRange(-12.4, -3.2), "−12,4 – −3,2 °C");
  assert.equal(formatTemperatureRange(9.1, 12.8, 0), "9–13 °C", "prognos i hela grader");
  assert.equal(formatTemperatureRange(5, 5), "5,0 °C");
  assert.equal(formatTemperatureRange(11, 17.6), "11,0–17,6 °C", "fast en decimal i observationer");
  assert.equal(formatTemperatureRange(-0.04, 2), "0,0–2,0 °C", "inget minus på noll");
  assert.equal(formatTemperatureRange(null, 3), null);
});

test("nederbörd: 0, värde, saknas och under mätgräns hålls isär", () => {
  assert.equal(formatPrecipitation(0), "0 mm");
  assert.equal(formatPrecipitation(4.5), "4,5 mm");
  assert.equal(formatPrecipitation(null), null);
  assert.equal(formatPrecipitation(0, { belowDetectionLimit: true }), "<0,1 mm");
});

test("vind med och utan riktning", () => {
  assert.equal(formatWind(3, "O"), "3 m/s O");
  assert.equal(formatWind(2.9), "2,9 m/s");
  assert.equal(formatWind(null), null);
});

test("tid under 0 °C: 0 h är ett värde, null är saknad prognos", () => {
  assert.equal(formatSubzeroDuration(0), "0 h");
  assert.equal(formatSubzeroDuration(8), "8 h");
  assert.equal(formatSubzeroDuration(null), null);
});
