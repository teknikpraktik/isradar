"use client";

/**
 * Legend för köldmängdslagret. Visas bara när det lagret är valt (inbäddad
 * under reglaget i lagerkontrollen). Ren visuell nyckel; förklaringen av färg
 * och GD-etikett finns under Köldmängd på Om Isvak.
 */
import {
  COLD_PROGRESS_CLASSES,
  NO_VALUE_STYLE,
} from "@/lib/map/coldScale";
import styles from "./Legend.module.css";

interface Props {
  showMissing?: boolean;
}

export default function ColdLegend({ showMissing = false }: Props) {
  return (
    <div className={styles.legend} role="group" aria-label="Köldmängd: aktuell jämfört med historisk">
      <ul className={styles.list}>
        {COLD_PROGRESS_CLASSES.map((c) => (
          <li key={c.id}>
            <span className={styles.swatch} style={{ background: c.color }} />
            <span className={styles.range}>{c.range}</span>
            <span className={styles.status}>{c.status}</span>
          </li>
        ))}
        {showMissing && (
          <li>
            <span className={styles.swatch} style={{ border: `1px dashed ${NO_VALUE_STYLE.line}` }} />
            <span>{NO_VALUE_STYLE.label}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
