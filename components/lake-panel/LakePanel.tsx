"use client";

import { useEffect, useState } from "react";
import { loadLakeConditions, type LakeConditions } from "@/lib/data/conditions";
import { formatCoord } from "@/lib/format";
import type { Lake } from "@/types/lake";
import styles from "./LakePanel.module.css";
import { LOADING } from "./parts";
import { RideabilityDetail } from "./Rideability";
import { ModelSection, OverviewSection, WeatherSection } from "./sections";
import type { RideabilityResult } from "@/lib/rideability/types";

interface Props {
  lake: Lake;
  onClose: () => void;
  onShowInfo: () => void;
  /** Visa läget ett tidigare datum (YYYY-MM-DD). */
  asOf?: string;
  /** Modellerad åkbarhet · BETA – detaljer för sjön när kartlagret är aktivt. */
  rideability?: { active: boolean; loading: boolean; result: RideabilityResult | undefined };
}

export default function LakePanel({ lake, onClose, onShowInfo, asOf, rideability }: Props) {
  const [loaded, setLoaded] = useState<{ key: string; data: Partial<LakeConditions> }>({ key: "", data: {} });
  const [expanded, setExpanded] = useState(false);

  const key = `${lake.id}|${asOf ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    const k = `${lake.id}|${asOf ?? ""}`;
    loadLakeConditions(lake, asOf, (part, value) => {
      if (cancelled) return;
      setLoaded((prev) => ({ key: k, data: { ...(prev.key === k ? prev.data : {}), [part]: value } }));
    });
    return () => {
      cancelled = true;
    };
  }, [lake, asOf]);

  const c = loaded.key === key ? loaded.data : {};

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
        {rideability?.active && <RideabilityDetail result={rideability.result} loading={rideability.loading} />}
        <OverviewSection lake={lake} cold={c.currentCold ?? LOADING} asOf={asOf} />
        <ModelSection meps={c.meps ?? LOADING} />
        <WeatherSection recent={c.weatherRecent ?? LOADING} forecast={c.weatherForecast ?? LOADING} />

        <p className={styles.disclaimer}>
          Visar inte om isen är bärig. Bedöm alltid på plats.{" "}
          <button type="button" className={styles.linkBtn} onClick={onShowInfo}>
            Om Isvak
          </button>
        </p>
      </div>
    </aside>
  );
}
