"use client";

/**
 * Liten info-kontroll på kartan (ersätter den gamla GD-legenden).
 * Förklarar etikett (historisk referens) och färg (aktuell / historisk).
 */
import { useState } from "react";
import {
  COLD_MAP_EXPLANATION,
  COLD_PROGRESS_CLASSES,
  COLLECTION_AREA_STYLE,
  NO_VALUE_STYLE,
} from "@/lib/map/coldScale";
import styles from "./ColdMapInfo.module.css";

interface Props {
  showCollection?: boolean;
  showMissing?: boolean;
}

export default function ColdMapInfo({ showCollection = false, showMissing = false }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <section className={styles.legend} aria-label="Kartans färger: aktuell / historisk köldmängd">
      <button type="button" className={styles.head} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>Aktuell / historisk</span>
        <span className={styles.infoMark} aria-hidden>
          ?
        </span>
      </button>
      {open && (
        <>
          {COLD_MAP_EXPLANATION.map((t) => (
            <p key={t} className={styles.explain}>
              {t}
            </p>
          ))}
          <div className={styles.ramp} aria-hidden>
            {COLD_PROGRESS_CLASSES.map((c) => (
              <span key={c.id} style={{ background: c.color }} title={`${c.range} · ${c.status}`} />
            ))}
          </div>
          <div className={styles.rampEnds}>
            <span>Ljusare = längre från</span>
            <span>Mörkare = nära/över</span>
          </div>
          <ul className={`${styles.list} ${styles.extra}`}>
            <li>
              <span className={styles.swatch} style={{ background: COLD_PROGRESS_CLASSES[0].color }} />
              <span>0 % · {COLD_PROGRESS_CLASSES[0].status}</span>
            </li>
            {showMissing && (
              <li>
                <span className={styles.swatch} style={{ border: `1px dashed ${NO_VALUE_STYLE.line}` }} />
                <span>{NO_VALUE_STYLE.label}</span>
              </li>
            )}
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
          </ul>
        </>
      )}
    </section>
  );
}
