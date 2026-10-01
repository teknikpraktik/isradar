import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLD_DAY_CLASSES,
  COLLECTION_AREA_STYLE,
  canRenderColdDays,
  coldDayClassFor,
  coldFillColor,
  getColdDayStyle,
} from "./coldScale.ts";

test("klasserna är sammanhängande och slutar öppet", () => {
  for (let i = 1; i < COLD_DAY_CLASSES.length; i++) {
    assert.equal(COLD_DAY_CLASSES[i].min, COLD_DAY_CLASSES[i - 1].max, `glapp före ${COLD_DAY_CLASSES[i].label}`);
  }
  assert.equal(COLD_DAY_CLASSES[0].min, 0);
  assert.equal(COLD_DAY_CLASSES.at(-1)!.max, null);
});

test("gränsvärden hamnar i övre klassen", () => {
  assert.equal(coldDayClassFor(0).label, "< 30");
  assert.equal(coldDayClassFor(29.9).label, "< 30");
  assert.equal(coldDayClassFor(30).label, "30–50");
  assert.equal(coldDayClassFor(80).label, "80–120");
  assert.equal(coldDayClassFor(120).label, "≥ 120");
  assert.equal(coldDayClassFor(418).label, "≥ 120");
});

test("kartuttrycket använder samma gränser och färger", () => {
  const expr = JSON.stringify(coldFillColor());
  for (const c of COLD_DAY_CLASSES) assert.ok(expr.includes(c.color), `färg ${c.color} saknas`);
  for (const c of COLD_DAY_CLASSES.slice(1)) assert.ok(expr.includes(`,${c.min},`), `gräns ${c.min} saknas`);
  // Samlingsområden kontrolleras före saknat värde och GD-klassningen
  assert.ok(expr.indexOf("COLLECTION_AREA") < expr.indexOf("null"));
  assert.ok(expr.indexOf("COLLECTION_AREA") < expr.indexOf('"step"'));
});

test("A/B/C: 0 GD, saknat värde och ej tillämpad hålls isär", () => {
  const zero = getColdDayStyle("WATER", 0);
  assert.equal(zero.kind, "class");
  assert.equal(zero.kind === "class" && zero.cls.label, "< 30", "0 GD är ett riktigt värde");
  assert.equal(getColdDayStyle("WATER", null).kind, "missing");
  assert.equal(getColdDayStyle("SUBAREA", undefined).kind, "missing");
  // COLLECTION_AREA får aldrig klass – inte ens när källan har ett värde (t.ex. Norra Vänern 49 GD)
  assert.equal(getColdDayStyle("COLLECTION_AREA", 49).kind, "not_applicable");
  assert.equal(getColdDayStyle("COLLECTION_AREA", null).kind, "not_applicable");
});

test("WATER och SUBAREA GD-färgsätts, COLLECTION_AREA inte", () => {
  assert.equal(canRenderColdDays("WATER"), true);
  assert.equal(canRenderColdDays("SUBAREA"), true);
  assert.equal(canRenderColdDays("COLLECTION_AREA"), false);
});

test("samlingsområdets färg är inte en GD-färg", () => {
  assert.ok(!COLD_DAY_CLASSES.some((c) => c.color.toLowerCase() === COLLECTION_AREA_STYLE.fill.toLowerCase()));
});
