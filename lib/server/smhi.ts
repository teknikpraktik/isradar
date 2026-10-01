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
