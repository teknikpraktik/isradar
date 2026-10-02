/**
 * Köldmängd på kartan. Enda stället där progressklasser, färger och
 * statustexter definieras – karta, info-kontroll, sidopanel och info-dialog
 * läser härifrån.
 *
 * Låst semantik (beslut 2026-10-02):
 *   Etikett  = historisk referens-GD ("Värmeln 56").
 *   Färg     = aktuell köldmängd / historisk referens (progress).
 * Historisk GD styr aldrig färgen direkt – två vatten på samma relativa nivå
 * får samma färg oavsett referensvärde.
 *
 * Färgen säger inget om istjocklek, isstatus eller säkerhet. Skalan är därför
 * en enda blå ramp (ljus = långt från referensen, mörk/mättad = nära/över)
 * utan grön/gul/orange/röd. Valda mot den mörka baskartan (#0c1015, kartvatten
 * #17222d): även den mörkaste klassen ska läsas tydligt som vatten.
 */
import type { ExpressionSpecification } from "maplibre-gl";
import type { AreaType } from "@/types/lake";

export interface ColdProgressClass {
  id: string;
  /** Inklusive, i procent av historisk referens. */
  min: number;
  /** Exklusive. null = ingen övre gräns. */
  max: number | null;
  /** Status i sidopanel och info. */
  status: string;
  /** Kort intervalltext för info-kontrollen. */
  range: string;
  color: string;
  /** Konturfärg på kartan (högsta klassen får en diskret ljus kontur). */
  line: string;
}

/**
 * Justera gränser och färger här – inget annat ställe har trösklar.
 * 0 % är en egen klass (aktuell GD = 0), skild från saknad referens.
 */
export const COLD_PROGRESS_CLASSES: readonly ColdProgressClass[] = [
  { id: "none", min: 0, max: Number.MIN_VALUE, status: "Ingen ackumulerad köld", range: "0 %", color: "#5d7a94", line: "#7895ad" },
  { id: "early", min: Number.MIN_VALUE, max: 50, status: "Tidigt", range: "1–49 %", color: "#cfe3ef", line: "#cfe3ef" },
  { id: "underway", min: 50, max: 80, status: "På väg", range: "50–79 %", color: "#8cc0e2", line: "#8cc0e2" },
  { id: "near", min: 80, max: 100, status: "Nära historisk referens", range: "80–99 %", color: "#4f9ad8", line: "#4f9ad8" },
  { id: "reached", min: 100, max: 120, status: "Historisk referens uppnådd", range: "100–119 %", color: "#2b74d0", line: "#2b74d0" },
  { id: "over", min: 120, max: null, status: "Över historisk referens", range: "≥ 120 %", color: "#1d55b8", line: "#a9d4ff" },
];

/**
 * Samlingsområde (COLLECTION_AREA): medvetet ej klassificerat. Lågmäld
 * blågrå, ingen av progressfärgerna och tydligt ljusare än kartans vatten.
 */
export const COLLECTION_AREA_STYLE = {
  label: "Områdespolygon – ej klassificerad",
  fill: "#4b5a66",
  fillOpacity: 0.55,
  line: "#6c7a86",
} as const;

/** Vatten utan progress (saknad referens eller aktuell GD). Endast kontur. */
export const NO_VALUE_STYLE = {
  label: "Ej klassificerad",
  line: "#7d8995",
} as const;

export const COLD_INDICATOR_NOTE = "Färgen visar inte isstatus, istjocklek eller säkerhet.";

export const COLD_MAP_EXPLANATION = [
  "Kartans siffror visar historisk referens-GD.",
  "Sjöarnas färg visar hur stor del av denna referens som aktuell köldmängd har nått.",
  COLD_INDICATOR_NOTE,
] as const;

export const COLLECTION_AREA_NOTE =
  "Området omfattar flera olika vattenmiljöer och klassificeras därför inte med ett gemensamt GD-värde.";

