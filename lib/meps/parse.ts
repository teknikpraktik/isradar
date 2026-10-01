/** Ren tolkning av OPeNDAP ASCII-svar från THREDDS (ingen I/O). */

export const MEPS_VARIABLES = ["SFX_H_ICE", "SFX_H_SNOW", "SFX_TS_WATER"] as const;
export type MepsVariable = (typeof MEPS_VARIABLES)[number];

/** Tolkar OPeNDAP ASCII för Grid-variabler [time][y][x] + time-axeln. */
export function parseAscii(text: string): { values: Partial<Record<MepsVariable, number[][][]>>; times: number[] } {
  const values: Partial<Record<MepsVariable, number[][][]>> = {};
  let times: number[] = [];
  const lines = text.split(/\r?\n/);
  for (let k = 0; k < lines.length; k++) {
    const head = /^(\w+)\.(\w+)\[(\d+)\](?:\[(\d+)\]\[(\d+)\])?$/.exec(lines[k].trim());
    if (!head) continue;
    const [, grid, member] = head;
    if (member === "time" && times.length === 0) {
      times = lines[k + 1].split(",").map((v) => Number(v.trim()) * 1000);
      continue;
    }
    if (grid !== member || !(MEPS_VARIABLES as readonly string[]).includes(member)) continue;
    const arr: number[][][] = [];
    for (let r = k + 1; r < lines.length; r++) {
      const row = /^\[(\d+)\]\[(\d+)\],\s*(.*)$/.exec(lines[r].trim());
      if (!row) break;
      const t = Number(row[1]);
      (arr[t] ??= [])[Number(row[2])] = row[3].split(",").map((v) => Number(v.trim()));
    }
    values[member as MepsVariable] = arr;
  }
  return { values, times };
}

