/**
 * Kopplar Skridskonätets temperaturstationer (measurepoint) till SMHI:s
 * meteorologiska observationsstationer, via koordinater.
 *
 *   node scripts/map-smhi-stations.mts
 *
 * Läser isradar_koldmangd/stations.csv och SMHI:s stationslista för
 * parameter 2 (dygnsmedeltemperatur), matchar varje station mot närmaste
 * AKTIVA SMHI-station inom MAX_DISTANCE_M och skriver data/stations/smhi.json.
 * Filen committas så att appen inte behöver researchdatan vid körning.
 *
 * SMHI Öppna data, licens CC BY 4.0 (https://www.smhi.se/data/oppna-data).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE = resolve(ROOT, process.env.ISRADAR_SOURCE_DIR ?? "isradar_koldmangd", "stations.csv");
const OUT = join(ROOT, "data", "stations", "smhi.json");
const SMHI_STATIONS = "https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/2.json";
const MAX_DISTANCE_M = 3000;

interface SmhiStation {
  key: string;
  name: string;
  active: boolean;
  latitude: number;
  longitude: number;
}

const distM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
};

const rows = readFileSync(SOURCE, "utf8")
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.split(","));

const smhi = ((await (await fetch(SMHI_STATIONS)).json()) as { station: SmhiStation[] }).station.filter(
  (s) => s.active,
);

const mapping = rows.map(([measurepoint, name, lat, lon]) => {
  let best: SmhiStation | null = null;
  let bestD = Infinity;
  for (const s of smhi) {
    const d = distM(+lat, +lon, s.latitude, s.longitude);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  const ok = best && bestD <= MAX_DISTANCE_M;
  if (!ok) console.warn(`[smhi] Ingen aktiv SMHI-station inom ${MAX_DISTANCE_M} m för ${name} (${measurepoint})`);
  return {
    measurepoint: Number(measurepoint),
    name,
    smhiId: ok ? best!.key : null,
    smhiName: ok ? best!.name : null,
    distanceM: ok ? Math.round(bestD) : null,
  };
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(mapping, null, 2) + "\n");
console.log(`[smhi] ${mapping.filter((m) => m.smhiId).length}/${mapping.length} stationer kopplade → ${OUT}`);
for (const m of mapping) console.log(`  ${m.name.padEnd(22)} → ${m.smhiName ?? "–"} (${m.smhiId ?? "–"}, ${m.distanceM ?? "–"} m)`);
