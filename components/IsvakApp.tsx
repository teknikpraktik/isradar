"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LakePanel from "@/components/lake-panel/LakePanel";
import LakeMap, { type FocusRequest } from "@/components/map/LakeMap";
import LocateButton from "@/components/map/LocateButton";
import LayerControl, { type ActiveSatellite } from "@/components/map/LayerControl";
import PassWind from "@/components/map/PassWind";
import LakeSearch from "@/components/search/LakeSearch";
import InfoDialog from "@/components/ui/InfoDialog";
import { isIsoDate } from "@/lib/cold/api";
import { fetchCurrentColdByStation } from "@/lib/data/cold";
import { buildLake, lakeRepository, type RegionLakeData } from "@/lib/data/lakes";
import { getSatelliteScenesAt } from "@/lib/data/satellite";
import { loadRideabilityBulk, type RideabilityBulkResult } from "@/lib/data/rideability";
import { enrichLakeFeatures } from "@/lib/map/lakeFeatures";
import { computeRideability } from "@/lib/rideability/inputs";
import { withRideabilityCategory } from "@/lib/rideability/mapStyle";
import { formatDate, formatShortDateTime } from "@/lib/format";
import { getRegion } from "@/lib/regions";
import type { LakeId, LakeIndexEntry, LngLat } from "@/types/lake";
import styles from "./IsvakApp.module.css";

