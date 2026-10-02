/**
 * Sätter ihop indata per gridcell och beräknar Vänernmodellen för alla celler.
 * Ren logik – hämtningen ligger i lib/data/vanern.ts.
 */
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { SentinelPassRef, SentinelCellStats } from "./api.ts";
import type { VanernCell } from "./grid.ts";
import { calculateVanernRideability, type VanernCellResult } from "./score.ts";
import type { SentinelCellInput, SentinelPassStats } from "./sentinel.ts";
import type { WeatherContextSummary } from "./weatherContext.ts";

export interface VanernContext {
  /** Aktuell köldmängd i % av historisk referens per vattenobjekt. */
  coldPercentByArea: Map<number, number | null>;
  weatherByTile: Map<string, WeatherContextSummary>;
  /** [0] senaste pass, [1] föregående (båda valfria). */
  passes: Pick<SentinelPassRef, "key" | "time" | "windMs">[];
  sentinelByCell: Map<string, Record<string, SentinelCellStats | null>>;
}

function passStats(ctx: VanernContext, cellId: string, idx: number): SentinelPassStats | null {
  const pass = ctx.passes[idx];
  const s = pass ? ctx.sentinelByCell.get(cellId)?.[pass.key] : null;
  return pass && s ? { time: pass.time, windMs: pass.windMs, ...s } : null;
}

export function computeVanernCells(cells: VanernCell[], ctx: VanernContext, now: Date = new Date()): Map<string, VanernCellResult> {
  const out = new Map<string, VanernCellResult>();
  for (const cell of cells) {
    const sentinel: SentinelCellInput = { latest: passStats(ctx, cell.id, 0), previous: passStats(ctx, cell.id, 1) };
    out.set(
      cell.id,
      calculateVanernRideability(
        {
          coldPercent: ctx.coldPercentByArea.get(cell.areaId) ?? null,
          weather: ctx.weatherByTile.get(cell.weatherTile) ?? null,
          sentinel,
        },
        now,
      ),
    );
  }
  return out;
}

/**
 * Kartfeatures för cellerna. `id` = vattenobjektets objektid (så att klick väljer
 * objektet som vanligt), `zone` = cellens id, `rcat` = kategori (samma id och färger som sjömodellen).
 */
export function vanernCellFeatures(
  cells: VanernCell[],
  results: Map<string, VanernCellResult>,
): FeatureCollection<Polygon | MultiPolygon> {
  return {
    type: "FeatureCollection",
    features: cells.map(
      (c, i): Feature<Polygon | MultiPolygon> => ({
        type: "Feature",
        id: i,
        geometry: c.geometry,
        properties: { id: c.areaId, zone: c.id, areaType: "WATER", rcat: results.get(c.id)?.category ?? "insufficient" },
      }),
    ),
  };
}
