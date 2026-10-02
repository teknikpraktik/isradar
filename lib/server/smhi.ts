/**
 * SMHI Öppna data – meteorologiska observationer (metobs). Endast server.
 * Licens: CC BY 4.0, https://www.smhi.se/data/oppna-data
 *
 * Dygnsmedeltemperatur = parameter 2 ("medelvärde 1 dygn, 1 gång/dygn, kl 00").
 * Perioder:
 *   latest-months      senaste ~4 månaderna (JSON), uppdateras löpande
 *   corrected-archive  kvalitetskontrollerat arkiv utom senaste ~3 mån (CSV)
 */
import "server-only";
import type { DailyMean, IsoDate } from "@/lib/cold/compute";

const BASE = "https://opendata-download-metobs.smhi.se/api/version/1.0";
const PARAM_DAILY_MEAN_TEMP = 2;

/** Cachetider (sekunder) för Next.js datacache. */
const REVALIDATE_LATEST = 3600;
const REVALIDATE_ARCHIVE = 86400;

export interface SmhiDailyMean extends DailyMean {
  /** SMHI:s kvalitetskod: G = kontrollerat och godkänt, Y = misstänkt eller aggregerat. */
  quality: string;
}

export class SmhiError extends Error {}

async function getJson<T>(url: string, revalidate: number): Promise<T> {
  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) throw new SmhiError(`SMHI svarade ${res.status} för ${url}`);
  return (await res.json()) as T;
}

async function getText(url: string, revalidate: number): Promise<string> {
  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) throw new SmhiError(`SMHI svarade ${res.status} för ${url}`);
  return res.text();
}

interface LatestMonthsResponse {
  value: { ref: string; value: string; quality: string }[] | null;
}

async function latestMonths(stationId: string): Promise<SmhiDailyMean[]> {
  const url = `${BASE}/parameter/${PARAM_DAILY_MEAN_TEMP}/station/${stationId}/period/latest-months/data.json`;
  const json = await getJson<LatestMonthsResponse>(url, REVALIDATE_LATEST);
  return (json.value ?? [])
    .map((v) => ({ date: v.ref, meanC: Number(v.value), quality: v.quality }))
    .filter((v) => Number.isFinite(v.meanC));
}

/** Rader i arkiv-CSV: "från;till;representativt dygn;värde;kvalitet;..." */
const ARCHIVE_ROW = /^\d{4}-\d{2}-\d{2} [\d:]+;[^;]+;(\d{4}-\d{2}-\d{2});(-?\d+(?:\.\d+)?);([A-Z])/;

async function correctedArchive(stationId: string, from: IsoDate): Promise<SmhiDailyMean[]> {
  const url = `${BASE}/parameter/${PARAM_DAILY_MEAN_TEMP}/station/${stationId}/period/corrected-archive/data.csv`;
  const csv = await getText(url, REVALIDATE_ARCHIVE);
  const out: SmhiDailyMean[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const m = ARCHIVE_ROW.exec(line);
    if (m && m[1] >= from) out.push({ date: m[1], meanC: Number(m[2]), quality: m[3] });
  }
  return out;
}

/**
 * Dygnsmedel för en station från och med `from`. Arkivet hämtas bara om
 * latest-months inte täcker hela perioden. Nyare data går före arkivet.
 */
