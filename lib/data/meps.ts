/**
 * MEPS sjöismodell (MET Norway). MODEL + FORECAST – aldrig observation.
 * Ej ansluten i V1. Ska senare hämtas server-side (API-route/jobb) och
 * cachas per modellkörning; klienten anropar bara denna funktion.
 */
import { SOURCES } from "@/lib/sources";
import type { Lake } from "@/types/lake";
import type { MepsRun } from "@/types/observations";
import type { DataResult } from "@/types/provenance";

/** Prognossteg som visas i sjöpanelen. */
export const MEPS_LEAD_TIMES_H = [24, 48, 66] as const;

export async function getMepsRun(_lake: Lake): Promise<DataResult<MepsRun>> {
  return { status: "not_connected", source: SOURCES.meps };
}
