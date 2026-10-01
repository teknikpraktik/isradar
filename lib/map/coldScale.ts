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
import type { AreaType } from "@/types/lake";

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

/**
 * Samlingsområde (COLLECTION_AREA): medvetet ej GD-färgsatt. Lågmäld blågrå,
 * ingen av GD-skalans färger och tydligt ljusare än kartans vatten (#17222d).
 */
export const COLLECTION_AREA_STYLE = {
  label: "Områdespolygon – ej GD-klassificerad",
  fill: "#4b5a66",
  fillOpacity: 0.55,
  line: "#6c7a86",
} as const;

/** Vatten där GD-värde saknas i källdatan. Endast kontur, ingen fyllning. */
export const NO_VALUE_STYLE = {
  label: "Värde saknas",
  line: "#7d8995",
} as const;

export const COLD_INDICATOR_NOTE = "Temperaturbaserad indikator – säger inte om is finns eller är säker.";

export const COLLECTION_AREA_NOTE =
  "Området omfattar flera olika vattenmiljöer och färgklassificeras därför inte med ett gemensamt GD-värde.";

export function coldDayClassFor(gd: number): ColdDayClass {
  return COLD_DAY_CLASSES.find((c) => gd >= c.min && (c.max === null || gd < c.max)) ?? COLD_DAY_CLASSES[0];
}

/* ------------------------------------------------------------------ */
/* Central regel: får objektet GD-färg?                                */
/* ------------------------------------------------------------------ */

/** WATER och SUBAREA kan GD-färgsättas, COLLECTION_AREA aldrig. */
export function canRenderColdDays(areaType: AreaType): boolean {
  return areaType !== "COLLECTION_AREA";
}

/**
 * De tre fallen hålls strikt isär:
 *   class          – värde finns (även 0 GD) → GD-klass
 *   missing        – värdet är okänt
 *   not_applicable – GD används medvetet inte (COLLECTION_AREA)
 */
export type ColdDayStyle =
  | { kind: "class"; gd: number; cls: ColdDayClass }
  | { kind: "missing" }
  | { kind: "not_applicable" };

export function getColdDayStyle(areaType: AreaType, gd: number | null | undefined): ColdDayStyle {
  if (!canRenderColdDays(areaType)) return { kind: "not_applicable" };
  if (gd === null || gd === undefined || !Number.isFinite(gd)) return { kind: "missing" };
  return { kind: "class", gd, cls: coldDayClassFor(gd) };
}

/* ------------------------------------------------------------------ */
/* MapLibre-uttryck                                                    */
/* ------------------------------------------------------------------ */

const COLLECTION: AreaType = "COLLECTION_AREA";
const isCollection = ["==", ["get", "areaType"], COLLECTION];

function stepExpression(property: string) {
  return [
    "step",
    ["get", property],
    COLD_DAY_CLASSES[0].color,
    ...COLD_DAY_CLASSES.slice(1).flatMap((c) => [c.min, c.color]),
  ];
}

/*
 * MapLibre-motsvarigheten till getColdDayStyle – samma ordning:
 * not_applicable (COLLECTION_AREA) → missing (null) → GD-klass.
 * property = GD-fält (default "hca" = historisk), parametriserat för framtida
 * kartlager med t.ex. aktuell köldmängd.
 */
export function coldFillColor(property = "hca"): ExpressionSpecification {
  return [
    "case",
    isCollection,
    COLLECTION_AREA_STYLE.fill,
    ["==", ["get", property], null],
    "rgba(0,0,0,0)",
    stepExpression(property),
  ] as unknown as ExpressionSpecification;
}

export function coldLineColor(property = "hca"): ExpressionSpecification {
  return [
    "case",
    isCollection,
    COLLECTION_AREA_STYLE.line,
    ["==", ["get", property], null],
    NO_VALUE_STYLE.line,
    stepExpression(property),
  ] as unknown as ExpressionSpecification;
}

/** Filter för objekt som inte GD-färgsätts. */
export const isCollectionAreaFilter = isCollection as unknown as ExpressionSpecification;
