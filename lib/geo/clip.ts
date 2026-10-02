/**
 * Klippning av polygoner mot en rektangel (lon/lat, plan approximation).
 * Sutherland–Hodgman per ring; hål som hamnar utanför rutan försvinner. Ren
 * logik utan I/O.
 */
import type { MultiPolygon, Polygon, Position } from "geojson";

/** [väst, syd, öst, nord] */
export type Box = [number, number, number, number];

type Edge = (p: Position) => boolean;
type Cross = (a: Position, b: Position) => Position;

function clipRingAgainst(ring: Position[], inside: Edge, cross: Cross): Position[] {
  const out: Position[] = [];
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i];
    const prev = ring[(i + ring.length - 1) % ring.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(cross(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(cross(prev, cur));
    }
  }
  return out;
}

/** Klipper en (öppen eller sluten) ring mot rutan. Returnerar sluten ring eller null. */
export function clipRingToBox(ringIn: Position[], [w, s, e, n]: Box): Position[] | null {
  let ring = ringIn.length > 1 && ringIn[0][0] === ringIn[ringIn.length - 1][0] && ringIn[0][1] === ringIn[ringIn.length - 1][1]
    ? ringIn.slice(0, -1)
    : ringIn.slice();
  const ix = (a: Position, b: Position, x: number): Position => [x, a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1])];
  const iy = (a: Position, b: Position, y: number): Position => [a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), y];
  const steps: [Edge, Cross][] = [
    [(p) => p[0] >= w, (a, b) => ix(a, b, w)],
    [(p) => p[0] <= e, (a, b) => ix(a, b, e)],
    [(p) => p[1] >= s, (a, b) => iy(a, b, s)],
    [(p) => p[1] <= n, (a, b) => iy(a, b, n)],
  ];
  for (const [inside, cross] of steps) {
    ring = clipRingAgainst(ring, inside, cross);
    if (ring.length < 3) return null;
  }
  return [...ring, ring[0]];
}

/** Ringens area i grader² (tecknad: positiv = moturs). */
export function ringSignedArea(ring: Position[]): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}

/** Ungefärlig area i km² för en polygon (yttre ring minus hål). */
export function polygonAreaKm2(rings: Position[][]): number {
  const km = (ring: Position[]) => {
    const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return Math.abs(ringSignedArea(ring)) * 111.32 * Math.cos((lat * Math.PI) / 180) * 110.574;
  };
  return rings.reduce((sum, r, i) => sum + (i === 0 ? km(r) : -km(r)), 0);
}

const MIN_RING_AREA = 1e-12;

/** Klipper en polygon (yttre ring + hål). null om inget återstår. */
export function clipPolygonToBox(rings: Position[][], box: Box): Position[][] | null {
  const outer = clipRingToBox(rings[0], box);
  if (!outer || Math.abs(ringSignedArea(outer)) < MIN_RING_AREA) return null;
  const holes = rings
    .slice(1)
    .map((h) => clipRingToBox(h, box))
    .filter((h): h is Position[] => !!h && Math.abs(ringSignedArea(h)) >= MIN_RING_AREA);
  return [outer, ...holes];
}

/** Klipper Polygon/MultiPolygon. null om inget återstår. */
export function clipGeometryToBox(g: Polygon | MultiPolygon, box: Box): Polygon | MultiPolygon | null {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  const out = polys.map((p) => clipPolygonToBox(p, box)).filter((p): p is Position[][] => p !== null);
  if (out.length === 0) return null;
  return out.length === 1 ? { type: "Polygon", coordinates: out[0] } : { type: "MultiPolygon", coordinates: out };
}

/** Omslutande rektangel för Polygon/MultiPolygon. */
export function geometryBox(g: Polygon | MultiPolygon): Box {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polys) for (const [x, y] of p[0]) [w, s, e, n] = [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
  return [w, s, e, n];
}

/** Geometrins area i km². */
export function geometryAreaKm2(g: Polygon | MultiPolygon): number {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.reduce((sum, p) => sum + polygonAreaKm2(p), 0);
}
