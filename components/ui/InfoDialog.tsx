"use client";

import { useEffect, useRef } from "react";
import { KIND_DESCRIPTION, formatShortDateTime } from "@/lib/format";
import { COLD_PROGRESS_CLASSES } from "@/lib/map/coldScale";
import { SOURCES } from "@/lib/sources";
import type { RegionDataManifest, RegionDefinition } from "@/types/region";
import { KindBadge } from "@/components/lake-panel/parts";
import type { DataKind } from "@/types/provenance";
import styles from "./InfoDialog.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  region: RegionDefinition;
  manifest: RegionDataManifest | null;
  /** Visa posten om samlingsområden (om sådana finns i datan). */
  showCollectionNote?: boolean;
}

const KINDS: DataKind[] = ["observation", "model", "forecast", "historical_reference"];

export default function InfoDialog({ open, onClose, region, manifest, showCollectionNote = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="info-title"
    >
      <div className={styles.inner}>
        <header className={styles.head}>
          <h2 id="info-title">Om Isvak</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Stäng">
            ×
          </button>
        </header>

        <p className={styles.notice}>
          Visar fjärranalys-, modell- och väderdata – inte om isen är bärig. Bedöm alltid isen på plats.
        </p>

        <h3>Datatyper</h3>
        <dl className={styles.kinds}>
          {KINDS.map((k) => (
            <div key={k}>
              <dt>
                <KindBadge kind={k} />
              </dt>
              <dd>{KIND_DESCRIPTION[k]}</dd>
            </div>
          ))}
        </dl>

        <h3>
          Köldmängd <span className={styles.unit}>GD = graddagar</span>
        </h3>
        <dl className={styles.terms}>
          <div>
            <dt>Historisk</dt>
            <dd>Median vid första rapporterade åkning (Skridskonätet)</dd>
          </div>
          <div>
            <dt>Aktuell</dt>
            <dd>Från 1 okt · SMHI-dygnsmedel · netto, golv 0</dd>
          </div>
          <div>
            <dt>Kartfärg</dt>
            <dd>
              Aktuell / historisk referens ({COLD_PROGRESS_CLASSES.map((c) => c.range).join(", ")}). Siffran i
              etiketten är historisk referens-GD. Inte isstatus, istjocklek eller säkerhet.
            </dd>
          </div>
          {showCollectionNote && (
            <div>
              <dt>Blågrå</dt>
              <dd>Områdespolygon med flera vattenmiljöer – ej klassificerad</dd>
            </div>
          )}
        </dl>

        <h3>Källor</h3>
        <dl className={styles.terms}>
          <div>
            <dt>Historisk GD</dt>
            <dd>
              <a href={SOURCES.skridskonatet.url}>Skridskonätet</a>
            </dd>
          </div>
          <div>
            <dt>Temp, väder</dt>
            <dd>
              <a href="https://www.smhi.se/data/oppna-data">SMHI</a> (CC BY 4.0) +{" "}
              <a href="https://data.trafikverket.se">Trafikverket VViS</a> · station ≤ 50 km
            </dd>
          </div>
          <div>
            <dt>Länsgränser</dt>
            <dd>SCB (CC0)</dd>
          </div>
          <div>
            <dt>Karta</dt>
            <dd>© OpenStreetMap, OpenMapTiles, OpenFreeMap</dd>
          </div>
          <div>
            <dt>Sjöismodell</dt>
            <dd>
              <a href="https://thredds.met.no">MET Norway MEPS</a> (CC BY 4.0) · 2,5 km
            </dd>
          </div>
          <div>
            <dt>Satellit</dt>
            <dd>
              Copernicus Sentinel-data via <a href="https://planetarycomputer.microsoft.com">Microsoft Planetary Computer</a>
            </dd>
          </div>
        </dl>

        <p className={styles.small}>
          {[
            region.name + (region.boundary.kind === "bbox_approximation" ? " (preliminär avgränsning)" : ""),
            manifest && `${manifest.counts.lakes} vatten`,
            manifest && `data ${formatShortDateTime(manifest.generatedAt)}`,
            "position endast lokalt",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </dialog>
  );
}
