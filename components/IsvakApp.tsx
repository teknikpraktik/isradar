"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LakePanel from "@/components/lake-panel/LakePanel";
import LakeMap, { type FocusRequest } from "@/components/map/LakeMap";
import LocateButton from "@/components/map/LocateButton";
import ColdMapInfo from "@/components/map/ColdMapInfo";
import LakeSearch from "@/components/search/LakeSearch";
import InfoDialog from "@/components/ui/InfoDialog";
import { isIsoDate } from "@/lib/cold/api";
import { fetchCurrentColdByStation } from "@/lib/data/cold";
import { buildLake, lakeRepository, type RegionLakeData } from "@/lib/data/lakes";
import { enrichLakeFeatures } from "@/lib/map/lakeFeatures";
import { formatDate, formatShortDateTime } from "@/lib/format";
import type { SatelliteScene } from "@/lib/satellite/api";
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
  // Satellitlager: ett åt gången. Stängs när användaren byter vatten.
  const [satellite, setSatellite] = useState<{ scene: SatelliteScene; opacity: number } | null>(null);
  const [satLakeId, setSatLakeId] = useState<LakeId | null>(null);
  const activeSatellite = satellite && satLakeId === selectedId ? satellite : null;
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

  const pickFromSearch = (entry: LakeIndexEntry) => {
    setSelectedId(entry.id);
    setFocus({ bbox: entry.bbox, key: Date.now() });
  };

  return (
    <main className={styles.app}>
      <LakeMap
        region={region}
        lakes={mapLakes}
        selectedId={selectedId}
        focus={focus}
        userPosition={userPosition}
        onSelect={setSelectedId}
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
        </div>
      )}

      <div className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.logo} title="Datadriven bevakning av isbildning">ISVAK</span>
          <span className={styles.region}>{region.name}</span>
        </div>
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

      <div className={styles.sideControls}>
        <LocateButton onPosition={setUserPosition} onMessage={showMessage} />
      </div>

      <div className={styles.legend} data-hidden-mobile={lake !== null}>
        <ColdMapInfo {...legendFlags} />
      </div>

      {lake && (
        <LakePanel
          key={lake.id}
          lake={lake}
          onClose={() => setSelectedId(null)}
          onShowInfo={() => setInfoOpen(true)}
          asOf={asOf}
          satellite={activeSatellite}
          onSatellite={(scene) => {
            setSatLakeId(lake.id);
            setSatellite(scene ? { scene, opacity: satellite?.opacity ?? 0.7 } : null);
          }}
          onSatelliteOpacity={(opacity) => setSatellite((s) => (s ? { ...s, opacity } : s))}
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
