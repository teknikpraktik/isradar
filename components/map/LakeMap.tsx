"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { ErrorEvent, GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import type { LakeFeatureCollection } from "@/lib/data/lakes";
import { LAKE_LABEL_FONT, basemapStyle } from "@/lib/map/basemap";
import { COLLECTION_AREA_STYLE, coldFillColor, coldLineColor, isCollectionAreaFilter } from "@/lib/map/coldScale";
import { loadMapLibre } from "@/lib/map/maplibre";
import { rideabilityFillColor, rideabilityLineColor } from "@/lib/rideability/mapStyle";
import type { BBox, LakeId, LngLat } from "@/types/lake";
import type { RegionDefinition } from "@/types/region";
import type { SatelliteScene } from "@/lib/satellite/api";
import styles from "./LakeMap.module.css";

export interface FocusRequest {
  bbox: BBox;
  /** Ändras för varje ny begäran så att samma sjö kan fokuseras igen. */
  key: number;
}

interface Props {
  region: RegionDefinition;
  lakes: LakeFeatureCollection | null;
  selectedId: LakeId | null;
  focus: FocusRequest | null;
  userPosition: LngLat | null;
  onSelect: (id: LakeId | null) => void;
  /** Aktivt satellitlager (ett åt gången) eller null. */
  satellite?: { scene: SatelliteScene; opacity: number } | null;
  onSatelliteError?: () => void;
  /** Vad sjöarnas färg visar. Default köldmängd. */
  colorMode?: "cold" | "rideability";
  /** Kartans mittpunkt när en förflyttning slutat. */
  onMoveEnd?: (center: LngLat) => void;
}

const SAT_SOURCE = "satellite";
const SAT_LAYER = "satellite-raster";
/** Sjöfyllning när satellitbild visas – tonas ned så att bilden syns. Konturer kvar. */
const DIMMED_FILL = { lakes: 0.08, collection: 0.04 };

const SOURCE = "lakes";
// Ordning spelar ingen roll för träffar: queryRenderedFeatures ger översta först.
const CLICK_LAYERS = ["lakes-fill", "lakes-point", "collection-fill"];
const SELECTED_COLOR = "#f2f5f7";

/** Kartans synliga yta när sjöpanelen är öppen (bottom sheet resp. sidopanel). */
function focusPadding(map: MlMap) {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  return w < 768
    ? { top: 90, left: 32, right: 32, bottom: Math.round(h * 0.5) }
    : { top: 90, left: 60, right: 440, bottom: 60 };
}

