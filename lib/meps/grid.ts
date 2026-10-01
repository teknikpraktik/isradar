/**
 * MEPS 2,5 km-gitter (MET Norway / MetCoOp), Lambert conformal conic på sfär.
 * Parametrar från projection_lambert och x/y i meps_det_2_5km_*.ncml;
 * verifierat mot gittrets longitude/latitude (avvikelse < 1 mm).
 */

export const MEPS_GRID = {
  nx: 949,
  ny: 1069,
  dx: 2500,
  x0: -1060084.0,
  y0: -1332517.9,
  earthRadius: 6371000,
  standardParallel: 63.3,
  centralMeridian: 15.0,
} as const;

/** [y, x] – index i MEPS-gittret. */
export type MepsCell = [number, number];

const rad = Math.PI / 180;
const phi0 = MEPS_GRID.standardParallel * rad;
const n = Math.sin(phi0);
const F = (Math.cos(phi0) * Math.tan(Math.PI / 4 + phi0 / 2) ** n) / n;
const rho0 = (MEPS_GRID.earthRadius * F) / Math.tan(Math.PI / 4 + phi0 / 2) ** n;

/** WGS84 lon/lat → projicerade x/y (m). */
export function lonLatToMeps(lon: number, lat: number): [number, number] {
  const rho = (MEPS_GRID.earthRadius * F) / Math.tan(Math.PI / 4 + (lat * rad) / 2) ** n;
  const theta = n * (lon * rad - MEPS_GRID.centralMeridian * rad);
  return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)];
}

/** Gitterruta vars mittpunkt ligger närmast lon/lat, eller null utanför gittret. */
export function nearestCell(lon: number, lat: number): MepsCell | null {
  const [x, y] = lonLatToMeps(lon, lat);
  const i = Math.round((x - MEPS_GRID.x0) / MEPS_GRID.dx);
  const j = Math.round((y - MEPS_GRID.y0) / MEPS_GRID.dx);
  return i >= 0 && i < MEPS_GRID.nx && j >= 0 && j < MEPS_GRID.ny ? [j, i] : null;
}

/** Inversa projektionen: gitterrutans mittpunkt → [lon, lat]. */
export function cellCenter([j, i]: MepsCell): [number, number] {
  const x = MEPS_GRID.x0 + i * MEPS_GRID.dx;
  const y = MEPS_GRID.y0 + j * MEPS_GRID.dx;
  const dy = rho0 - y;
  const rho = Math.sign(n) * Math.hypot(x, dy);
  const theta = Math.atan2(x, dy);
  const lat = 2 * Math.atan((MEPS_GRID.earthRadius * F / rho) ** (1 / n)) - Math.PI / 2;
  return [MEPS_GRID.centralMeridian + theta / n / rad, lat / rad];
}

export const isValidCell = ([j, i]: MepsCell) =>
  Number.isInteger(j) && Number.isInteger(i) && j >= 0 && j < MEPS_GRID.ny && i >= 0 && i < MEPS_GRID.nx;
