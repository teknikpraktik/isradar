import assert from "node:assert/strict";
import { test } from "node:test";
import { computeColdAmount, seasonStartFor, type DailyMean } from "./compute.ts";

const d = (date: string, meanC: number): DailyMean => ({ date, meanC });

test("säsongen börjar 1 oktober", () => {
  assert.equal(seasonStartFor("2026-10-01"), "2026-10-01");
  assert.equal(seasonStartFor("2027-02-15"), "2026-10-01");
  assert.equal(seasonStartFor("2026-09-30"), "2025-10-01");
});

test("netto med golv vid 0", () => {
  // +5 → 0 (golv), −3 → 3, −2 → 5, +1 → 4
  const r = computeColdAmount(
    [d("2026-10-01", 5), d("2026-10-02", -3), d("2026-10-03", -2), d("2026-10-04", 1)],
    "2026-10-04",
  );
  assert.equal(r.accumulated, 4);
  assert.deepEqual(r.series.map((p) => p.gd), [0, 3, 5, 4]);
  assert.equal(r.change24h, -1);
  assert.equal(r.change7d, 4, "7 dygn bakåt ligger före säsongsstart = 0");
});

test("dygn före säsongsstart och efter asOf ignoreras", () => {
  const r = computeColdAmount([d("2026-09-30", -10), d("2026-10-01", -1), d("2026-10-02", -2)], "2026-10-01");
  assert.equal(r.accumulated, 1);
  assert.equal(r.lastDate, "2026-10-01");
});

test("saknade dygn redovisas och interpoleras inte", () => {
  const r = computeColdAmount([d("2026-10-01", -1), d("2026-10-03", -2)], "2026-10-03");
  assert.equal(r.accumulated, 3);
  assert.deepEqual(r.missingDays, ["2026-10-02"]);
  assert.equal(r.change24h, null, "jämförelsedygnet saknas");
});

test("inga data ger 0 och inga förändringar", () => {
  const r = computeColdAmount([], "2026-10-01");
  assert.equal(r.accumulated, 0);
  assert.equal(r.lastDate, null);
  assert.equal(r.change24h, null);
  assert.equal(r.change7d, null);
});

test("decimaler avrundas till en", () => {
  const r = computeColdAmount([d("2026-10-01", -1.04), d("2026-10-02", -2.03)], "2026-10-02");
  assert.equal(r.accumulated, 3.1);
});