export default function IsvakApp({ regionId }: { regionId?: string }) {
  const region = useMemo(() => getRegion(regionId), [regionId]);
  // ?asOf=YYYY-MM-DD visar läget ett tidigare datum (t.ex. förra vintern).
  const asOfParam = useSearchParams().get("asOf");
  const asOf = asOfParam && isIsoDate(asOfParam) ? asOfParam : undefined;
  const [data, setData] = useState<RegionLakeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<LakeId | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [userPosition, setUserPosition] = useState<LngLat | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Satellitlager: ett åt gången, hör till kartan (inte till en sjö) och ligger kvar när man byter vatten.
  const [satellite, setSatellite] = useState<ActiveSatellite | null>(null);
  const activeSatellite = satellite;
  const [satLoading, setSatLoading] = useState<"SAR" | "optical" | null>(null);
  const [satNotice, setSatNotice] = useState<string | null>(null);
  const mapCenterRef = useRef<LngLat | null>(null);
  // Mätverktyg: klick på kartan lägger ut en rutt (påverkar inget annat lager).
  const [measureOn, setMeasureOn] = useState(false);
  const [route, setRoute] = useState<LngLat[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    lakeRepository
      .loadRegion(region.id)
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => {
        console.error(e);
        if (!cancelled) setLoadError("Kunde inte ladda vattendata. Har `npm run data` körts?");
      });
    return () => {
      cancelled = true;
    };
  }, [region.id]);

  // Aktuell köldmängd per station → kartans progressfärg. Utan svar ritas
  // vattnen som ej klassificerade (ingen gissning).
  const [currentCold, setCurrentCold] = useState<{ key: string; values: Map<number, number | null> } | null>(null);
  const coldKey = data ? `${data.regionId}|${asOf ?? ""}` : null;
  useEffect(() => {
    if (!data || !coldKey) return;
    let cancelled = false;
    fetchCurrentColdByStation([...data.stations.keys()], asOf)
      .then((values) => !cancelled && setCurrentCold({ key: coldKey, values }))
      .catch((e: unknown) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [data, asOf, coldKey]);
  const mapLakes = useMemo(
    () =>
      data
        ? enrichLakeFeatures(data.features, data.index, currentCold?.key === coldKey ? currentCold.values : null)
        : null,
    [data, currentCold, coldKey],
  );

  // Modellerad åkbarhet · BETA är standardlager och ersätter köldmängdsfärgerna
  // medan det är aktivt (ömsesidigt exklusiva). Bulkdata hämtas när lagret är på.
  const [colorLayer, setColorLayer] = useState<"rideability" | "cold" | "none">("rideability");
  const rideabilityOn = colorLayer === "rideability";
  const [bulk, setBulk] = useState<{ key: string; result: RideabilityBulkResult } | null>(null);
  const bulkKey = data ? `${data.regionId}|${asOf ?? ""}` : null;
  useEffect(() => {
    if (!rideabilityOn || !data || !bulkKey) return;
    let cancelled = false;
    // MEPS och väder finns bara för nuläget – i historiskt läge räknas de som saknade.
    const load = asOf
      ? Promise.resolve<RideabilityBulkResult>({ data: { mepsCells: null, precipitationMm: null, sentinel: null }, failed: [] })
      : loadRideabilityBulk(data.index);
    load.then((result) => !cancelled && setBulk({ key: bulkKey, result }));
    return () => {
      cancelled = true;
    };
  }, [rideabilityOn, data, asOf, bulkKey]);
  const bulkReady = bulk !== null && bulk.key === bulkKey;
  const rideabilityLoading = rideabilityOn && !bulkReady;
  const rideability = useMemo(() => {
    if (!rideabilityOn || !data || !mapLakes || !bulkReady) return null;
    const gdPercent = new Map(mapLakes.features.map((f) => [f.properties.id, f.properties.pct ?? null]));
    return computeRideability(data.index, { ...bulk.result.data, gdPercent });
  }, [rideabilityOn, data, mapLakes, bulk, bulkReady]);
  const colorLakes = useMemo(
    () => (rideabilityOn && mapLakes ? withRideabilityCategory(mapLakes, rideability ?? new Map()) : mapLakes),
    [rideabilityOn, mapLakes, rideability],
  );

  const legendFlags = useMemo(
    () => ({
      showCollection: !!data?.index.some((l) => l.areaType === "COLLECTION_AREA"),
      showMissing: !!data?.index.some((l) => l.areaType !== "COLLECTION_AREA" && l.hca === null),
    }),
    [data],
  );

  const lake = useMemo(
    () => (data && selectedId !== null ? buildLake(data, selectedId) : null),
    [data, selectedId],
  );

  const showMessage = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const toggleSatellite = useCallback(
    async (sensor: "SAR" | "optical", on: boolean) => {
      setSatNotice(null);
      if (!on) {
        // Av = bara baskartan (inget annat lager tänds i stället).
        setSatellite(null);
        return;
      }
      // Scener för kartvyns mitt (avrundad så att svaren kan cachas).
      const c = mapCenterRef.current ?? region.view.center;
      const position: LngLat = [Math.round(c[0] * 10) / 10, Math.round(c[1] * 10) / 10];
      setSatLoading(sensor);
      const r = await getSatelliteScenesAt(position, asOf);
      setSatLoading(null);
      if (r.status !== "ok") {
        setSatNotice("Kunde inte hämta satellitscener.");
        return;
      }
      const v = r.value;
      const scenes = sensor === "SAR" ? v.sar : v.optical.length ? v.optical : v.opticalAny ? [v.opticalAny] : [];
      if (scenes.length === 0) {
        setSatNotice(`Ingen ${sensor === "SAR" ? "Sentinel-1-passage" : "Sentinel-2-bild"} senaste ${v.windowDays} d för kartvyn.`);
        return;
      }
      // Ett lager i taget: satellit ersätter sjöfärgerna.
      setColorLayer("none");
      setSatellite((prev) => ({ scene: scenes[0], opacity: prev?.opacity ?? 0.7, scenes, position }));
    },
    [region, asOf],
  );

  const pickFromSearch = (entry: LakeIndexEntry) => {
    setSelectedId(entry.id);
    setFocus({ bbox: entry.bbox, key: Date.now() });
  };

  return (
    <main className={styles.app}>
      <LakeMap
        region={region}
        lakes={colorLakes}
        colorMode={colorLayer}
        selectedId={selectedId}
        focus={focus}
        userPosition={userPosition}
        onSelect={setSelectedId}
        onMoveEnd={(c) => (mapCenterRef.current = c)}
        measure={{ active: measureOn, points: route, onAdd: (p) => setRoute((r) => [...r, p]) }}
        satellite={activeSatellite}
        onSatelliteError={() => {
          setSatellite(null);
          showMessage(activeSatellite?.scene.sensor === "SAR" ? "Sentinel-1-bild kunde inte laddas" : "Sentinel-2-bild kunde inte laddas");
        }}
      />

      {activeSatellite && (
        <div className={styles.satLabel} role="status">
          <span>{activeSatellite.scene.sensor === "SAR" ? "Sentinel-1 SAR" : "Sentinel-2 optisk"}</span>
          <span className="num">{formatShortDateTime(activeSatellite.scene.acquiredAt)}</span>
          <span>{activeSatellite.scene.platform}</span>
          {activeSatellite.scene.sensor === "SAR" && (
            <PassWind
              position={activeSatellite.position ?? region.view.center}
              time={activeSatellite.scene.acquiredAt}
            />
          )}
        </div>
      )}

      <div className={styles.topBar}>
        {/* Full omladdning: inga valda sjöar, lager eller datum (originalinladdningen). */}
        <a href="?" className={styles.brand} title="Ladda om Isvak" aria-label={`Isvak ${region.name} – ladda om`}>
          <span className={styles.logo}>ISVAK</span>
          <span className={styles.region}>{region.name}</span>
        </a>
        <LakeSearch
          index={data?.index ?? []}
          stations={data?.stations ?? new Map()}
          onPick={pickFromSearch}
          disabled={!data}
        />
        {asOf && (
          <a href="?" className={styles.asOf} title="Visar ett tidigare datum. Klicka för nuläget.">
            <span>Datum</span>
            <span className="num">{formatDate(asOf)}</span>
            <span aria-hidden>×</span>
          </a>
        )}
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setInfoOpen(true)}
          aria-label="Om Isvak och datan"
          title="Om Isvak"
        >
          i
        </button>
      </div>

      <div className={styles.layers} data-hidden-mobile={lake !== null}>
        <LayerControl
          colorLayer={colorLayer}
          onColorLayer={(layer) => {
            setColorLayer(layer);
            if (layer !== "none") setSatellite(null);
          }}
          rideability={{ loading: rideabilityLoading, failed: bulkReady ? bulk.result.failed : [] }}
          coldLegend={legendFlags}
          measure={{
            on: measureOn,
            points: route,
            onToggle: setMeasureOn,
            onUndo: () => setRoute((r) => r.slice(0, -1)),
            onClear: () => setRoute([]),
          }}
          satellite={{
            active: activeSatellite,
            loadingSensor: satLoading,
            notice: satNotice,
            onToggle: toggleSatellite,
            onShow: (scene) =>
              setSatellite((prev) => (scene ? { scene, opacity: prev?.opacity ?? 0.7, scenes: prev?.scenes, position: prev?.position } : null)),
            onOpacity: (opacity) => setSatellite((s) => (s ? { ...s, opacity } : s)),
          }}
        />
      </div>

      <div className={styles.sideControls}>
        <LocateButton onPosition={setUserPosition} onMessage={showMessage} />
      </div>

      {lake && (
        <LakePanel
          key={lake.id}
          lake={lake}
          onClose={() => setSelectedId(null)}
          onShowInfo={() => setInfoOpen(true)}
          asOf={asOf}
          rideability={{ active: rideabilityOn, loading: rideabilityLoading, result: rideability?.get(lake.id) }}
        />
      )}

      {(toast || loadError) && (
        <div className={styles.toast} role="status">
          {loadError ?? toast}
        </div>
      )}

      <InfoDialog
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        region={region}
        manifest={data?.manifest ?? null}
        showCollectionNote={legendFlags.showCollection}
      />
    </main>
  );
}
