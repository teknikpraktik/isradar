/**
 * Trafikverket VViS (vägväderstationer) via Trafikverkets öppna API. Endast server.
 *   https://api.trafikinfo.trafikverket.se/v2/data.json
 *   namespace road.weatherinfo, schemaversion 2.1
 *   WeatherMeasurepoint – stationer + senaste mätning
 *   WeatherObservation  – mätningar (var 5:e minut, ~24 h bakåt)
 *
 * Nyckel: TRAFIKVERKET_API_KEY. Utan den används Trafikverkets publika
 * "demokey", som är avsedd för test – skaffa egen nyckel för produktion.
 *
 * Vägytetemperatur (Surface.Temperature) hämtas INTE till väderdelen och ska
 * inte användas som proxy för sjö/is utan separat beslut.
 */
import "server-only";
import type { HourlyValue } from "@/lib/weather/compute";
import { isValid, toHourly, type ObservationParameter, type ObservationStationRef, type StationSeries } from "@/lib/weather/stations";

const API = "https://api.trafikinfo.trafikverket.se/v2/data.json";
const KEY = process.env.TRAFIKVERKET_API_KEY ?? "demokey";
const REVALIDATE_STATIONS = 21600;
const REVALIDATE_OBS = 600;
const RECENT_MS = 3 * 3_600_000;

let warned = false;

export class VvisError extends Error {}

const esc = (s: string) => s.replace(/[<>&"]/g, "");

async function query<T>(objecttype: string, inner: string, revalidate: number): Promise<T[]> {
  if (KEY === "demokey" && !warned) {
    warned = true;
    console.warn("[vvis] TRAFIKVERKET_API_KEY saknas – använder Trafikverkets demokey (endast för test).");
  }
  const body = `<REQUEST><LOGIN authenticationkey="${esc(KEY)}"/><QUERY objecttype="${objecttype}" namespace="road.weatherinfo" schemaversion="2.1">${inner}</QUERY></REQUEST>`;
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
    next: { revalidate },
  });
  if (!res.ok) throw new VvisError(`Trafikverket svarade ${res.status}`);
  const json = (await res.json()) as { RESPONSE?: { RESULT?: Record<string, unknown>[] } };
  const result = json.RESPONSE?.RESULT?.[0] ?? {};
  if ("ERROR" in result) throw new VvisError(`Trafikverket: ${JSON.stringify(result.ERROR)}`);
  return (result[objecttype] as T[] | undefined) ?? [];
}

interface Measurepoint {
  Id: string;
  Name: string;
  Geometry?: { WGS84?: string };
  Observation?: { Sample?: string };
  Deleted?: boolean;
}

export interface VvisStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  latestSample: number | null;
}

/** Alla aktiva VViS-stationer (hela landet, ett anrop, cache 6 h). */
export async function vvisStations(): Promise<VvisStation[]> {
  const rows = await query<Measurepoint>(
    "WeatherMeasurepoint",
    "<FILTER><EQ name=\"Deleted\" value=\"false\"/></FILTER><INCLUDE>Id</INCLUDE><INCLUDE>Name</INCLUDE><INCLUDE>Geometry.WGS84</INCLUDE><INCLUDE>Observation.Sample</INCLUDE>",
    REVALIDATE_STATIONS,
  );
  return rows.flatMap((r) => {
    const m = /POINT \(([-\d.]+) ([-\d.]+)\)/.exec(r.Geometry?.WGS84 ?? "");
    if (!m) return [];
    const t = r.Observation?.Sample ? Date.parse(r.Observation.Sample) : NaN;
    return [{ id: String(r.Id), name: r.Name, lon: Number(m[1]), lat: Number(m[2]), latestSample: Number.isFinite(t) ? t : null }];
  });
}

