"use client";

/**
 * Kartans lagerkontroll (vänsterkant). Lagren hör till kartan, inte till en
 * enskild sjö: Förmodad åkbarhet · BETA och Sentinel-satellit slås på och av
 * utan att en sjö behöver väljas. Satellitlagren är ömsesidigt exklusiva, och
 * åkbarhet ersätter köldmängdsfärgerna.
 */
import { useState } from "react";
import { SatelliteControls } from "@/components/lake-panel/sections";
import { RIDEABILITY_HELP, RIDEABILITY_TITLE } from "@/lib/rideability/config";
import type { SatelliteScene } from "@/lib/satellite/api";
import styles from "./LayerControl.module.css";

export interface ActiveSatellite {
  scene: SatelliteScene;
  opacity: number;
  /** Passager för navigering; saknas när lagret slagits på från sjöpanelen. */
  scenes?: SatelliteScene[];
}

interface Props {
  rideability: { on: boolean; loading: boolean; failed: string[]; onToggle: (on: boolean) => void };
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

export default function LayerControl({ rideability, satellite }: Props) {
  // Utfälld som standard på bred skärm; på mobil styr knappen (se CSS).
  const [open, setOpen] = useState(false);
  const sat = satellite.active;
  const activeCount = (rideability.on ? 1 : 0) + (sat ? 1 : 0);
  return (
    <section className={styles.control} aria-label="Kartlager">
      <button type="button" className={styles.toggle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>Lager</span>
        {activeCount > 0 && <span className={styles.count}>{activeCount}</span>}
      </button>
      <div className={styles.body} data-open={open}>
        <h3 className={styles.group}>Åkbarhet</h3>
        <Switch
          checked={rideability.on}
          onChange={rideability.onToggle}
          label={RIDEABILITY_TITLE}
          badge="BETA"
          busy={rideability.on && rideability.loading}
        />
        <p className={styles.help}>{RIDEABILITY_HELP}</p>
        {rideability.on && <p className={styles.help}>Köldmängdsfärgerna är avstängda medan detta lager visas.</p>}
        {rideability.on && rideability.failed.length > 0 && (
          <p className={styles.help}>Kunde inte hämta: {rideability.failed.join(", ")}. Räknas som data saknas.</p>
        )}

        <h3 className={styles.group}>Satellit · Sentinel</h3>
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
