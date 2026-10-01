/**
 * Neutral färgskala för HISTORISK köldmängd.
 *
 * Detta är enbart en visualisering av ett historiskt referensvärde. Skalan är
 * medvetet enfärgad (en blågrå ljushetsramp) för att inte likna en
 * säkerhetsklassning – inga trafikljusfärger.
 *
 * Intervallen är valda efter fördelningen i Värmlandsdatan (261 vatten inom
 * länsgränsen, p25 32, median 59, p75 93 GD) så att klasserna blir ungefär
 * jämnstora:  <30: 57   30–50: 45   50–80: 64   80–120: 64   ≥120: 31
 * Se över intervallen när fler regioner läggs till.
 */
import type { ExpressionSpecification } from "maplibre-gl";

export const COLD_BREAKS = [30, 50, 80, 120] as const;

export const COLD_COLORS = [
  "#c4dbe6",
  "#8fb8cc",
  "#5f93ad",
  "#3f7090",
  "#2a4f6b",
] as const;

export const NO_VALUE_COLOR = "#5b6670";

export interface ColdClass {
  label: string;
  color: string;
}

export const COLD_CLASSES: ColdClass[] = COLD_COLORS.map((color, i) => {
  const lo = COLD_BREAKS[i - 1];
  const hi = COLD_BREAKS[i];
  const label =
    lo === undefined ? `< ${hi}` : hi === undefined ? `≥ ${lo}` : `${lo}–${hi}`;
  return { label, color };
});

/** MapLibre-uttryck: färg efter properties.hca. */
export const coldColorExpression = [
  "case",
  ["==", ["get", "hca"], null],
  NO_VALUE_COLOR,
  [
    "step",
    ["get", "hca"],
    COLD_COLORS[0],
    ...COLD_BREAKS.flatMap((b, i) => [b, COLD_COLORS[i + 1]]),
  ],
] as unknown as ExpressionSpecification;