interface ObservationRow {
  Measurepoint?: { Id?: number | string };
  Sample?: string;
  Air?: { Temperature?: { Value?: number } };
  Wind?: { Speed?: { Value?: number }; Direction?: { Value?: number } }[];
  Aggregated5minutes?: { Precipitation?: { TotalWaterEquivalent?: { Value?: number } } };
  Aggregated10minutes?: { Wind?: { SpeedMax?: { Value?: number } } };
}

/**
 * 24 h-serier för de givna stationerna, normaliserade till timvärden per
 * parameter. Ett anrop för alla stationer.
 */
export async function vvisSeries(
  stations: ObservationStationRef[],
  from: number,
): Promise<StationSeries[]> {
  if (stations.length === 0) return [];
  const ids = stations.map((s) => `<EQ name="Measurepoint.Id" value="${esc(s.id)}"/>`).join("");
  // Fönstrets start avrundas till timme så att anropet cachas.
  const fromIso = new Date(Math.floor(from / 3_600_000) * 3_600_000).toISOString();
  const rows = await query<ObservationRow>(
    "WeatherObservation",
    `<FILTER><AND><OR>${ids}</OR><GT name="Sample" value="${fromIso}"/></AND></FILTER>` +
      ["Measurepoint.Id", "Sample", "Air.Temperature.Value", "Wind.Speed.Value", "Wind.Direction.Value",
        "Aggregated5minutes.Precipitation.TotalWaterEquivalent.Value", "Aggregated10minutes.Wind.SpeedMax.Value"]
        .map((f) => `<INCLUDE>${f}</INCLUDE>`)
        .join(""),
    REVALIDATE_OBS,
  );

  const raw = new Map<string, Record<ObservationParameter, HourlyValue[]>>();
  for (const r of rows) {
    const id = String(r.Measurepoint?.Id ?? "");
    const t = r.Sample ? Date.parse(r.Sample) : NaN;
    if (!id || !Number.isFinite(t)) continue;
    const m = raw.get(id) ?? raw.set(id, { temperature: [], precipitation: [], windSpeed: [], windDirection: [], gust: [] }).get(id)!;
    const add = (p: ObservationParameter, v: unknown) => isValid(p, v) && m[p].push({ t, v });
    add("temperature", r.Air?.Temperature?.Value);
    add("precipitation", r.Aggregated5minutes?.Precipitation?.TotalWaterEquivalent?.Value);
    add("windSpeed", r.Wind?.[0]?.Speed?.Value);
    add("windDirection", r.Wind?.[0]?.Direction?.Value);
    add("gust", r.Aggregated10minutes?.Wind?.SpeedMax?.Value);
  }

  const mode: Record<ObservationParameter, "instant" | "sum" | "max"> = {
    temperature: "instant",
    precipitation: "sum",
    windSpeed: "instant",
    windDirection: "instant",
    gust: "max",
  };
  return stations.flatMap((station) => {
    const m = raw.get(station.id);
    if (!m) return [];
    return (Object.keys(mode) as ObservationParameter[])
      .filter((p) => m[p].length > 0)
      .map((p) => ({ station, parameter: p, values: toHourly(m[p], mode[p]) }));
  });
}

/** Aktuella stationer inom maxKm, närmast först. */
export function nearbyVvis(
  all: VvisStation[],
  lat: number,
  lon: number,
  distKm: (a: number, b: number, c: number, d: number) => number,
  { maxKm = 50, limit = 3 } = {},
): ObservationStationRef[] {
  const now = Date.now();
  return all
    .filter((s) => s.latestSample !== null && now - s.latestSample < RECENT_MS)
    .map((s) => ({ s, d: distKm(lat, lon, s.lat, s.lon) }))
    .filter((x) => x.d <= maxKm)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ s, d }) => ({ id: s.id, source: "TRAFIKVERKET_VVIS" as const, name: s.name, lat: s.lat, lon: s.lon, distanceKm: Math.round(d) }));
}

export const VVIS_SOURCE = {
  id: "trafikverket-vvis",
  name: "Trafikverket VViS",
  url: "https://data.trafikverket.se",
} as const;
