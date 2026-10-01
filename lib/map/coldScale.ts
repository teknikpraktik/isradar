/**
 * Klassning och färger för KÖLDMÄNGD (GD). Enda stället där klassgränser,
 * färger och etiketter definieras – karta, legend, sidopanel och info-dialog
 * läser härifrån.
 *
 * Färgen visar ENDAST ackumulerad köldmängd – en temperaturbaserad indikator.
 * Den säger inte om is finns, hur den är eller om den är säker. Skalan är
 * därför en enda blå ljushetsramp (ljus = låg GD, mörk = hög GD) utan
 * röd/orange/grön som signalerar risk eller säkerhet.
 *
 * Färgerna är valda mot den mörka baskartan (bakgrund #0c1015, kartvatten
 * #17222d): även den mörkaste klassen ska tydligt läsas som vatten.
 *
 * Intervallen (beslut 2026-10-01) valdes efter fördelningen i Värmland
 * (261 vatten, median 59 GD): <30: 57, 30–50: 45, 50–80: 64, 80–120: 64,
 * ≥120: 31. Ändra här om det finns empiriskt stöd för bättre brytpunkter.
 */
import type { ExpressionSpecification } from "maplibre-gl";
import type { WaterModelType } from "@/types/lake";

export interface ColdDayClass {
  /** Inklusive. */
  min: number;
  /** Exklusive. null = ingen övre gräns. */
  max: number | null;
  label: string;
  color: string;
}

export const COLD_DAY_CLASSES: readonly ColdDayClass[] = [
  { min: 0, max: 30, label: "< 30", color: "#dbe9f0" },
  { min: 30, max: 50, label: "30–50", color: "#a8cfe3" },
  { min: 50, max: 80, label: "50–80", color: "#72add3" },
  { min: 80, max: 120, label: "80–120", color: "#4a88c0" },
  { min: 120, max: null, label: "≥ 120", color: "#3a6aa8" },
];

/** Stor sjö, öppet vatten: medvetet ej GD-klassificerad. Neutral, inte blå. */
export const OPEN_WATER_STYLE = {
  label: "Ej klassificerad (stor sjö, öppet vatten)",
  fill: "#3a454e",
  hatch: "#5d6a74",
} as const;

/** Standardsjö där GD-värde saknas i källdatan. Endast kontur, ingen fyllning. */
export const NO_VALUE_STYLE = {
  label: "Värde saknas",
  line: "#7d8995",
} as const;

export const COLD_INDICATOR_NOTE = "Temperaturbaserad indikator – säger inte om is finns eller är säker.";

export function coldDayClassFor(gd: number): ColdDayClass {
  return COLD_DAY_CLASSES.find((c) => gd >= c.min && (c.max === null || gd < c.max)) ?? COLD_DAY_CLASSES[0];
}

/* ------------------------------------------------------------------ */
/* MapLibre-uttryck                                                    */
/* ------------------------------------------------------------------ */

const OPEN: WaterModelType = "LARGE_LAKE_OPEN_WATER";

function stepExpression(property: string) {
  return [
    "step",
    ["get", property],
    COLD_DAY_CLASSES[0].color,
    ...COLD_DAY_CLASSES.slice(1).flatMap((c) => [c.min, c.color]),
  ];
}

/**
 * Fyllnadsfärg för ett GD-fält (default "hca" = historisk köldmängd).
 * Parametriserat så att samma klassning kan användas för t.ex. aktuell
 * köldmängd som eget kartlager senare.
 */
export function coldFillColor(property = "hca"): ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "modelType"], OPEN],
    OPEN_WATER_STYLE.fill,
    ["==", ["get", property], null],
    "rgba(0,0,0,0)",
    stepExpression(property),
  ] as unknown as ExpressionSpecification;
}

export function coldLineColor(property = "hca"): ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "modelType"], OPEN],
    OPEN_WATER_STYLE.hatch,
    ["==", ["get", property], null],
    NO_VALUE_STYLE.line,
    stepExpression(property),
  ] as unknown as ExpressionSpecification;
}

/** Filter för vatten som INTE klassificeras med GD. */
export const isOpenWaterFilter = ["==", ["get", "modelType"], OPEN] as unknown as ExpressionSpecification;
