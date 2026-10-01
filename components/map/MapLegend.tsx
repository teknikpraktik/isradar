"use client";

import { useState } from "react";
import {
  COLD_DAY_CLASSES,
  COLD_INDICATOR_NOTE,
  COLLECTION_AREA_STYLE,
  NO_VALUE_STYLE,
} from "@/lib/map/coldScale";
import { GdUnit } from "@/components/ui/GdUnit";
import styles from "./MapLegend.module.css";

interface Props {
  /** Visa posten för samlingsområden (om sådana finns i datan). */
  showCollection?: boolean;
  /** Visa posten "Värde saknas" (om sådana finns i datan). */
  showMissing?: boolean;
}

export default function MapLegend({ showCollection = false, showMissing = false }: Props) {
  const [open, setOpen] = useState(true);
  const [showNote, setShowNote] = useState(false);
  return (
    <section className={styles.legend} aria-label="Teckenförklaring: historisk köldmängd">
      <div className={styles.headRow}>
        <button
          type="button"
          className={styles.head}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span>Historisk köldmängd</span>
          <span className={styles.chev} aria-hidden>
            {open ? "–" : "+"}
          </span>
        </button>
        <button
          type="button"
          className={styles.info}
          onClick={() => setShowNote((v) => !v)}
          aria-expanded={showNote}
          aria-label="Vad betyder färgerna?"
          title={COLD_INDICATOR_NOTE}
        >
          ?
        </button>
      </div>
      {showNote && <p className={styles.explain}>{COLD_INDICATOR_NOTE}</p>}
      {open && (
        <>
          <ul className={styles.list}>
            {COLD_DAY_CLASSES.map((c) => (
              <li key={c.label}>
                <span className={styles.swatch} style={{ background: c.color }} />
                <span className="num">{c.label}</span> <GdUnit />
              </li>
            ))}
          </ul>
          {/* Separata poster – ingår inte i GD-klasserna */}
          <ul className={`${styles.list} ${styles.extra}`}>
            {showCollection && (
              <li>
                <span
                  className={styles.swatch}
                  style={{
                    background: COLLECTION_AREA_STYLE.fill,
                    opacity: COLLECTION_AREA_STYLE.fillOpacity + 0.25,
                    outline: `1px solid ${COLLECTION_AREA_STYLE.line}`,
                  }}
                />
                <span>{COLLECTION_AREA_STYLE.label}</span>
              </li>
            )}
            {showMissing && (
              <li>
                <span className={styles.swatch} style={{ border: `1px dashed ${NO_VALUE_STYLE.line}` }} />
                <span>{NO_VALUE_STYLE.label}</span>
              </li>
            )}
          </ul>
          <p className={styles.note}>Temperaturindikator, inte isstatus</p>
        </>
      )}
    </section>
  );
}
