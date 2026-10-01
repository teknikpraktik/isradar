"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import type { LakeFeatureCollection } from "@/lib/data/lakes";
import { LAKE_LABEL_FONT, basemapStyle } from "@/lib/map/basemap";
import { coldColorExpression } from "@/lib/map/coldScale";
import { loadMapLibre } from "@/lib/map/maplibre";
import type { BBox, LakeId, LngLat } from "@/types/lake";
import type { RegionDefinition } from "@/types/region";
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
}

const SOURCE = "lakes";
const CLICK_LAYERS = ["lakes-fill", "lakes-point"];
const SELECTED_COLOR = "#f2f5f7";

/** Kartans synliga yta när sjöpanelen är öppen (bottom sheet resp. sidopanel). */
function focusPadding(map: MlMap) {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  return w < 768
    ? { top: 90, left: 32, right: 32, bottom: Math.round(h * 0.5) }
    : { top: 90, left: 60, right: 440, bottom: 60 };
}

export default function LakeMap({ region, lakes, selectedId, focus, userPosition, onSelect }: Props) {
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
            (window as unknown as { __isradarMap?: MlMap }).__isradarMap = map;
          }
          setReady(true);
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

  map.addLayer({
    id: "lakes-fill",
    type: "fill",
    source: SOURCE,
    filter: isPolygon,
    paint: {
      "fill-color": coldColorExpression,
      "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.78, 0.55],
    },
  });
  map.addLayer({
    id: "lakes-line",
    type: "line",
    source: SOURCE,
    filter: isPolygon,
    paint: {
      "line-color": coldColorExpression,
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.3, 12, 1.2],
      "line-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "lakes-point",
    type: "circle",
    source: SOURCE,
    filter: isPoint,
    paint: {
      "circle-color": coldColorExpression,
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
  map.addLayer({
    id: "lakes-label",
    type: "symbol",
    source: SOURCE,
    minzoom: 9,
    layout: {
      "text-field": ["get", "name"],
      "text-font": LAKE_LABEL_FONT,
      "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 13, 12.5],
      "text-letter-spacing": 0.03,
      "text-max-width": 8,
    },
    paint: {
      "text-color": "#cfdbe3",
      "text-halo-color": "#0c1015",
      "text-halo-width": 1.3,
    },
  });
}