export default function LakeMap({
  region,
  lakes,
  selectedId,
  focus,
  userPosition,
  onSelect,
  satellite = null,
  onSatelliteError,
  colorMode = "cold",
  onMoveEnd,
}: Props) {
  const onMoveEndRef = useRef(onMoveEnd);
  useEffect(() => {
    onMoveEndRef.current = onMoveEnd;
  }, [onMoveEnd]);
  const onSatErrorRef = useRef(onSatelliteError);
  useEffect(() => {
    onSatErrorRef.current = onSatelliteError;
  }, [onSatelliteError]);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Skapa kartan en gång.
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;

    loadMapLibre()
      .then((ml) => {
        if (cancelled || !containerRef.current) return;
        map = new ml.Map({
          container: containerRef.current,
          style: basemapStyle(),
          bounds: region.view.bounds,
          fitBoundsOptions: { padding: 24 },
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
        map.addControl(new ml.ScaleControl({ unit: "metric", maxWidth: 90 }), "bottom-left");
        map.getCanvas().setAttribute("aria-label", `Karta över ${region.name}`);

        // style.load väntar inte på basemap-tiles (till skillnad från load),
        // så sjöarna kan visas direkt.
        map.once("style.load", () => {
          if (cancelled || !map) return;
          addRegionOutline(map, region);
          addLakeLayers(map);
          mapRef.current = map;
          // Endast i utveckling: gör kartan inspekterbar från konsolen/testverktyg.
          if (process.env.NODE_ENV === "development") {
            (window as unknown as { __isvakMap?: MlMap }).__isvakMap = map;
          }
          setReady(true);
        });

        map.on("moveend", () => {
          const c = map?.getCenter();
          if (c) onMoveEndRef.current?.([c.lng, c.lat]);
        });

        map.on("click", (e) => {
          if (!map?.getLayer("lakes-fill")) return;
          const { x, y } = e.point;
          const hits = map.queryRenderedFeatures(
            [
              [x - 6, y - 6],
              [x + 6, y + 6],
            ],
            { layers: CLICK_LAYERS },
          );
          const id = hits[0]?.properties?.id;
          onSelectRef.current(typeof id === "number" ? id : null);
        });

        let hoverId: number | string | undefined;
        const setHover = (id: number | string | undefined) => {
          if (!map) return;
          if (hoverId !== undefined) map.setFeatureState({ source: SOURCE, id: hoverId }, { hover: false });
          hoverId = id;
          if (id !== undefined) map.setFeatureState({ source: SOURCE, id }, { hover: true });
        };
        for (const layer of CLICK_LAYERS) {
          map.on("mousemove", layer, (e) => {
            map!.getCanvas().style.cursor = "pointer";
            setHover(e.features?.[0]?.id);
          });
          map.on("mouseleave", layer, () => {
            map!.getCanvas().style.cursor = "";
            setHover(undefined);
          });
        }
      })
      .catch((err: unknown) => {
        console.error(err);
        if (!cancelled) setError("Kartan kunde inte laddas. Kräver WebGL.");
      });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [region]);

  // Data
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !lakes) return;
    (map.getSource(SOURCE) as GeoJSONSource).setData(lakes);
  }, [ready, lakes]);

  // Färgläge: köldmängd eller Modellerad åkbarhet (ömsesidigt exklusiva).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const riding = colorMode === "rideability";
    const fill = riding ? rideabilityFillColor() : coldFillColor();
    map.setPaintProperty("lakes-fill", "fill-color", fill as never);
    map.setPaintProperty("lakes-point", "circle-color", fill as never);
    map.setPaintProperty("lakes-line", "line-color", (riding ? rideabilityLineColor() : coldLineColor()) as never);
    // Siffran i etiketten är historisk referens-GD – köldmängdsinfo visas bara i köldmängdsläget.
    const text = riding ? ["get", "name"] : ["coalesce", ["get", "label"], ["get", "name"]];
    for (const [tier] of LABEL_TIERS) map.setLayoutProperty(`lakes-label-${tier}`, "text-field", text as never);
  }, [ready, colorMode]);

  // Satellitlager: rasterkälla under ortnamn och sjölager (baskarta → satellit
  // → sjöar → etiketter). Byts helt vid ny scen; städas bort när det stängs.
  const sceneId = satellite?.scene.id ?? null;
  const sceneTiles = satellite?.scene.tileUrl ?? null;
  const sceneBounds = satellite?.scene.bounds ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (map.getLayer(SAT_LAYER)) map.removeLayer(SAT_LAYER);
    if (map.getSource(SAT_SOURCE)) map.removeSource(SAT_SOURCE);
    const dim = sceneId !== null;
    map.setPaintProperty("lakes-fill", "fill-opacity", (dim ? DIMMED_FILL.lakes : ["case", ["boolean", ["feature-state", "hover"], false], 0.97, 0.85]) as never);
    map.setPaintProperty("collection-fill", "fill-opacity", (dim ? DIMMED_FILL.collection : ["case", ["boolean", ["feature-state", "hover"], false], COLLECTION_AREA_STYLE.fillOpacity + 0.2, COLLECTION_AREA_STYLE.fillOpacity]) as never);
    if (!sceneId || !sceneTiles) return;
    map.addSource(SAT_SOURCE, {
      type: "raster",
      tiles: [sceneTiles],
      tileSize: 256,
      maxzoom: 14,
      ...(sceneBounds ? { bounds: sceneBounds } : {}),
      attribution: "Copernicus Sentinel-data · Microsoft Planetary Computer",
    });
    map.addLayer(
      { id: SAT_LAYER, type: "raster", source: SAT_SOURCE, paint: { "raster-opacity": 0.7, "raster-fade-duration": 150 } },
      map.getLayer("place-label") ? "place-label" : "collection-fill",
    );
    let reported = false;
    const onError = (e: ErrorEvent & { sourceId?: string }) => {
      if (e.sourceId === SAT_SOURCE && !reported) {
        reported = true;
        onSatErrorRef.current?.();
      }
    };
    map.on("error", onError);
    return () => {
      map.off("error", onError);
    };
  }, [ready, sceneId, sceneTiles, sceneBounds]);

  const satOpacity = satellite?.opacity ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || satOpacity === null || !map.getLayer(SAT_LAYER)) return;
    map.setPaintProperty(SAT_LAYER, "raster-opacity", satOpacity);
  }, [ready, satOpacity, sceneId]);

  // Markering
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const filter = ["==", ["get", "id"], selectedId ?? -1] as const;
    map.setFilter("lakes-selected-fill", filter as never);
    map.setFilter("lakes-selected-line", filter as never);
  }, [ready, selectedId]);

  // Zoom till sjö
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    const [x0, y0, x1, y1] = focus.bbox;
    map.fitBounds(
      [
        [x0, y0],
        [x1, y1],
      ],
      { padding: focusPadding(map), maxZoom: 13, duration: 900 },
    );
  }, [ready, focus]);

  // Egen position – visas endast lokalt, skickas ingenstans.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (!userPosition) return;
    let cancelled = false;
    loadMapLibre().then((ml) => {
      if (cancelled) return;
      const el = document.createElement("div");
      el.className = styles.userMarker;
      el.setAttribute("aria-label", "Min position");
      markerRef.current = new ml.Marker({ element: el }).setLngLat(userPosition).addTo(map);
      map.easeTo({ center: userPosition, zoom: Math.max(map.getZoom(), 10), duration: 800 });
    });
    return () => {
      cancelled = true;
    };
  }, [ready, userPosition]);

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.map} />
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}

