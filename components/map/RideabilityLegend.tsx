"use client";

/** Legend för Modellerad åkbarhet · BETA, inbäddad under reglaget i lagerkontrollen. */
import { CATEGORIES, RIDEABILITY_FOOTNOTE } from "@/lib/rideability/config";
import styles from "./Legend.module.css";

export default function RideabilityLegend({ loading }: { loading: boolean }) {
  return (
    <div className={styles.legend} role="group" aria-label="Modellerad åkbarhet: kategorier">
      <ul className={styles.list} style={{ marginTop: 0 }}>
        {CATEGORIES.map((c) => (
          <li key={c.id}>
            <span className={styles.swatch} style={{ background: c.fill, outline: `1px solid ${c.line}` }} />
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>{loading ? "Hämtar underlag…" : RIDEABILITY_FOOTNOTE}</p>
    </div>
  );
}
