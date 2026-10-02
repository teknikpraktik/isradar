/**
 * Mörk, avskalad basemap byggd på OpenFreeMap (OpenMapTiles-schema, ingen
 * API-nyckel). Avsiktligt dämpad så att vattnen från Isvak dominerar.
 *
 * Kan ersättas helt via NEXT_PUBLIC_MAP_STYLE_URL.
 */
import type { StyleSpecification } from "maplibre-gl";

const TILES = "https://tiles.openfreemap.org/planet";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const FONT = ["Noto Sans Regular"];

export const C = {
  bg: "#0c1015",
  land: "#0f141a",
  wood: "#111a1c",
  water: "#17222d",
  waterLine: "#1f2d3a",
  road: "#252d36",
  roadMajor: "#323b46",
  rail: "#272d34",
  border: "#4a5562",
  label: "#7d8995",
  labelMajor: "#a3adb7",
  halo: "#0c1015",
};

export function basemapStyle(): StyleSpecification | string {
  const override = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  if (override) return override;

  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      omt: { type: "vector", url: TILES },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": C.bg } },
      {
        id: "landcover-wood",
        type: "fill",
        source: "omt",
        "source-layer": "landcover",
        filter: ["==", ["get", "class"], "wood"],
        paint: { "fill-color": C.wood, "fill-opacity": 0.6 },
      },
      {
        id: "water",
        type: "fill",
        source: "omt",
        "source-layer": "water",
        paint: { "fill-color": C.water },
      },
      {
        id: "waterway",
        type: "line",
        source: "omt",
        "source-layer": "waterway",
        minzoom: 8,
        paint: { "line-color": C.waterLine, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 2] },
      },
      {
        id: "road-minor",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 10,
        filter: ["in", ["get", "class"], ["literal", ["minor", "tertiary", "service", "track"]]],
        paint: { "line-color": C.road, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 15, 2] },
      },
      {
        id: "road-major",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 6,
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary"]]],
        paint: { "line-color": C.roadMajor, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 14, 3] },
      },
      {
        id: "rail",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 9,
        filter: ["==", ["get", "class"], "rail"],
        paint: { "line-color": C.rail, "line-width": 1, "line-dasharray": [3, 3] },
      },
      {
        id: "boundary-country",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        filter: ["all", ["<=", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": C.border, "line-width": 1.2 },
      },
      {
        id: "boundary-county",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": C.border, "line-width": 0.8, "line-dasharray": [4, 3], "line-opacity": 0.7 },
      },
      {
        id: "place-label",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "village"]]],
        layout: {
          "text-field": ["coalesce", ["get", "name:sv"], ["get", "name"]],
          "text-font": FONT,
          "text-size": ["match", ["get", "class"], "city", 13, "town", 11.5, 10.5],
          "text-letter-spacing": 0.04,
        },
        paint: {
          "text-color": ["match", ["get", "class"], ["city", "town"], C.labelMajor, C.label],
          "text-halo-color": C.halo,
          "text-halo-width": 1.4,
        },
      },
    ],
  };
}

export const LAKE_LABEL_FONT = FONT;
