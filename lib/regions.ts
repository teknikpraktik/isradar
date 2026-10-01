import type { RegionDefinition } from "@/types/region";
import varmland from "@/data/regions/varmland.json";

/**
 * Registrerade regioner. Under utvecklingen finns bara Värmland, men inget i
 * appen är bundet till den – lägg till en ny fil i data/regions/, registrera
 * den här och kör `npm run data`.
 */
const REGIONS: Record<string, RegionDefinition> = {
  varmland: varmland as RegionDefinition,
};

export const DEFAULT_REGION_ID = process.env.NEXT_PUBLIC_ISRADAR_REGION ?? "varmland";

export function getRegion(id: string = DEFAULT_REGION_ID): RegionDefinition {
  const region = REGIONS[id];
  if (!region) throw new Error(`Okänd region: ${id}`);
  return region;
}
