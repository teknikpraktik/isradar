"use client";

import { useEffect, useState } from "react";
import { getLakeConditions, type LakeConditions } from "@/lib/data/conditions";
import { formatCoord } from "@/lib/format";
import type { Lake } from "@/types/lake";
import styles from "./LakePanel.module.css";
import { ModelSection, OverviewSection, SatelliteSection, WeatherSection } from "./sections";

interface Props {
  lake: Lake;
  onClose: () => void;
  onShowInfo: () => void;
}

export default function LakePanel({ lake, onClose, onShowInfo }: Props) {
  const [loaded, setLoaded] = useState<{ id: number; data: LakeConditions } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLakeConditions(lake).then((data) => {
      if (!cancelled) setLoaded({ id: lake.id, data });
    });
    return () => {
      cancelled = true;
    };
  }, [lake]);

  const c = loaded?.id === lake.id ? loaded.data : null;

  return (
    <aside
      className={styles.panel}
      data-expanded={expanded}
      aria-label={`Vatten: ${lake.name}`}
    >
      <button
        type="button"
        className={styles.handle}
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Minimera panel" : "Expandera panel"}
        aria-expanded={expanded}
      >
        <span />
      </button>
      <header className={styles.head}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>{lake.name}</h2>
          <p className={styles.sub}>
            <span className="num">{formatCoord(lake.centroid)}</span>
            <span className={styles.id}>ID {lake.id}</span>
          </p>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Stäng">
          ×
        </button>
      </header>

      <div className={styles.body}>
        {c ? (
          <>
            <OverviewSection lake={lake} cold={c.currentCold} />
            <ModelSection meps={c.meps} />
            <SatelliteSection sat={c.satellite} />
            <WeatherSection recent={c.weatherRecent} forecast={c.weatherForecast} />
          </>
        ) : (
          <p className={styles.loading}>Hämtar…</p>
        )}

        <p className={styles.disclaimer}>
          Visar fjärranalys-, modell- och väderdata – inte om isen är bärig. Bedöm alltid isen på
          plats.{" "}
          <button type="button" className={styles.linkBtn} onClick={onShowInfo}>
            Om datan
          </button>
        </p>
      </div>
    </aside>
  );
}
