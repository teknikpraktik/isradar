"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LakePanel from "@/components/lake-panel/LakePanel";
import LakeMap, { type FocusRequest } from "@/components/map/LakeMap";
import LocateButton from "@/components/map/LocateButton";
import MapLegend from "@/components/map/MapLegend";
import LakeSearch from "@/components/search/LakeSearch";
import InfoDialog from "@/components/ui/InfoDialog";
import { buildLake, lakeRepository, type RegionLakeData } from "@/lib/data/lakes";
import { getRegion } from "@/lib/regions";
import type { LakeId, LakeIndexEntry, LngLat } from "@/types/lake";
import styles from "./IsradarApp.module.css";

export default function IsradarApp({ regionId }: { regionId?: string }) {
  const region = useMemo(() => getRegion(regionId), [regionId]);
  const [data, setData] = useState<RegionLakeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<LakeId | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [userPosition, setUserPosition] = useState<LngLat | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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

  const lake = useMemo(
    () => (data && selectedId !== null ? buildLake(data, selectedId) : null),
    [data, selectedId],
  );

  const showMessage = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const pickFromSearch = useCallback((entry: LakeIndexEntry) => {
    setSelectedId(entry.id);
    setFocus({ bbox: entry.bbox, key: Date.now() });
  }, []);

  return (
    <main className={styles.app}>
      <LakeMap
        region={region}
        lakes={data?.features ?? null}
        selectedId={selectedId}
        focus={focus}
        userPosition={userPosition}
        onSelect={setSelectedId}
      />

      <div className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.logo}>ISRADAR</span>
          <span className={styles.region}>{region.name}</span>
        </div>
        <LakeSearch
          index={data?.index ?? []}
          stations={data?.stations ?? new Map()}
          onPick={pickFromSearch}
          disabled={!data}
        />
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setInfoOpen(true)}
          aria-label="Om ISRADAR och datan"
          title="Om ISRADAR"
        >
          i
        </button>
      </div>

      <div className={styles.sideControls}>
        <LocateButton onPosition={setUserPosition} onMessage={showMessage} />
      </div>

      <div className={styles.legend} data-hidden-mobile={lake !== null}>
        <MapLegend />
      </div>

      {lake && (
        <LakePanel
          key={lake.id}
          lake={lake}
          onClose={() => setSelectedId(null)}
          onShowInfo={() => setInfoOpen(true)}
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
      />
    </main>
  );
}
