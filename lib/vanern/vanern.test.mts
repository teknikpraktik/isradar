import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateColdScore, calculateVanernRideability, type VanernCellInputs } from "./score.ts";
import { calculateSentinelScore } from "./sentinel.ts";
import {
  calculatePrecipitationScore,
  calculateTemperatureScore,
  calculateWindScore,
  summarizePrecipitation,
  summarizeTemperature,
  summarizeWind,
  type HourlyPoint,
} from "./weatherContext.ts";

const NOW = Date.parse("2026-12-20T12:00:00Z");
const H = 3_600_000;
const series = (hours: number, f: (i: number) => number): HourlyPoint[] =>
  Array.from({ length: hours }, (_, i) => ({ t: NOW - (hours - 1 - i) * H, v: f(i) }));

const pass = (hoursAgo: number, medianDb: number, stdDb: number, windMs: number | null = 2) => ({
  time: new Date(NOW - hoursAgo * H).toISOString(),
  medianDb,
  stdDb,
  validPercent: 100,
  windMs,
});

/** Komplett exempel: stabil kyla, ingen nederbörd, svag vind, jämn yta och liten förändring. */
function completeInputs(): VanernCellInputs {
  return {
    coldPercent: 96,
    weather: {
      temperature: summarizeTemperature(series(7 * 24, () => -7), NOW),
      precipitation: summarizePrecipitation(series(48, () => 0), series(48, () => -7), NOW),
      wind: summarizeWind(series(72, () => 2.5), NOW),
    },
    sentinel: { latest: pass(20, -14, 1.2), previous: pass(20 + 12 * 24, -14.4, 1.3) },
  };
}

test("köldmängd: ankarpunkter och kontinuerlig kurva", () => {
  assert.equal(calculateColdScore(null), null);
  assert.equal(calculateColdScore(30), 0);
  assert.ok(Math.abs(calculateColdScore(50)! - 20) < 1e-9);
  assert.ok(Math.abs(calculateColdScore(75)! - 50) < 1e-9);
  assert.ok(Math.abs(calculateColdScore(100)! - 80) < 1e-9);
  assert.equal(calculateColdScore(140), 100);
  assert.ok(calculateColdScore(62.5)! > 20 && calculateColdScore(62.5)! < 50);
});

test("temperatur: stabil kyla högt, upptining lågt, saknad data = null", () => {
  const cold = calculateTemperatureScore(summarizeTemperature(series(7 * 24, () => -8), NOW));
  const thaw = calculateTemperatureScore(summarizeTemperature(series(7 * 24, () => 3), NOW));
  const mixed = calculateTemperatureScore(summarizeTemperature(series(7 * 24, (i) => (i % 24 < 12 ? -2 : 2)), NOW));
  assert.ok(cold! >= 80, String(cold));
  assert.ok(thaw! <= 20, String(thaw));
  assert.ok(mixed! > thaw! && mixed! < cold!);
  assert.equal(summarizeTemperature(series(10, () => -5), NOW), null);
  assert.equal(calculateTemperatureScore(null), null);
});

test("nederbörd: regn sänker mer än snö, ingen nederbörd = 100, okänd temperatur räknas som regn", () => {
  const temp = (v: number) => series(48, () => v);
  const wet = series(48, (i) => (i === 40 ? 2 : 0));
  const snow = calculatePrecipitationScore(summarizePrecipitation(wet, temp(-5), NOW));
  const rain = calculatePrecipitationScore(summarizePrecipitation(wet, temp(4), NOW));
  assert.ok(rain! < snow!);
  assert.equal(calculatePrecipitationScore(summarizePrecipitation(series(48, () => 0), temp(-5), NOW)), 100);
  const unknown = summarizePrecipitation(wet, [], NOW)!;
  assert.equal(unknown.typeKnown, false);
  assert.equal(unknown.rainMm, 2);
});

test("vind: hård vind sänker, stabil is dämpar straffet", () => {
  const calm = calculateWindScore(summarizeWind(series(72, () => 2), NOW));
  const windy = calculateWindScore(summarizeWind(series(72, () => 10), NOW));
  const windyButStable = calculateWindScore(summarizeWind(series(72, () => 10), NOW), 1, 0.5);
  assert.ok(calm! > 90 && windy! < 20);
  assert.ok(windyButStable! > windy!);
  assert.equal(calculateWindScore(null), null);
});

test("Sentinel: jämn stabil yta ger hög poäng; mörk nivå ensam ger inte högsta poäng", () => {
  const good = calculateSentinelScore({ latest: pass(20, -14, 1.2), previous: pass(300, -14.3, 1.2) }, new Date(NOW))!;
  assert.ok(good.score > 85, String(good.score));
  assert.ok(good.fresh && good.deltaDb !== null && Math.abs(good.deltaDb) < 1);
  const darkCalm = calculateSentinelScore({ latest: pass(20, -24, 1.0, 1), previous: null }, new Date(NOW))!;
  assert.ok(darkCalm.score < good.score);
  assert.equal(darkCalm.roughOpenWater, false);
});

