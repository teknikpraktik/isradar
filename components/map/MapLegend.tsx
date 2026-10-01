"use client";

import { useState } from "react";
import { COLD_CLASSES } from "@/lib/map/coldScale";
import { GdUnit } from "@/components/ui/GdUnit";
import styles from "./MapLegend.module.css";

export default function MapLegend() {
  const [open, setOpen] = useState(true);
  return (
    <section className={styles.legend} aria-label="Teckenförklaring">
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
      {open && (
        <>
          <ul className={styles.list}>
            {COLD_CLASSES.map((c) => (
              <li key={c.label}>
                <span className={styles.swatch} style={{ background: c.color }} />
                <span className="num">{c.label}</span> <GdUnit />
              </li>
            ))}
          </ul>
          <p className={styles.note}>Historisk referens, inte nuläge.</p>
        </>
      )}
    </section>
  );
}
