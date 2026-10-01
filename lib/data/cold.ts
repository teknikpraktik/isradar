/**
 * Köldmängd.
 *
 *  - Historisk köldmängd (HISTORICAL REFERENCE) – från Skridskonätets modell.
 *  - Aktuell köldmängd (OBSERVATION, härledd ur SMHI:s dygnsmedeltemperaturer
 *    vid sjöns temperaturstation) – via /api/cold/station/[measurepoint].
 */
import type { ApiError, StationColdAmountResponse } from "@/lib/cold/api";
import { COLLECTION_AREA_NOTE, canRenderColdDays } from "@/lib/map/coldScale";
import { SOURCES } from "@/lib/sources";
import type { HistoricalColdAmount, Lake, LakeIndexEntry } from "@/types/lake";
import type { ColdAmountObservation } from "@/types/observations";
import type { DataResult } from "@/types/provenance";


export const HISTORICAL_COLD_METHOD =
  "Median köldmängd vid första historiskt rapporterade åkning";

export function historicalColdAmountFromIndex(
  entry: LakeIndexEntry,
): HistoricalColdAmount | null {
  if (entry.hca === null) return null;
  return {
    amount: { value: entry.hca, unit: "GD" },
    provenance: {
      source: SOURCES.skridskonatet,
      // Vilka säsonger medianen bygger på framgår inte av källdatan – utelämnas.
      time: { kind: "historical_reference", method: HISTORICAL_COLD_METHOD },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Aktuell köldmängd                                                   */
/* ------------------------------------------------------------------ */

/** Många sjöar delar station – en förfrågan per station och datum räcker. */
const stationCache = new Map<string, Promise<StationColdAmountResponse>>();

export function fetchStationColdAmount(
  measurepoint: number,
  asOf?: string,
): Promise<StationColdAmountResponse> {
  const key = `${measurepoint}|${asOf ?? ""}`;
  let p = stationCache.get(key);
  if (!p) {
    const qs = asOf ? `?asOf=${encodeURIComponent(asOf)}` : "";
    p = fetch(`/api/cold/station/${measurepoint}${qs}`).then(async (res) => {
      const body = (await res.json()) as StationColdAmountResponse | ApiError;
      if (!res.ok || "error" in body) {
        throw new Error("error" in body ? body.error : `HTTP ${res.status}`);
      }
      return body;
    });
    p.catch(() => stationCache.delete(key));
    stationCache.set(key, p);
  }
  return p;
}

export async function getCurrentColdAmount(
  lake: Lake,
  asOf?: string,
): Promise<DataResult<ColdAmountObservation>> {
  if (!canRenderColdDays(lake.areaType)) {
    return { status: "not_applicable", reason: COLLECTION_AREA_NOTE };
  }
  const station = lake.temperatureStation;
  if (!station) {
    return { status: "unavailable", source: SOURCES.coldAmount, reason: "Ingen temperaturstation kopplad" };
  }
  try {
    const r = await fetchStationColdAmount(station.id, asOf);
    if (!r.lastDate || !r.observedAt) {
      return {
        status: "unavailable",
        source: SOURCES.coldAmount,
        reason: `Inga temperaturdygn ännu sedan säsongsstart ${r.seasonStart}`,
        code: "no_data_yet",
      };
    }
    const gd = (v: number | null) => (v === null ? null : { value: v, unit: "GD" as const });
    const qualityNotes = Object.entries(r.qualityCodes).map(([code, n]) => `SMHI kvalitetskod ${code}: ${n} dygn`);
    return {
      status: "ok",
      value: {
        lakeId: lake.id,
        stationId: station.id,
        measuringStation: { id: r.smhi.id, name: r.smhi.name },
        accumulated: { value: r.accumulated, unit: "GD" },
        seasonStart: `${r.seasonStart}T00:00:00Z`,
        change24h: gd(r.change24h),
        change7d: gd(r.change7d),
        missingDays: r.missingDays.length,
        methodDescription: r.method.description,
        provenance: {
          source: r.source,
          time: {
            kind: "observation",
            observedAt: r.observedAt,
            period: { from: `${r.seasonStart}T00:00:00Z`, to: r.observedAt },
          },
          retrievedAt: r.retrievedAt,
          quality: { notes: qualityNotes },
        },
      },
    };
  } catch (err) {
    return {
      status: "unavailable",
      source: SOURCES.coldAmount,
      reason: err instanceof Error ? err.message : "Okänt fel",
      code: "error",
    };
  }
}
