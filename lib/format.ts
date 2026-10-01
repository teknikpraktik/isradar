import type { LngLat } from "@/types/lake";
import type { DataTime, IsoDateTime } from "@/types/provenance";

const TZ = "Europe/Stockholm";

export function formatDateTime(iso: IsoDateTime): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "15 feb 2026" för ett kalenderdatum (YYYY-MM-DD). */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(".", "");
}

/** "12 min", "5 h", "3 d" – ålder relativt nu. */
export function formatAge(iso: IsoDateTime, now: Date = new Date()): string {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 48 * 3600) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

/** Kort beskrivning av när ett värde gäller, anpassad efter datakategori. */
export function describeTime(t: DataTime, now: Date = new Date()): string {
  switch (t.kind) {
    case "observation":
      return `Obs ${formatDateTime(t.observedAt)} (${formatAge(t.observedAt, now)} sedan)`;
    case "model":
      return `Modell ${formatDateTime(t.validAt)} · körning ${formatDateTime(t.modelRun)}`;
    case "forecast":
      return `Prognos +${t.leadTimeHours} h → ${formatDateTime(t.validAt)} · körning ${formatDateTime(t.modelRun)}`;
    case "historical_reference":
      return t.seasons ? `Säsonger ${t.seasons.from}–${t.seasons.to}` : t.method;
  }
}

export const KIND_LABEL: Record<DataTime["kind"], string> = {
  observation: "OBS",
  model: "MODELL",
  forecast: "PROGNOS",
  historical_reference: "HIST",
};

export const KIND_DESCRIPTION: Record<DataTime["kind"], string> = {
  observation: "Observation – uppmätt eller observerat värde",
  model: "Modell – modellens skattning av nuläget",
  forecast: "Prognos – modellens skattning framåt i tiden",
  historical_reference: "Historisk referens – statistik från tidigare säsonger",
};

export function formatCoord([lon, lat]: LngLat): string {
  return `${lat.toFixed(3)}° N  ${lon.toFixed(3)}° E`;
}

/** Storcirkelavstånd i km. */
export function distanceKm([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Gemener utan diakritiska tecken – för sökning ("vanern" hittar "Vänern"). */
export function normalizeForSearch(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}
