/**
 * MEPS sjöis (FLake i SURFEX) från MET Norway THREDDS via OPeNDAP. Endast server.
 *
 * Variabler (meps_det_2_5km_*.ncml, [time=67][y][x]):
 *   SFX_H_ICE     Ice thickness over lakes in FLAKE (m)
 *   SFX_H_SNOW    Snow thickness over lakes in FLAKE (m)
 *   SFX_TS_WATER  Surface temperature for inland water tile (K)
 * Rutor utan sjöyta i modellen har fyllnadsvärdet 9.96921e36.
 *
 * Data: MET Norway, licens CC BY 4.0 (https://thredds.met.no).
 */
import "server-only";
import { isValidCell, type MepsCell } from "@/lib/meps/grid";
import { MEPS_VARIABLES, parseAscii, type MepsVariable } from "@/lib/meps/parse";

const THREDDS = "https://thredds.met.no/thredds";
const CATALOG = `${THREDDS}/catalog/mepslatest/catalog.xml`;
const DODS = `${THREDDS}/dodsC/mepslatest`;
const STEPS = 67;
const FILL_LIMIT = 1e30;
/** Största rektangel (rutor) som hämtas i ett anrop. */
const MAX_BOX = 400;


export class MepsError extends Error {}

async function getText(url: string, revalidate: number): Promise<string> {
  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) throw new MepsError(`THREDDS svarade ${res.status} för ${url}`);
  return res.text();
}

/** Senaste deterministiska körning med alla 67 tidssteg (0–66 h). */
export async function latestCompleteRun(): Promise<{ file: string; runTime: string }> {
  const xml = await getText(CATALOG, 600);
  const files = [...new Set(xml.match(/meps_det_2_5km_\d{8}T\d{2}Z\.ncml/g) ?? [])].sort().reverse();
  for (const file of files.slice(0, 4)) {
    const dds = await getText(`${DODS}/${file}.dds`, 600);
    const m = /Float64 time\[time = (\d+)\]/.exec(dds);
    if (m && Number(m[1]) >= STEPS) {
      const [, d, h] = /(\d{8})T(\d{2})Z/.exec(file)!;
      return { file, runTime: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${h}:00:00Z` };
    }
  }
  throw new MepsError("Ingen komplett MEPS-körning hittades");
}

interface Block {
  y0: number;
  x0: number;
  /** values[var][t][dy][dx] */
  values: Record<MepsVariable, number[][][]>;
  times: number[];
}

async function fetchBlock(file: string, y0: number, y1: number, x0: number, x1: number): Promise<Block> {
  const sel = `[0:1:${STEPS - 1}][${y0}:1:${y1}][${x0}:1:${x1}]`;
  const query = MEPS_VARIABLES.map((v) => `${v}${sel}`).join(",");
  const text = await getText(`${DODS}/${file}.ascii?${encodeURIComponent(query).replace(/%2C/g, ",")}`, 3600);
  const { values, times } = parseAscii(text);
  for (const v of MEPS_VARIABLES) if (!values[v]) throw new MepsError(`Saknar ${v} i svaret`);
  return { y0, x0, values: values as Block["values"], times };
}

export interface MepsSample {
  /** ms (UTC) per tidssteg */
  times: number[];
  /** Per tidssteg: värden från rutor med sjöyta. */
  perStep: { ice: number[]; snow: number[]; surface: number[] }[];
  validCells: number;
  totalCells: number;
}

/** Hämtar MEPS-värden för gitterrutorna. Rutor utan sjöyta räknas inte. */
export async function sampleCells(file: string, cells: MepsCell[]): Promise<MepsSample> {
  const valid = cells.filter(isValidCell);
  if (valid.length === 0) throw new MepsError("Inga giltiga gitterrutor");
  const js = valid.map((c) => c[0]);
  const is = valid.map((c) => c[1]);
  const [y0, y1, x0, x1] = [Math.min(...js), Math.max(...js), Math.min(...is), Math.max(...is)];
  const boxed = (y1 - y0 + 1) * (x1 - x0 + 1) <= MAX_BOX;
  const blocks = boxed
    ? [await fetchBlock(file, y0, y1, x0, x1)]
    : await Promise.all(valid.map(([j, i]) => fetchBlock(file, j, j, i, i)));
  const lookup = (c: MepsCell) => blocks.find((b) => {
    const r = b.values.SFX_H_ICE[0];
    return c[0] >= b.y0 && c[0] < b.y0 + r.length && c[1] >= b.x0 && c[1] < b.x0 + r[0].length;
  })!;

  const times = blocks[0].times;
  const perStep = times.map(() => ({ ice: [] as number[], snow: [] as number[], surface: [] as number[] }));
  const lakeCells = new Set<string>();
  for (const c of valid) {
    const b = lookup(c);
    const dy = c[0] - b.y0;
    const dx = c[1] - b.x0;
    times.forEach((_, t) => {
      const ice = b.values.SFX_H_ICE[t]?.[dy]?.[dx];
      const snow = b.values.SFX_H_SNOW[t]?.[dy]?.[dx];
      const surf = b.values.SFX_TS_WATER[t]?.[dy]?.[dx];
      if (ice !== undefined && ice < FILL_LIMIT) {
        perStep[t].ice.push(ice);
        lakeCells.add(`${c[0]}:${c[1]}`);
      }
      if (snow !== undefined && snow < FILL_LIMIT) perStep[t].snow.push(snow);
      if (surf !== undefined && surf < FILL_LIMIT) perStep[t].surface.push(surf);
    });
  }
  return { times, perStep, validCells: lakeCells.size, totalCells: valid.length };
}

export const MEPS_SOURCE = {
  id: "met-meps",
  name: "MET Norway MEPS (FLake)",
  url: "https://thredds.met.no/thredds/catalog/mepslatest/catalog.html",
  license: "CC BY 4.0",
} as const;
