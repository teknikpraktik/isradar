/**
 * Sentinel-1-adapter för Förmodad åkbarhet.
 *
 * TODO (datakälla oklar): idag visas Sentinel-1 bara som rasterlager (titiler,
 * turbo-färgskala) och det finns INGET numeriskt värde per sjö i koden. För att
 * koppla in signalen behövs backscatter-statistik över sjöns polygon, t.ex. via
 * titilers statistics-endpoint för senaste SAR-scen, översatt till en
 * normaliserad gynnsamhet 0–1 (mörkblå = låg respons/slät yta = gynnsam).
 * Tolkningen (gränsvärden dB → 0–1) ska ligga HÄR och enbart här.
 *
 * Tills dess returneras null = "data saknas" – aldrig ett negativt värde.
 */
import type { LakeId } from "@/types/lake";
import type { SentinelIndication } from "./types";

export async function getSentinelIndications(lakeIds: LakeId[]): Promise<Map<LakeId, SentinelIndication | null>> {
  return new Map(lakeIds.map((id) => [id, null]));
}
