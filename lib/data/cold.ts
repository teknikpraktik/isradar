/**
 * Köldmängd.
 *
 *  - Historisk köldmängd (HISTORICAL REFERENCE) – från Skridskonätets modell, finns i V1.
 *  - Aktuell köldmängd (OBSERVATION, härledd ur stationstemperaturer) – ej ansluten.
 */
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

export async function getCurrentColdAmount(
  _lake: Lake,
): Promise<DataResult<ColdAmountObservation>> {
  return { status: "not_connected", source: SOURCES.coldAmount };
}