export async function getDailyMeans(stationId: string, from: IsoDate): Promise<SmhiDailyMean[]> {
  const latest = await latestMonths(stationId);
  const earliestLatest = latest.reduce<IsoDate | null>((min, v) => (!min || v.date < min ? v.date : min), null);
  const archive =
    !earliestLatest || from < earliestLatest ? await correctedArchive(stationId, from) : [];

  const byDate = new Map<IsoDate, SmhiDailyMean>();
  for (const v of archive) byDate.set(v.date, v);
  for (const v of latest) if (v.date >= from) byDate.set(v.date, v);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const SMHI_SOURCE = {
  id: "smhi-metobs",
  name: "SMHI Öppna data, meteorologiska observationer",
  url: "https://www.smhi.se/data/oppna-data",
  license: "CC BY 4.0",
} as const;

/* ------------------------------------------------------------------ */
/* Timvärden senaste dygnet (väder)                                    */
/* ------------------------------------------------------------------ */

/** SMHI-parametrar som används för väder. */
export const SMHI_PARAM = {
  temperature: 1, // Lufttemperatur, momentanvärde 1 gång/tim (°C)
  precipitation: 7, // Nederbördsmängd, summa 1 timme (mm)
  windSpeed: 4, // Vindhastighet, medelvärde 10 min, 1 gång/tim (m/s)
  windDirection: 3, // Vindriktning, medelvärde 10 min, 1 gång/tim (grader)
  gust: 21, // Byvind, max, 1 gång/tim (m/s)
} as const;

const REVALIDATE_STATIONS = 86400;
const REVALIDATE_LATEST_DAY = 900;

export interface SmhiStationInfo {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Senaste tidpunkt med data (ms). */
  to: number;
}

async function stationsFor(param: number): Promise<SmhiStationInfo[]> {
  const json = await getJson<{
    station: { key: string; name: string; active: boolean; latitude: number; longitude: number; to: number }[];
  }>(`${BASE}/parameter/${param}.json`, REVALIDATE_STATIONS);
  return json.station
    .filter((s) => s.active)
    .map((s) => ({ id: s.key, name: s.name, lat: s.latitude, lon: s.longitude, to: s.to }));
}

export interface SmhiHourly {
  t: number;
  v: number;
  quality: string;
}

async function latestDay(param: number, stationId: string): Promise<SmhiHourly[]> {
  const url = `${BASE}/parameter/${param}/station/${stationId}/period/latest-day/data.json`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE_LATEST_DAY } });
  if (res.status === 404) return [];
  if (!res.ok) throw new SmhiError(`SMHI svarade ${res.status} för ${url}`);
  const json = (await res.json()) as { value: { date: number; value: string; quality: string }[] | null };
  return (json.value ?? [])
    .map((x) => ({ t: x.date, v: Number(x.value), quality: x.quality }))
    .filter((x) => Number.isFinite(x.v));
}

export const distKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
};

export interface NearestSeries {
  station: SmhiStationInfo & { distanceKm: number };
  values: SmhiHourly[];
}

/**
 * Timvärden senaste dygnet från närmaste aktiva station med parametern, inom
 * maxKm. Stationer utan data hoppas över (upp till `tries` st). null om ingen
 * station inom avståndet har data – då gissas inget.
 */
export async function nearestLatestDay(
  param: number,
  lat: number,
  lon: number,
  { maxKm = 50, tries = 3 } = {},
): Promise<NearestSeries | null> {
  const recent = Date.now() - 2 * 86_400_000;
  const candidates = (await stationsFor(param))
    .filter((s) => s.to >= recent)
    .map((s) => ({ ...s, distanceKm: distKm(lat, lon, s.lat, s.lon) }))
    .filter((s) => s.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, tries);
  for (const s of candidates) {
    const values = await latestDay(param, s.id);
    if (values.length) return { station: { ...s, distanceKm: Math.round(s.distanceKm) }, values };
  }
  return null;
}

/**
 * Som nearestLatestDay men för många punkter: varje station hämtas högst en
 * gång. Resultat i samma ordning som `points`; null = ingen station med data.
 */
export async function nearestLatestDayForPoints(
  param: number,
  points: { lat: number; lon: number }[],
  { maxKm = 50, tries = 3 } = {},
): Promise<(NearestSeries | null)[]> {
  const recent = Date.now() - 2 * 86_400_000;
  const stations = (await stationsFor(param)).filter((s) => s.to >= recent);
  const series = new Map<string, Promise<SmhiHourly[]>>();
  const load = (id: string) => {
    let p = series.get(id);
    if (!p) {
      p = latestDay(param, id).catch(() => []);
      series.set(id, p);
    }
    return p;
  };
  return Promise.all(
    points.map(async ({ lat, lon }) => {
      const candidates = stations
        .map((s) => ({ ...s, distanceKm: distKm(lat, lon, s.lat, s.lon) }))
        .filter((s) => s.distanceKm <= maxKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, tries);
      for (const s of candidates) {
        const values = await load(s.id);
        if (values.length) return { station: { ...s, distanceKm: Math.round(s.distanceKm) }, values };
      }
      return null;
    }),
  );
}

/** Timvärden för en given station (t.ex. vindriktning vid samma station som vindhastighet). */
export const latestDayForStation = latestDay;

/* ------------------------------------------------------------------ */
/* Punktprognos (snow1g)                                               */
/* ------------------------------------------------------------------ */

const FORECAST_BASE = "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1";
const REVALIDATE_FORECAST = 1800;

export interface SmhiForecastStep {
  t: number;
  airTemperature?: number;
  windSpeed?: number;
  windGust?: number;
  windFromDirection?: number;
  /** Medelnederbörd under timmen före t (mm). */
  precipitation?: number;
  /** Sannolikhet för fryst nederbörd, 0–1. */
  probabilityFrozenPrecipitation?: number;
  /** predominant_precipitation_type_at_surface, 0–12 (0 = ingen). */
  precipitationType?: number;
  /** precipitation_frozen_part, 0–100 % (−9 = ingen nederbörd → saknas). */
  frozenPartPct?: number;
}

