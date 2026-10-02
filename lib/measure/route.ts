/** Ren geometri för mätverktyget (ingen I/O). Avstånd på jordklotet (haversine). */
import type { LngLat } from "@/types/lake";

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Avstånd i meter mellan två punkter. */
export function distanceM([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Kumulativ längd (m) vid varje punkt; första är 0. */
export function cumulativeM(points: LngLat[]): number[] {
  const out: number[] = [];
  let sum = 0;
  points.forEach((p, i) => {
    if (i > 0) sum += distanceM(points[i - 1], p);
    out.push(sum);
  });
  return out;
}

export function routeLengthM(points: LngLat[]): number {
  const c = cumulativeM(points);
  return c.length ? c[c.length - 1] : 0;
}

/** "420 m", "3,4 km", "12 km". */
export function formatLength(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`.replace(/^0 m$/, "0 m");
  const km = m / 1000;
  return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km)} km`;
}
