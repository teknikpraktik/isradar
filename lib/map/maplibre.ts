/**
 * Laddar MapLibre dynamiskt (biblioteket rör window/WebGL och får inte
 * evalueras vid server-rendering) och pekar ut worker-filen som
 * scripts/copy-maplibre-worker.mjs lagt i public/.
 */
export type MapLibre = typeof import("maplibre-gl");

let loading: Promise<MapLibre> | null = null;

export function loadMapLibre(): Promise<MapLibre> {
  loading ??= import("maplibre-gl").then((lib) => {
    lib.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
    return lib;
  });
  return loading;
}
