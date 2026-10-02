import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPassWind, type WindCandidate } from "./passWind.ts";

const T = Date.parse("2026-01-10T05:30:00Z");
const st = (name: string, distanceKm: number) => ({ name, source: "SMHI" as const, distanceKm });
const c = (min: number, km: number, speed = 4): WindCandidate => ({
  t: T + min * 60_000,
  speed,
  fromDirection: 200,
  gust: null,
  station: st(`s${km}`, km),
});

test("ingen observation inom ±1 h ger null", () => {
  assert.equal(pickPassWind([c(90, 5), c(-61, 5)], T), null);
  assert.equal(pickPassWind([], T), null);
});

test("väljer kombinationen av närhet i tid och avstånd", () => {
  const w = pickPassWind([c(30, 10), c(0, 20), c(5, 30)], T);
  assert.equal(w?.station.name, "s20");
});

test("ogiltig hastighet hoppas över", () => {
  assert.equal(pickPassWind([c(0, 5, Number.NaN), c(0, 8, -1)], T), null);
});
