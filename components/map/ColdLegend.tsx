"use client";

/**
 * Legend för köldmängdslagret. Visas bara när det lagret är valt (inbäddad
 * under reglaget i lagerkontrollen). Förklarar färg (aktuell köldmängd i
 * procent av historisk referens), etikett (historisk referens-GD) och hur
 * jämförelsen ska tolkas.
 */
import {
  COLD_INDICATOR_NOTE,
  COLD_PROGRESS_CLASSES,
  COLLECTION_AREA_STYLE,
  NO_VALUE_STYLE,
} from "@/lib/map/coldScale";
import styles from "./Legend.module.css";

interface Props {
  showCollection?: boolean;
  showMissing?: boolean;
}

export default function ColdLegend({ showCollection = false, showMissing = false }: Props) {
  return (
    <div className={styles.legend} role="group" aria-label="Köldmängd: aktuell jämfört med historisk">
      <p className={styles.explain}>
        <strong>Färg</strong> = aktuell köldmängd i procent av historisk referens. <strong>Siffran</strong> efter
        sjönamnet = historisk referens-GD, alltså köldmängden när vattnet tidigare blivit åkbart.
      </p>
      <div className={styles.ramp} aria-hidden>
        {COLD_PROGRESS_CLASSES.map((c) => (
          <span key={c.id} style={{ background: c.color }} title={`${c.range} · ${c.status}`} />
        ))}
      </div>
      <div className={styles.rampEnds}>
        <span>Långt från referensen</span>
        <span>Nära / över</span>
      </div>
      <ul className={styles.list}>
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
      <p className={styles.note}>
        Jämför mörkare nyans med ljusare: ju mörkare, desto närmare (eller över) historisk referens. {COLD_INDICATOR_NOTE}
      </p>
    </div>
  );
}