export interface SmhiForecast {
  /** Modellkörningens referenstid. */
  referenceTime: string;
  createdTime: string;
  position: [number, number];
  steps: SmhiForecastStep[];
}

export async function pointForecast(lat: number, lon: number): Promise<SmhiForecast> {
  const f = (v: number) => v.toFixed(4);
  const url = `${FORECAST_BASE}/geotype/point/lon/${f(lon)}/lat/${f(lat)}/data.json`;
  const json = await getJson<{
    createdTime: string;
    referenceTime: string;
    geometry: { coordinates: [number, number] };
    timeSeries: { time: string; data: Record<string, number> }[];
  }>(url, REVALIDATE_FORECAST);
  // SMHI använder -9 som "saknas" i fält som aldrig kan vara negativa.
  // Temperatur kan vara negativ och tas därför som den är.
  const nonNeg = (v: number | undefined) => (typeof v === "number" && v >= 0 ? v : undefined);
  const any = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    referenceTime: json.referenceTime,
    createdTime: json.createdTime,
    position: json.geometry.coordinates,
    steps: json.timeSeries.map((s) => ({
      t: Date.parse(s.time),
      airTemperature: any(s.data.air_temperature),
      windSpeed: nonNeg(s.data.wind_speed),
      windGust: nonNeg(s.data.wind_speed_of_gust),
      windFromDirection: nonNeg(s.data.wind_from_direction),
      precipitation: nonNeg(s.data.precipitation_amount_mean),
      probabilityFrozenPrecipitation: nonNeg(s.data.probability_of_frozen_precipitation),
      precipitationType: nonNeg(s.data.predominant_precipitation_type_at_surface),
      frozenPartPct: nonNeg(s.data.precipitation_frozen_part),
    })),
  };
}

export const SMHI_FORECAST_SOURCE = {
  id: "smhi-snow1g",
  name: "SMHI Öppna data, punktprognos (snow1g)",
  url: "https://www.smhi.se/data/oppna-data",
  license: "CC BY 4.0",
} as const;

/* ------------------------------------------------------------------ */
/* Observation vid en given tidpunkt (satellitpassage)                 */

async function latestMonthsHourly(param: number, stationId: string): Promise<SmhiHourly[]> {
  const url = `${BASE}/parameter/${param}/station/${stationId}/period/latest-months/data.json`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (res.status === 404) return [];
  if (!res.ok) throw new SmhiError(`SMHI svarade ${res.status} för ${url}`);
  const json = (await res.json()) as { value: { date: number; value: string; quality: string }[] | null };
  return (json.value ?? [])
    .map((x) => ({ t: x.date, v: Number(x.value), quality: x.quality }))
    .filter((x) => Number.isFinite(x.v));
}

export interface SmhiWindAt {
  station: { name: string; distanceKm: number };
  t: number;
  speed: number;
  fromDirection: number | null;
  gust: number | null;
}

/**
 * Vindobservationer inom ±windowMs från `time` för de närmaste stationerna
 * (latest-months, ~4 månader). Riktning och byvind från samma station och timme.
 */
export async function smhiWindAt(
  lat: number,
  lon: number,
  time: number,
  { maxKm = 50, limit = 3, windowMs = 3_600_000 } = {},
): Promise<SmhiWindAt[]> {
  const stations = (await stationsFor(SMHI_PARAM.windSpeed))
    .filter((s) => s.to >= time - windowMs)
    .map((s) => ({ ...s, distanceKm: distKm(lat, lon, s.lat, s.lon) }))
    .filter((s) => s.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
  const near = (vs: SmhiHourly[]) => vs.filter((v) => Math.abs(v.t - time) <= windowMs);
  const per = await Promise.all(
    stations.map(async (s) => {
      const [speed, dir, gust] = await Promise.all(
        [SMHI_PARAM.windSpeed, SMHI_PARAM.windDirection, SMHI_PARAM.gust].map((p) =>
          latestMonthsHourly(p, s.id).then(near, () => [] as SmhiHourly[]),
        ),
      );
      return speed.map((v) => ({
        station: { name: s.name, distanceKm: Math.round(s.distanceKm) },
        t: v.t,
        speed: v.v,
        fromDirection: dir.find((d) => d.t === v.t)?.v ?? null,
        gust: gust.find((g) => g.t === v.t)?.v ?? null,
      }));
    }),
  );
  return per.flat();
}
