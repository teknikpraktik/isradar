/** Kartfärgsättning för Modellerad åkbarhet. Läser kategorier/färger från config. */
import type { ExpressionSpecification } from "maplibre-gl";
import type { LakeFeatureCollection } from "@/lib/data/lakes";
import { COLLECTION_AREA_STYLE, isCollectionAreaFilter } from "@/lib/map/coldScale";
import type { LakeId } from "@/types/lake";
import { CATEGORIES, CATEGORY_BY_ID } from "./config";
import type { RideabilityResult } from "./types";

export const RIDEABILITY_PROPERTY = "rcat";

const matchBy = (key: "fill" | "line") =>
  [
    "match",
    ["get", RIDEABILITY_PROPERTY],
    ...CATEGORIES.flatMap((c) => [c.id, c[key]]),
    CATEGORY_BY_ID.insufficient[key],
  ] as unknown as ExpressionSpecification;

/** Samlingsområden behåller sin egen stil – de bedöms aldrig. */
export function rideabilityFillColor(): ExpressionSpecification {
  return ["case", isCollectionAreaFilter, COLLECTION_AREA_STYLE.fill, matchBy("fill")] as unknown as ExpressionSpecification;
}

export function rideabilityLineColor(): ExpressionSpecification {
  return ["case", isCollectionAreaFilter, COLLECTION_AREA_STYLE.line, matchBy("line")] as unknown as ExpressionSpecification;
}

/** Lägger kategori på sjöarnas features. Sjöar utan resultat får "insufficient". */
export function withRideabilityCategory(
  fc: LakeFeatureCollection,
  results: Map<LakeId, RideabilityResult>,
): LakeFeatureCollection {
  return {
    ...fc,
    features: fc.features.map((f) => ({
      ...f,
      properties: { ...f.properties, rcat: results.get(f.properties.id)?.category ?? "insufficient" },
    })),
  };
}
