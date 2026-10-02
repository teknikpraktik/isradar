"use client";

/**
 * Friskrivning som en ruta mitt i skärmen vid sidladdning. Användaren måste läsa den och trycka OK
 * innan kartan går att använda. Ruta och bakgrund kan inte stängas på annat sätt (varken Esc eller
 * klick utanför). Renderas direkt i första svaret så att kartan aldrig syns obevakad.
 */
import { useEffect, useRef } from "react";
import styles from "./DisclaimerGate.module.css";

export default function DisclaimerGate({ onAccept }: { onAccept: () => void }) {
  const ok = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ok.current?.focus();
  }, []);

  return (
    <div className={styles.backdrop}>
      <div className={styles.box} role="alertdialog" aria-modal="true" aria-labelledby="gate-title" aria-describedby="gate-text">
        <h2 id="gate-title" className={styles.title}>
          OBS!
        </h2>
        <div id="gate-text" className={styles.text}>
          <p>
            Isvak är en datormodell. Isen är inte kontrollerad på plats och modellerna kan inte användas för att
            bedöma is. Isvak bedömer inte om is är säker eller bärig.
          </p>
          <p className={styles.danger}>
            Det är förenat med livsfara att beträda naturis utan rätt kunskap, sällskap och utrustning.
          </p>
          <p>
            Kontrollera alltid isen själv på plats. Läs mer om hur Isvak fungerar och vad det inte går att använda till
            under{" "}
            <a href="/om" target="_blank" rel="noopener noreferrer">
              Om Isvak
            </a>
            .
          </p>
        </div>
        <button ref={ok} type="button" className={styles.ok} onClick={onAccept}>
          OK
        </button>
      </div>
    </div>
  );
}
