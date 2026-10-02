"use client";

/**
 * Kartlegend när Förmodad åkbarhet · BETA är aktivt (ersätter köldmängdslegenden).
 */
import { CATEGORIES, RIDEABILITY_FOOTNOTE, RIDEABILITY_TITLE } from "@/lib/rideability/config";
import styles from "./ColdMapInfo.module.css";

export default function RideabilityLegend({ loading, onClose }: { loading: boolean; onClose: () => void }) {
  return (
    <section className={styles.legend} aria-label={`${RIDEABILITY_TITLE} · BETA`}>
      <div className={styles.head} style={{ cursor: "default" }}>
        <span>
          {RIDEABILITY_TITLE} <span className={styles.beta}>· BETA</span>
        </span>
      </div>
      <ul className={styles.list}>
        {CATEGORIES.map((c) => (
          <li key={c.id}>
            <span className={styles.swatch} style={{ background: c.fill, outline: `1px solid ${c.line}` }} />
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
      <p className={styles.explain}>{loading ? "Hämtar underlag…" : RIDEABILITY_FOOTNOTE}</p>
      <button type="button" className={styles.offBtn} onClick={onClose}>
        Visa köldmängd igen
      </button>
    </section>
  );
}