test("Sentinel: hög variation och stor förändring sänker; vindpåverkat öppet vatten flaggas", () => {
  const unstable = calculateSentinelScore({ latest: pass(20, -10, 5.5), previous: pass(300, -19, 1.5) }, new Date(NOW))!;
  assert.ok(unstable.score < 45, String(unstable.score));
  const rough = calculateSentinelScore({ latest: pass(20, -10, 4, 9), previous: null }, new Date(NOW))!;
  assert.equal(rough.roughOpenWater, true);
  assert.ok(rough.score <= 25);
});

test("Sentinel: saknas, för gammalt eller för få giltiga pixlar → null (inte 0)", () => {
  assert.equal(calculateSentinelScore(null, new Date(NOW)), null);
  assert.equal(calculateSentinelScore({ latest: null, previous: null }, new Date(NOW)), null);
  assert.equal(calculateSentinelScore({ latest: pass(24 * 20, -14, 1), previous: null }, new Date(NOW)), null);
  assert.equal(calculateSentinelScore({ latest: { ...pass(10, -14, 1), validPercent: 20 }, previous: null }, new Date(NOW)), null);
});

test("Vänern: komplett exempel ger hög score, alla delscore och hög datatillit", () => {
  const r = calculateVanernRideability(completeInputs(), new Date(NOW));
  assert.equal(r.model, "vanern");
  assert.equal(r.confidence, "high");
  assert.equal(r.cap, null);
  for (const v of Object.values(r.components)) assert.ok(v !== null && v >= 0 && v <= 100);
  assert.ok(r.score! > 80, String(r.score));
  assert.equal(r.category, "very_favourable");
});

test("Vänern: Sentinel saknas → konservativt tak, låg datatillit, aldrig högsta kategori", () => {
  const inputs = { ...completeInputs(), sentinel: null };
  const r = calculateVanernRideability(inputs, new Date(NOW));
  assert.equal(r.components.sentinel, null);
  assert.equal(r.confidence, "low");
  assert.equal(r.cap, "sentinel_missing");
  assert.ok(r.score! <= 55);
  assert.ok(r.rawScore! > r.score!);
  assert.notEqual(r.category, "very_favourable");
  assert.notEqual(r.category, "favourable");
});

test("Vänern: saknad komponent normaliserar vikterna, saknas är inte 0", () => {
  const full = calculateVanernRideability(completeInputs(), new Date(NOW));
  const noWind = calculateVanernRideability({ ...completeInputs(), weather: { ...completeInputs().weather!, wind: null } }, new Date(NOW));
  assert.equal(noWind.components.wind, null);
  assert.ok(noWind.availableWeight < 1);
  assert.ok(Math.abs(noWind.score! - full.score!) < 8);
  assert.equal(noWind.confidence, "medium");
});

test("Vänern: för lite underlag → otillräckliga data", () => {
  const r = calculateVanernRideability({ coldPercent: 100, weather: null, sentinel: null }, new Date(NOW));
  assert.equal(r.score, null);
  assert.equal(r.category, "insufficient");
});

test("Vänern: vindpåverkat öppet vatten tar score (trots mycket köld)", () => {
  const inputs = completeInputs();
  inputs.sentinel = { latest: pass(20, -10, 4, 9), previous: null };
  const r = calculateVanernRideability(inputs, new Date(NOW));
  assert.equal(r.cap, "rough_open_water");
  assert.ok(r.score! <= 30);
});

test("Vänern: ingen ackumulerad köld → aldrig gul/grön, trots jämn radaryta och lugnt väder", () => {
  const inputs = { ...completeInputs(), coldPercent: 0 };
  const r = calculateVanernRideability(inputs, new Date(NOW));
  assert.ok(r.rawScore! > 45, "utan spärr hade råpoängen kunnat ge gul färg: " + r.rawScore);
  assert.equal(r.cap, "no_cold");
  assert.ok(r.score! <= 35);
  assert.equal(r.category, "none");
});

test("Vänern: varmt väder (72 h-medel ≥ 2 °C) ger tak även med köld i historiken", () => {
  const inputs = completeInputs();
  inputs.weather = { ...inputs.weather!, temperature: summarizeTemperature(series(7 * 24, () => 4), NOW) };
  const r = calculateVanernRideability(inputs, new Date(NOW));
  assert.equal(r.cap, "warm");
  assert.ok(r.score! <= 20);
  assert.equal(r.category, "none");
});

test("Vänern: saknad köldmängd utlöser inte köldspärren (data saknas ≠ 0)", () => {
  const r = calculateVanernRideability({ ...completeInputs(), coldPercent: null }, new Date(NOW));
  assert.equal(r.components.cold, null);
  assert.notEqual(r.cap, "no_cold");
});
