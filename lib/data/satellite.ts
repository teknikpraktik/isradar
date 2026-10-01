/**
 * Sentinel-observationer av is/vatten per sjö. OBSERVATION.
 * Ej ansluten i V1.
 *
 * Inför ICE SCOUT: förändringsanalys (t.ex. störst förändring i isandel
 * senaste 24/48/72 h) ska göras regionsvis på serversidan över en tidsserie,
 * inte genom att klienten hämtar varje sjö. Därför returnerar API:t här en
 * enskild observation, och tidsserier får en egen funktion när de behövs.
 */
import { SOURCES } from "@/lib/sources";
import type { Lake } from "@/types/lake";
import type { SatelliteObservation } from "@/types/observations";
import type { DataResult } from "@/types/provenance";

export async function getLatestSatelliteObservation(
  _lake: Lake,
): Promise<DataResult<SatelliteObservation>> {
  return { status: "not_connected", source: SOURCES.sentinel };
}
