import assert from "node:assert/strict";
import { test } from "node:test";
import { cellCenter, lonLatToMeps, nearestCell } from "./grid.ts";

test("projektionen träffar MEPS-gittrets egna koordinater", () => {
  // Gitterpunkt [500][400] enligt meps_det_2_5km: lon 13.8277…, lat 62.5529…
  const [x, y] = lonLatToMeps(13.827727538778511, 62.55298117850849);
  assert.ok(Math.abs(x - -60084.055) < 0.01);
  assert.ok(Math.abs(y - -82517.91) < 0.01);
  assert.deepEqual(nearestCell(13.827727538778511, 62.55298117850849), [500, 400]);
});

test("cellCenter är inversen av nearestCell", () => {
  const [lon, lat] = cellCenter([367, 371]);
  assert.deepEqual(nearestCell(lon, lat), [367, 371]);
});

test("utanför gittret ger null", () => {
  assert.equal(nearestCell(-40, 10), null);
});
