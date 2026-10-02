import type { DataSource } from "@/types/provenance";

/** Kända datakällor. Endast Skridskonätet är i bruk i V1. */
export const SOURCES = {
  skridskonatet: {
    id: "skridskonatet",
    name: "Skridskonätet (köldmängdsmodell)",
    url: "https://www.solstaskaret.se/skridskonet/koldmangd/koldmangd.html",
  },
  coldAmount: { id: "isvak-cold", name: "Aktuell köldmängd" },
  meps: { id: "met-meps", name: "MEPS sjöismodell" },
  sentinel: { id: "copernicus-sentinel", name: "Copernicus Sentinel" },
  weather: { id: "weather", name: "Väderdata" },
} as const satisfies Record<string, DataSource>;