/** Diskret kontur för utvecklingsregionen (länsgräns eller bbox). */
function addRegionOutline(map: MlMap, region: RegionDefinition) {
  map.addSource("region", {
    type: "geojson",
    data: { type: "Feature", properties: {}, geometry: region.boundary.geometry },
  });
  map.addLayer({
    id: "region-outline",
    type: "line",
    source: "region",
    paint: {
      "line-color": "#8b97a3",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 10, 1.6],
      "line-opacity": 0.55,
      "line-dasharray": [3, 2],
    },
  });
}

function addLakeLayers(map: MlMap) {
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  // Polygon och MultiPolygon (geometry-type skiljer på dem i nyare MapLibre).
  const isPolygon = ["!=", ["geometry-type"], "Point"] as never;
  const isPoint = ["==", ["geometry-type"], "Point"] as never;
  const none = ["==", ["get", "id"], -1] as never;

  const hover = ["boolean", ["feature-state", "hover"], false];
  const notCollection = ["!", isCollectionAreaFilter];

  // Samlingsområden (ej klassificerade) ritas UNDER alla vatten och delområden,
  // så att de aldrig täcker vikar och skärgårdar.
  map.addLayer({
    id: "collection-fill",
    type: "fill",
    source: SOURCE,
    filter: ["all", isPolygon, isCollectionAreaFilter] as never,
    paint: {
      "fill-color": COLLECTION_AREA_STYLE.fill,
      "fill-opacity": ["case", hover, COLLECTION_AREA_STYLE.fillOpacity + 0.2, COLLECTION_AREA_STYLE.fillOpacity] as never,
    },
  });
  map.addLayer({
    id: "lakes-fill",
    type: "fill",
    source: SOURCE,
    filter: ["all", isPolygon, notCollection] as never,
    paint: {
      "fill-color": coldFillColor(),
      "fill-opacity": ["case", hover, 0.97, 0.85] as never,
    },
  });
  map.addLayer({
    id: "lakes-line",
    type: "line",
    source: SOURCE,
    filter: isPolygon,
    paint: {
      "line-color": coldLineColor(),
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 12, 1.2],
      "line-opacity": 1,
    },
  });
  map.addLayer({
    id: "lakes-point",
    type: "circle",
    source: SOURCE,
    filter: isPoint,
    paint: {
      "circle-color": coldFillColor(),
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2.5, 12, 6],
      "circle-stroke-color": "#0c1015",
      "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: "lakes-selected-fill",
    type: "fill",
    source: SOURCE,
    filter: none,
    paint: { "fill-color": SELECTED_COLOR, "fill-opacity": 0.18 },
  });
  map.addLayer({
    id: "lakes-selected-line",
    type: "line",
    source: SOURCE,
    filter: none,
    paint: {
      "line-color": SELECTED_COLOR,
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 12, 2.5],
    },
  });
  // Etiketter "Sjönamn XX" i tre nivåer efter storlek (lt): stora vatten syns
  // utzoomat, små först nära. Överst i stacken placeras först vid krock, så de
  // största läggs sist och vinner. COLLECTION_AREA får aldrig referenssiffra.
  for (const [tier, minzoom] of LABEL_TIERS) {
    map.addLayer({
      id: `lakes-label-${tier}`,
      type: "symbol",
      source: SOURCE,
      minzoom,
      filter: ["all", notCollection, ["==", ["get", "lt"], tier]] as never,
      layout: labelLayout as never,
      paint: labelPaint,
    });
  }
  // Samlingsområden består ofta av många delytor (efter klippning) – deras
  // namn visas först på nära håll för att inte upprepas över hela kartan.
  map.addLayer({
    id: "collection-label",
    type: "symbol",
    source: SOURCE,
    minzoom: 11,
    filter: isCollectionAreaFilter,
    layout: { ...labelLayout, "text-field": ["get", "name"], "symbol-spacing": 600 } as never,
    paint: { ...labelPaint, "text-color": "#9aa6b1" },
  });
}

/** [etikettnivå, minzoom] – minst först (placeras sist vid krock). */
const LABEL_TIERS = [
  [2, 9.5],
  [1, 8],
  [0, 6.5],
] as const;

const labelLayout = {
  "text-field": ["coalesce", ["get", "label"], ["get", "name"]],
  "text-font": LAKE_LABEL_FONT,
  "text-size": ["interpolate", ["linear"], ["zoom"], 6.5, 9.5, 13, 12.5],
  "text-letter-spacing": 0.03,
  "text-max-width": 8,
};

const labelPaint = {
  "text-color": "#cfdbe3",
  "text-halo-color": "#0c1015",
  "text-halo-width": 1.3,
};
