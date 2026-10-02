import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSnowfall, hourType, simplePrecipType, snowToLiquidRatio, summarizePrecipitationTyped, type PrecipHour } from "./precipitation.ts";

const h = (mm: number, extra: Partial<PrecipHour> = {}): PrecipHour => ({ t: 0, mm, ...extra });

test("0 mm: ingen typ och ingen nysnö", () => {
  assert.deepEqual(summarizePrecipitationTyped([h(0), h(0, { ptype: 0 })]), {
    mm: 0,
    type: null,
    snowfallCm: null,
    estimatedSnowfall: true,
  });
});

test("regn: ingen snöomräkning", () => {
  const r = summarizePrecipitationTyped([h(2, { ptype: 1, tempC: 4 }), h(1.4, { ptype: 1, tempC: 3 })]);
  assert.equal(r.type, "rain");
  assert.equal(r.mm, 3.4);
  assert.equal(r.snowfallCm, null);
});

test("snö nära 0 °C: tung snö 5–8:1", () => {
  const r = summarizePrecipitationTyped([h(3.4, { ptype: 6, tempC: -0.5 })]);
  assert.equal(r.type, "snow");
  assert.deepEqual(r.snowfallCm, [2, 3]); // 17–27 mm snö
});

test("snö vid −3 °C: 8–12:1 → ca 3–4 cm", () => {
  assert.deepEqual(summarizePrecipitationTyped([h(3.4, { ptype: 5, tempC: -3 })]).snowfallCm, [3, 4]);
});

test("kall torr snö: 15–20:1", () => {
  assert.deepEqual(snowToLiquidRatio(-14), [15, 20]);
  assert.deepEqual(summarizePrecipitationTyped([h(2, { ptype: 5, tempC: -14 })]).snowfallCm, [3, 4]);
});

test("blandat utan fryst andel: ingen nysnöuppskattning", () => {
  const r = summarizePrecipitationTyped([h(3, { ptype: 7, tempC: 0.5 })]);
  assert.equal(r.type, "mixed");
  assert.equal(r.snowfallCm, null);
});

test("blandat med fryst andel: bara den fasta delen räknas", () => {
  const r = summarizePrecipitationTyped([h(10, { ptype: 7, frozenPct: 50, tempC: -2 })]);
  assert.equal(r.type, "mixed");
  assert.deepEqual(r.snowfallCm, [4, 6]); // 5 mm × 8–12 = 40–60 mm
});

test("typ avgörs per timme, inte av dygnets min/max", () => {
  // Dygnet −5…+1 °C, men all nederbörd faller vid +1 °C som regn.
  const r = summarizePrecipitationTyped([h(0, { tempC: -5 }), h(3, { tempC: 2.5 }), h(0, { tempC: -4 })]);
  assert.equal(r.type, "rain");
});

test("utan ptype: fryst andel, sedan temperatur", () => {
  assert.equal(hourType(h(1, { frozenPct: 95 })), "snow");
  assert.equal(hourType(h(1, { frozenPct: 50 })), "mixed");
  assert.equal(hourType(h(1, { tempC: -3 })), "snow");
  assert.equal(hourType(h(1, { tempC: 0.5 })), "unknown");
  assert.equal(hourType(h(1)), "unknown");
});

test("nederbörd bara under del av perioden", () => {
  const r = summarizePrecipitationTyped([h(0), h(0), h(1.5, { ptype: 5, tempC: -6 }), h(0)]);
  assert.equal(r.mm, 1.5);
  assert.deepEqual(r.snowfallCm, [2, 2]);
});

test("ingen falsk precision i texten", () => {
  assert.equal(formatSnowfall([3, 4]), "ca 3–4 cm");
  assert.equal(formatSnowfall([0, 0]), "< 1 cm");
  assert.equal(formatSnowfall([0, 1]), "ca 0–1 cm");
  assert.equal(formatSnowfall([2, 2]), "ca 2 cm");
});

test("enkel typregel: ≤ 0 °C snö, > 0 °C regn, okänd temperatur okänd typ", () => {
  assert.equal(simplePrecipType(0), "snow");
  assert.equal(simplePrecipType(-3.2), "snow");
  assert.equal(simplePrecipType(0.1), "rain");
  assert.equal(simplePrecipType(null), "unknown");
});
