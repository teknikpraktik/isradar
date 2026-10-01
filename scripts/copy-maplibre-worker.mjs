/**
 * MapLibre GL 6 laddar sin web worker relativt `import.meta.url`, vilket inte
 * fungerar efter att Next.js bundlat biblioteket. Vi kopierar därför worker-
 * filerna till public/vendor/maplibre/ och pekar ut dem med setWorkerUrl()
 * (se lib/map/maplibre.ts). Körs automatiskt via predev/prebuild.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = join(root, "node_modules", "maplibre-gl", "dist");
const dest = join(root, "public", "vendor", "maplibre");

mkdirSync(dest, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(src, file), join(dest, file));
}
console.log("[maplibre] worker kopierad till public/vendor/maplibre/");
