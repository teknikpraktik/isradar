import assert from "node:assert/strict";
import { test } from "node:test";
import { COLD_DAY_CLASSES, coldDayClassFor, coldFillColor } from "./coldScale.ts";

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
  // Öppet vatten i stor sjö kontrolleras före GD-klassningen
  assert.ok(expr.indexOf("LARGE_LAKE_OPEN_WATER") < expr.indexOf('"step"'));
});
