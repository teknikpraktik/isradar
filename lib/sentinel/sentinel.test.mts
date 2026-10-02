import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateRideabilityScore } from "../rideability/score.ts";
import { toLakeSentinelIndication } from "../rideability/sentinel.ts";
import type { SentinelPassRef } from "./api.ts";
import { assignPasses } from "./passes.ts";

const NOW = new Date("2026-12-20T12:00:00Z");
const H = 3_600_000;
const box = (w: number, s: number, e: number, n: number): [number, number, number, number] => [w, s, e, n];
const pass = (key: string, hoursAgo: number, rel: number, orbit: string, bbox = box(12, 59, 14, 60)): SentinelPassRef => ({
  key,
  time: new Date(NOW.getTime() - hoursAgo * H).toISOString(),
  platform: "Sentinel-1C",
  orbit,
  relativeOrbit: rel,
  items: [{ id: key, bbox }],
  windMs: 2,
  gustMs: null,
});
const stats = (hoursAgo: number, med: number, std = 1.2) => ({
  time: new Date(NOW.getTime() - hoursAgo * H).toISOString(),
  medianDb: med,
  stdDb: std,
  validPixels: 5000,
  windMs: 2,
});

test("assignPasses: senaste täckande pass och föregående från samma bana", () => {
  const passes = [
    pass("a", 5, 66, "descending"),
    pass("b", 20, 146, "ascending"),
    pass("c", 5 + 144, 66, "descending"),
    pass("d", 5 + 144 + 144, 66, "descending"),
  ];
  const r = assignPasses(passes, [13, 59.5]);
  assert.equal(r.latest?.key, "a");
  assert.equal(r.previous?.key, "c");
});

test("assignPasses: pass som inte täcker ytans mitt hoppas över; exclude ger nästa pass", () => {
  const passes = [pass("north", 5, 1, "descending", box(12, 60, 14, 61)), pass("a", 10, 66, "descending"), pass("b", 20, 146, "ascending")];
  assert.equal(assignPasses(passes, [13, 59.5]).latest?.key, "a");
  assert.equal(assignPasses(passes, [13, 59.5], new Set(["a"])).latest?.key, "b");
  assert.equal(assignPasses(passes, [20, 59.5]).latest, null);
});

test("assignPasses: föregående kräver > 1 dygn och samma bana", () => {
  const passes = [pass("a", 5, 66, "descending"), pass("b", 6, 66, "descending"), pass("c", 5 + 144, 139, "descending")];
  assert.equal(assignPasses(passes, [13, 59.5]).previous, null);
});

test("sjömodellens Sentinel-indikation: jämn stabil yta ger hög, saknad data ger null (inte 0)", () => {
  const good = toLakeSentinelIndication({ latest: stats(20, -14), previous: stats(20 + 144, -14.3) }, NOW);
  assert.ok(good && good.favourability > 0.85);
  assert.equal(toLakeSentinelIndication(null, NOW), null);
  assert.equal(toLakeSentinelIndication({ latest: { ...stats(20, -14), validPixels: 10 }, previous: null }, NOW), null);
  assert.equal(toLakeSentinelIndication({ latest: stats(24 * 20, -14), previous: null }, NOW), null);
});

test("sjömodellen: Sentinel är en faktor med 15 %, saknad Sentinel räknas inte som 0 och MEPS-spärren gäller", () => {
  const base = { gdPercent: 100, iceThicknessCm: 8, snowOnIceCm: 0, precipitation24hMm: 0 };
  const withS = calculateRideabilityScore({ ...base, sentinel: { favourability: 1 } });
  const without = calculateRideabilityScore({ ...base, sentinel: null });
  assert.equal(withS.factors.sentinel.max, 15);
  assert.equal(withS.factors.sentinel.points, 15);
  assert.equal(without.factors.sentinel.available, false);
  assert.equal(without.score, 100);
  // Sentinel kan inte åsidosätta MEPS-spärren: under 2 cm is blir kategorin aldrig mer än "Inga indikationer".
  const thin = calculateRideabilityScore({ ...base, iceThicknessCm: 1, sentinel: { favourability: 1 } });
  assert.equal(thin.category, "none");
});
