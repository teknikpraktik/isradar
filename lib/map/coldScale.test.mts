import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLD_PROGRESS_CLASSES,
  COLLECTION_AREA_STYLE,
  canRenderColdDays,
  coldFillColor,
  coldProgressClassFor,
  getColdProgress,
  lakeMapLabel,
} from "./coldScale.ts";

const pct = (cur: number | null, hist: number | null) => {
  const p = getColdProgress("WATER", cur, hist);
  return p.kind === "progress" ? Math.round(p.percent) : p.kind;
};
const status = (cur: number, hist: number) => {
  const p = getColdProgress("WATER", cur, hist);
  return p.kind === "progress" ? p.cls.status : p.kind;
};

test("progress = aktuell / historisk, utan tak", () => {
  assert.equal(pct(0, 50), 0);
  assert.equal(pct(10, 50), 20);
  assert.equal(pct(25, 50), 50);
  assert.equal(pct(45, 50), 90);
  assert.equal(pct(50, 50), 100);
  assert.equal(pct(60, 50), 120);
  assert.equal(pct(100, 50), 200);
});

test("statusgränser", () => {
  assert.equal(status(0, 50), "Ingen ackumulerad köld");
  assert.equal(status(0.1, 50), "Tidigt");
  assert.equal(status(24.9, 50), "Tidigt");
  assert.equal(status(25, 50), "På väg");
  assert.equal(status(41, 56), "På väg");
  assert.equal(status(45, 50), "Nära historisk referens");
  assert.equal(status(42, 40), "Historisk referens uppnådd");
  assert.equal(status(60, 50), "Över historisk referens");
  assert.equal(status(81, 60), "Över historisk referens");
});

test("samma relativa nivå ger samma klass oavsett referens", () => {
  const a = getColdProgress("WATER", 20, 40);
  const b = getColdProgress("WATER", 50, 100);
  assert.ok(a.kind === "progress" && b.kind === "progress");
  assert.equal(a.cls.color, b.cls.color);
});

test("saknad/ogiltig referens, saknad aktuell och COLLECTION_AREA hålls isär", () => {
  assert.equal(pct(10, null), "no_reference");
  assert.equal(pct(10, 0), "no_reference", "ingen division med 0");
  assert.equal(pct(10, -5), "no_reference");
  assert.equal(pct(null, 50), "no_current");
  assert.equal(getColdProgress("COLLECTION_AREA", 10, 49).kind, "not_applicable");
  assert.equal(getColdProgress("SUBAREA", 10, 50).kind, "progress");
});

test("klasserna är sammanhängande och slutar öppet", () => {
  for (let i = 1; i < COLD_PROGRESS_CLASSES.length; i++) {
    assert.equal(COLD_PROGRESS_CLASSES[i].min, COLD_PROGRESS_CLASSES[i - 1].max);
  }
  assert.equal(COLD_PROGRESS_CLASSES[0].min, 0);
  assert.equal(COLD_PROGRESS_CLASSES.at(-1)!.max, null);
  assert.equal(coldProgressClassFor(1000).id, "over");
});

test("kartuttrycket använder samma färger och samlingsområden först", () => {
  const expr = JSON.stringify(coldFillColor());
  for (const c of COLD_PROGRESS_CLASSES) assert.ok(expr.includes(c.color), `färg ${c.color} saknas`);
  assert.ok(expr.indexOf("COLLECTION_AREA") < expr.indexOf('"step"'));
  assert.ok(!expr.includes('"hca"'), "historisk GD får inte styra färgen");
});

test("etikett exakt 'Sjönamn XX'", () => {
  assert.equal(lakeMapLabel("Värmeln", "WATER", 56), "Värmeln 56");
  assert.equal(lakeMapLabel("Värmeln", "WATER", 55.6), "Värmeln 56");
  assert.equal(lakeMapLabel("Värmeln", "WATER", null), "Värmeln");
  assert.equal(lakeMapLabel("Norra Vänern", "COLLECTION_AREA", 49), "Norra Vänern");
});

test("COLLECTION_AREA klassificeras aldrig", () => {
  assert.equal(canRenderColdDays("COLLECTION_AREA"), false);
  assert.ok(!COLD_PROGRESS_CLASSES.some((c) => c.color.toLowerCase() === COLLECTION_AREA_STYLE.fill.toLowerCase()));
});
