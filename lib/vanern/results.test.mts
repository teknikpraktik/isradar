import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateRideability } from "../rideability/model.ts";
import { generateVanernGrid } from "./grid.ts";
import { vanernMemberIds } from "./members.ts";
import { computeVanernCells, vanernCellFeatures } from "./results.ts";
import { summarizeTemperature, summarizeWind, summarizePrecipitation } from "./weatherContext.ts";

const NOW = new Date("2026-12-20T12:00:00Z");
const H = 3_600_000;
const series = (hours: number, v: number) => Array.from({ length: hours }, (_, i) => ({ t: NOW.getTime() - (hours - 1 - i) * H, v }));
const sq = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const lake = { id: 7, name: "Vik", geometry: { type: "Polygon" as const, coordinates: [sq(13.0, 59.2, 13.1, 59.25)] } };

test("vanernMemberIds: delområden med medlem som förälder följer med (rekursivt)", () => {
  const e = (id: number, parent: number | null) => ({ id, parent: parent === null ? null : { id: parent, name: "x" } }) as never;
  const ids = vanernMemberIds({ areaIds: [1] }, [e(1, null), e(2, 1), e(3, 2), e(4, null), e(5, 4)]);
  assert.deepEqual([...ids].sort(), [1, 2, 3]);
});

test("computeVanernCells: celler med och utan Sentinel får olika tak och datatillit", () => {
  const cells = generateVanernGrid([lake], { cellKm: 2 });
  assert.ok(cells.length > 3);
  const weather = {
    temperature: summarizeTemperature(series(7 * 24, -8), NOW.getTime()),
    precipitation: summarizePrecipitation(series(48, 0), series(48, -8), NOW.getTime()),
    wind: summarizeWind(series(72, 2), NOW.getTime()),
  };
  const pass = (hoursAgo: number, med: number) => ({ medianDb: med, stdDb: 1.2, validPercent: 100 });
  const sentinelByCell = new Map([[cells[0].id, { A: pass(0, -14), B: pass(0, -14.5) }]]);
  const results = computeVanernCells(
    cells,
    {
      coldPercentByArea: new Map([[7, 100]]),
      weatherByTile: new Map(cells.map((c) => [c.weatherTile, weather])),
      passes: [
        { key: "A", time: new Date(NOW.getTime() - 20 * H).toISOString(), windMs: 2 },
        { key: "B", time: new Date(NOW.getTime() - 20 * H - 288 * H).toISOString(), windMs: 2 },
      ],
      sentinelByCell,
    },
    NOW,
  );
  const withS = results.get(cells[0].id)!;
  const withoutS = results.get(cells[1].id)!;
  assert.equal(withS.confidence, "high");
  assert.equal(withoutS.confidence, "low");
  assert.equal(withoutS.cap, "sentinel_missing");
  assert.ok(withS.score! > withoutS.score!);
  const fc = vanernCellFeatures(cells, results);
  assert.equal(fc.features.length, cells.length);
  assert.equal(fc.features[0].properties?.id, 7);
  assert.equal(fc.features[0].properties?.rcat, withS.category);
});

test("calculateRideability: dispatcher väljer modell", () => {
  const lakeRes = calculateRideability({
    model: "lake",
    inputs: { gdPercent: 100, iceThicknessCm: 8, snowOnIceCm: 0, sentinel: null, precipitation24hMm: 0 },
  });
  assert.ok("factors" in lakeRes);
  const vRes = calculateRideability({ model: "vanern", inputs: { coldPercent: null, weather: null, sentinel: null }, now: NOW });
  assert.equal(vRes.model, "vanern");
  assert.equal(vRes.category, "insufficient");
});