/* ------------------------------------------------------------------ */
/* Central regel                                                       */
/* ------------------------------------------------------------------ */

/** WATER och SUBAREA kan klassificeras, COLLECTION_AREA aldrig. */
export function canRenderColdDays(areaType: AreaType): boolean {
  return areaType !== "COLLECTION_AREA";
}

export function coldProgressClassFor(percent: number): ColdProgressClass {
  return (
    COLD_PROGRESS_CLASSES.find((c) => percent >= c.min && (c.max === null || percent < c.max)) ??
    COLD_PROGRESS_CLASSES[0]
  );
}

/**
 * Fallen hålls strikt isär:
 *   progress       – referens > 0 och aktuell GD finns (även 0) → klass
 *   no_reference   – historisk referens saknas eller är ogiltig (≤ 0)
 *   no_current     – aktuell GD saknas (ej hämtad/ej tillgänglig)
 *   not_applicable – COLLECTION_AREA, används medvetet inte
 * percent cappas inte (150 % är 150 %).
 */
export type ColdProgress =
  | { kind: "progress"; ratio: number; percent: number; cls: ColdProgressClass }
  | { kind: "no_reference" }
  | { kind: "no_current" }
  | { kind: "not_applicable" };

const valid = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function getColdProgress(
  areaType: AreaType,
  current: number | null | undefined,
  historical: number | null | undefined,
): ColdProgress {
  if (!canRenderColdDays(areaType)) return { kind: "not_applicable" };
  if (!valid(historical) || historical <= 0) return { kind: "no_reference" };
  if (!valid(current)) return { kind: "no_current" };
  const ratio = Math.max(0, current) / historical;
  const percent = ratio * 100;
  return { kind: "progress", ratio, percent, cls: coldProgressClassFor(percent) };
}

/** Procent för etiketter: hela procent, 0,4 % visas inte som 0 %. */
export function formatProgressPercent(percent: number): string {
  const p = percent > 0 && percent < 1 ? 1 : Math.round(percent);
  return `${p} %`;
}

/** Kartetikett: exakt "Sjönamn XX" när referens finns, annars bara namnet. */
export function lakeMapLabel(name: string, areaType: AreaType, historical: number | null | undefined): string {
  if (!canRenderColdDays(areaType) || !valid(historical) || historical <= 0) return name;
  return `${name} ${Math.round(historical)}`;
}

/* ------------------------------------------------------------------ */
/* MapLibre-uttryck                                                    */
/* ------------------------------------------------------------------ */

/** Feature-egenskap med progress i procent (null = ingen progress). */
export const PROGRESS_PROPERTY = "pct";

const COLLECTION: AreaType = "COLLECTION_AREA";
const isCollection = ["==", ["get", "areaType"], COLLECTION];
const noProgress = ["==", ["get", PROGRESS_PROPERTY], null];

function stepExpression(key: "color" | "line") {
  return [
    "step",
    ["get", PROGRESS_PROPERTY],
    COLD_PROGRESS_CLASSES[0][key],
    ...COLD_PROGRESS_CLASSES.slice(1).flatMap((c) => [c.min, c[key]]),
  ];
}

/* Samma ordning som getColdProgress: not_applicable → ingen progress → klass. */
export function coldFillColor(): ExpressionSpecification {
  return ["case", isCollection, COLLECTION_AREA_STYLE.fill, noProgress, "rgba(0,0,0,0)", stepExpression("color")] as unknown as ExpressionSpecification;
}

export function coldLineColor(): ExpressionSpecification {
  return ["case", isCollection, COLLECTION_AREA_STYLE.line, noProgress, NO_VALUE_STYLE.line, stepExpression("line")] as unknown as ExpressionSpecification;
}

/** Filter för objekt som inte klassificeras. */
export const isCollectionAreaFilter = isCollection as unknown as ExpressionSpecification;
