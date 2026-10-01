import assert from "node:assert/strict";
import { test } from "node:test";
import { median } from "./api.ts";
import { parseAscii } from "./parse.ts";

const SAMPLE = `Dataset {
} mepslatest/x.ncml;
---------------------------------------------
SFX_H_ICE.SFX_H_ICE[2][1][2]
[0][0], 9.96921E36, 0.12
[1][0], 9.96921E36, 0.15

SFX_H_ICE.time[2]
1.7908668E9, 1.7908704E9

SFX_H_ICE.y[1]
-417517.9
`;

test("OPeNDAP ASCII tolkas till [tid][y][x] och tidsaxel i ms", () => {
  const r = parseAscii(SAMPLE);
  assert.deepEqual(r.values.SFX_H_ICE, [[[9.96921e36, 0.12]], [[9.96921e36, 0.15]]]);
  assert.deepEqual(r.times, [1790866800000, 1790870400000]);
});

test("median", () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});
