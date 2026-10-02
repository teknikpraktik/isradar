import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyRideabilityGating,
  calculateIceThicknessScore,
  calculateRideabilityScore,
  calculateSnowScore,
  getRideabilityCategory,
} from "./score.ts";

const full = { gdPercent: 100, iceThicknessCm: 8, snowOnIceCm: 0, sentinel: { favourability: 1 }, precipitation24hMm: 0 };

test("istjocklek: ankarpunkter och interpolering", () => {
  assert.equal(calculateIceThicknessScore(0).points, 0);
  assert.equal(calculateIceThicknessScore(2).points?.toFixed(6), "10.000000");
  assert.equal(calculateIceThicknessScore(5).points?.toFixed(6), "25.000000");
  assert.equal(calculateIceThicknessScore(12).points, 35);
  assert.equal(calculateIceThicknessScore(null).available, false);
});

test("snö: <1 cm full poäng, >5 cm noll", () => {
  assert.equal(calculateSnowScore(0.4).points, 20);
  assert.equal(calculateSnowScore(8).points, 0);
});

test("score normaliseras mot tillgänglig maxpoäng", () => {
  const r = calculateRideabilityScore(full);
  assert.equal(r.score, 100);
  assert.equal(r.category, "very_favourable");
  const noSentinel = calculateRideabilityScore({ ...full, sentinel: null });
  assert.equal(noSentinel.score, 100);
  assert.deepEqual(noSentinel.missing, ["sentinel"]);
});

test("kategorigränser", () => {
  assert.equal(getRideabilityCategory(85), "very_favourable");
  assert.equal(getRideabilityCategory(84.9), "favourable");
  assert.equal(getRideabilityCategory(70), "favourable");
  assert.equal(getRideabilityCategory(45), "mixed");
  assert.equal(getRideabilityCategory(44.9), "none");
});

test("gating på MEPS istjocklek", () => {
  assert.equal(applyRideabilityGating("very_favourable", 1.9).category, "none");
  assert.equal(applyRideabilityGating("very_favourable", 2).category, "mixed");
  assert.equal(applyRideabilityGating("very_favourable", 5).category, "mixed");
  assert.equal(applyRideabilityGating("very_favourable", 5.1).category, "very_favourable");
  assert.equal(applyRideabilityGating("none", 1).gate, null);
  const missing = applyRideabilityGating("very_favourable", null);
  assert.equal(missing.category, "favourable");
  assert.equal(missing.gate, "ice_missing");
});

test("hög score men låg istjocklek blir aldrig grön", () => {
  const r = calculateRideabilityScore({ ...full, iceThicknessCm: 1 });
  assert.equal(r.category, "none");
  assert.equal(r.rawCategory, "favourable");
});

test("färre än 3 av 5 källor → otillräckliga data", () => {
  const r = calculateRideabilityScore({ gdPercent: 100, iceThicknessCm: 8, snowOnIceCm: null, sentinel: null, precipitation24hMm: null });
  assert.equal(r.availableSources, 2);
  assert.equal(r.category, "insufficient");
  const ok = calculateRideabilityScore({ gdPercent: 100, iceThicknessCm: 8, snowOnIceCm: 0, sentinel: null, precipitation24hMm: null });
  assert.equal(ok.category, "very_favourable");
});

test("utan MEPS-is aldrig mycket gynnsamma", () => {
  const r = calculateRideabilityScore({ ...full, iceThicknessCm: null });
  assert.equal(r.category, "favourable");
});
