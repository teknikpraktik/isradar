"use client";

/**
 * Legend för köldmängdslagret. Visas bara när det lagret är valt (inbäddad
 * under reglaget i lagerkontrollen). Förklarar färg (aktuell köldmängd i
 * procent av historisk referens), etikett (historisk referens-GD) och hur
 * jämförelsen ska tolkas.
 */
import {
  COLD_PROGRESS_CLASSES,
  NO_VALUE_STYLE,
} from "@/lib/map/coldScale";
import styles from "./Legend.module.css";

interface Props {
  showMissing?: boolean;
  /** Mobil: dölj förklaringstexten tills användaren öppnar den bakom frågetecknet. */
  collapsedOnMobile?: boolean;
}

export default function ColdLegend({ showMissing = false, collapsedOnMobile = false }: Props) {
  return (
    <div className={styles.legend} role="group" aria-label="Köldmängd: aktuell jämfört med historisk">
      <p className={collapsedOnMobile ? `${styles.explain} ${styles.mobileCollapsed}` : styles.explain}>
        <strong>Färg</strong> = aktuell köldmängd i procent av historisk referens. <strong>Siffran</strong> efter
        sjönamnet = historisk referens-GD, alltså köldmängden när vattnet tidigare blivit åkbart.
      </p>
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
