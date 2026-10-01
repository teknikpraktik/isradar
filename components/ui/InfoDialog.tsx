"use client";

import { useEffect, useRef } from "react";
import { KIND_DESCRIPTION } from "@/lib/format";
import { LARGE_LAKE_COLD_REASON } from "@/lib/data/cold";
import { COLD_DAY_CLASSES, COLD_INDICATOR_NOTE } from "@/lib/map/coldScale";
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
}

const KINDS: DataKind[] = ["observation", "model", "forecast", "historical_reference"];

export default function InfoDialog({ open, onClose, region, manifest }: Props) {
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
          <h2 id="info-title">Om ISRADAR</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Stäng">
            ×
          </button>
        </header>

        <p className={styles.notice}>
          ISRADAR visar fjärranalys-, modell- och väderdata. Informationen visar inte om isen är
          bärig. Bedöm alltid isen på plats.
        </p>

        <h3>Typer av data</h3>
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

        <h3>Historisk köldmängd</h3>
        <p>
          Median köldmängd vid första historiskt rapporterade åkning, enligt Skridskonätets
          empiriska modell. Anges i <strong>GD</strong> (graddagar), ett mått på ackumulerad kyla.
          Värdet beskriver tidigare säsonger och är ingen säkerhetsgräns.
        </p>
        <p>
          Kartans färger ({COLD_DAY_CLASSES.map((c) => c.label).join(", ")} GD) visar bara detta
          historiska värde: ljusare = mindre, mörkare = mer ackumulerad kyla. {COLD_INDICATOR_NOTE}
        </p>
        <p>
          <strong>Aktuell köldmängd</strong> är en separat variabel för innevarande säsong (från 1
          oktober), beräknad ur SMHI:s uppmätta temperaturer. Den blandas inte ihop med den historiska.
        </p>

        <h3>Stora sjöar</h3>
        <p>
          Vänerns öppna huvudbassäng (skrafferad) klassificeras medvetet inte med köldmängd.{" "}
          {LARGE_LAKE_COLD_REASON} Vikar och skärgårdar som finns som egna vattenobjekt klassificeras
          som vanligt.
        </p>

        <h3>Källor och status</h3>
        <ul className={styles.sources}>
          <li>
            Historisk köldmängd: <a href={SOURCES.skridskonatet.url}>{SOURCES.skridskonatet.name}</a>
          </li>
          <li>
            Aktuell köldmängd: beräknad av ISRADAR ur{" "}
            <a href="https://www.smhi.se/data/oppna-data">SMHI Öppna data</a> (CC BY 4.0)
          </li>
          <li>{SOURCES.meps.name}: ej ansluten</li>
          <li>{SOURCES.sentinel.name}: ej ansluten</li>
          <li>{SOURCES.weather.name}: ej ansluten</li>
          <li>Länsgränser: SCB, digitala gränser (CC0)</li>
          <li>Bakgrundskarta: © OpenStreetMap-bidragsgivare, OpenMapTiles, OpenFreeMap</li>
        </ul>

        <h3>Område</h3>
        <p className={styles.small}>
          {region.name}
          {region.boundary.kind === "bbox_approximation" &&
            " – preliminär rektangulär avgränsning under utveckling; vissa vatten utanför länet ingår."}
          {manifest && (
            <>
              {" "}
              {manifest.counts.lakes} vatten. Data genererad{" "}
              {new Date(manifest.generatedAt).toLocaleString("sv-SE")}.
            </>
          )}
        </p>
        <p className={styles.small}>Din position används bara lokalt i webbläsaren och skickas inte någonstans.</p>
      </div>
    </dialog>
  );
}
