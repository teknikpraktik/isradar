"use client";

/**
 * Kartans lagerkontroll (vänsterkant). Lagren hör till kartan, inte till en
 * enskild sjö.
 *   Åkbarhet      Modellerad åkbarhet · BETA – huvudlagret, sammanvägd indikator.
 *   Analyslager   Köldmängd, Sentinel-1 SAR, Sentinel-2 optisk – underliggande
 *                 beslutsunderlag.
 * Sjöfärgen är antingen Modellerad åkbarhet eller Köldmängd (ömsesidigt
 * exklusiva, ett av dem är alltid på). Sentinel-lagren är ömsesidigt exklusiva.
 * Varje lagers legend visas direkt under dess reglage när lagret är på.
 */
import { useState } from "react";
import { SatelliteControls } from "@/components/lake-panel/sections";
import { RIDEABILITY_HELP, RIDEABILITY_TITLE } from "@/lib/rideability/config";
import type { LngLat } from "@/types/lake";
import type { SatelliteScene } from "@/lib/satellite/api";
import ColdLegend from "./ColdLegend";
import styles from "./LayerControl.module.css";
import RideabilityLegend from "./RideabilityLegend";

export interface ActiveSatellite {
  scene: SatelliteScene;
  opacity: number;
  /** Passager för navigering. */
  scenes?: SatelliteScene[];
  /** Position som scenerna hämtades för (kartans mitt) – används för vind vid passagen. */
  position?: LngLat;
}

interface Props {
  /** Vilket lager som färgar sjöarna. */
  colorLayer: "rideability" | "cold";
  onColorLayer: (layer: "rideability" | "cold") => void;
  rideability: { loading: boolean; failed: string[] };
  coldLegend: { showCollection: boolean; showMissing: boolean };
  satellite: {
    active: ActiveSatellite | null;
    loadingSensor: "SAR" | "optical" | null;
    /** Meddelande när scener saknas för kartvyn. */
    notice: string | null;
    onToggle: (sensor: "SAR" | "optical", on: boolean) => void;
    onShow: (scene: SatelliteScene | null) => void;
    onOpacity: (opacity: number) => void;
  };
}

function Switch({
  checked,
  onChange,
  label,
  badge,
  busy,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  badge?: string;
  busy?: boolean;
}) {
  return (
    <label className={styles.switchRow}>
      <input
        type="checkbox"
        role="switch"
        className={styles.switchInput}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.switchTrack} aria-hidden />
      <span className={styles.switchLabel}>
        {label}
        {badge && <span className={styles.beta}>{badge}</span>}
        {busy && <span className={styles.busy}> …</span>}
      </span>
    </label>
  );
}

export default function LayerControl({ colorLayer, onColorLayer, rideability, coldLegend, satellite }: Props) {
  // Utfälld som standard på bred skärm; på mobil styr knappen (se CSS).
  const [open, setOpen] = useState(false);
  const sat = satellite.active;
  const riding = colorLayer === "rideability";
  const activeCount = 1 + (sat ? 1 : 0);
  return (
    <section className={styles.control} aria-label="Kartlager">
      <button type="button" className={styles.toggle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>Lager</span>
        <span className={styles.count}>{activeCount}</span>
      </button>
      <div className={styles.body} data-open={open}>
        <h3 className={styles.group}>Åkbarhet</h3>
        <Switch
          checked={riding}
          onChange={(on) => onColorLayer(on ? "rideability" : "cold")}
          label={RIDEABILITY_TITLE}
          badge="BETA"
          busy={riding && rideability.loading}
        />
        <p className={styles.help}>{RIDEABILITY_HELP}</p>
        {riding && rideability.failed.length > 0 && (
          <p className={styles.help}>Kunde inte hämta: {rideability.failed.join(", ")}. Räknas som data saknas.</p>
        )}
        {riding && <RideabilityLegend loading={rideability.loading} />}

        <h3 className={styles.group}>Analyslager</h3>
        <p className={styles.help}>Underliggande beslutsunderlag. Köldmängd ersätter sjöfärgen för åkbarhet.</p>
        <Switch
          checked={!riding}
          onChange={(on) => onColorLayer(on ? "cold" : "rideability")}
          label="Köldmängd"
        />
        {!riding && <ColdLegend {...coldLegend} />}
        <Switch
          checked={sat?.scene.sensor === "SAR"}
          onChange={(on) => satellite.onToggle("SAR", on)}
          label="Sentinel-1 SAR"
          busy={satellite.loadingSensor === "SAR"}
        />
        <Switch
          checked={sat?.scene.sensor === "optical"}
          onChange={(on) => satellite.onToggle("optical", on)}
          label="Sentinel-2 optisk"
          busy={satellite.loadingSensor === "optical"}
        />
        {satellite.notice && <p className={styles.help}>{satellite.notice}</p>}
        {sat && (
          <SatelliteControls
            active={sat}
            scenes={sat.scenes ?? [sat.scene]}
            onShow={satellite.onShow}
            onOpacity={satellite.onOpacity}
          />
        )}
      </div>
    </section>
  );
}
