"use client";

/**
 * Startgate: säkerhetsinformation som visas mitt i skärmen vid sidladdning. Det är en obligatorisk
 * bekräftelse, inte en vanlig informationsruta: den kan inte stängas med Escape, klick utanför eller
 * en stängknapp, och fokus hålls inne i dialogen (Tab/Skift+Tab cirkulerar). Bakgrunden görs inert av
 * föräldern (IsvakApp) så att varken tangentbord, pekare eller skärmläsare når kartan bakom.
 * Enda vägen vidare är knappen "Jag förstår – visa kartan". Länken "Om Isvak" öppnas i ny flik och
 * påverkar inte gaten.
 *
 * Renderas direkt i första svaret, så kartan syns aldrig obevakad.
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import styles from "./DisclaimerGate.module.css";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function DisclaimerGate({ onAccept }: { onAccept: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);

  // Fokus hamnar i dialogen (på själva rutan) så att skärmläsare läser rubrik och text först.
  useEffect(() => {
    dialog.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault(); // gaten kan inte stängas utan bekräftelse
      return;
    }
    if (e.key !== "Tab" || !dialog.current) return;
    // Focus trap: håll fokus bland dialogens egna fokuserbara element.
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={styles.overlay}>
      <div
        ref={dialog}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        aria-describedby="gate-lead gate-body"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className={styles.header}>
          <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3 2.5 20h19z" />
            <path d="M12 10v5M12 17.8v.4" />
          </svg>
          <h2 id="gate-title" className={styles.title}>
            Innan du använder Isvak
          </h2>
        </header>

        <p id="gate-lead" className={styles.lead}>
          Isvak bedömer inte om is är säker eller bärig.
        </p>

        <div id="gate-body" className={styles.body}>
          <p>
            Isvak sammanställer väder, modeller, köldmängd och satellitdata för att visa områden som kan vara
            intressanta för isspaning. Ingen is har kontrollerats på plats.
          </p>
          <p className={styles.warning}>
            Det är förenat med livsfara att beträda naturis utan rätt kunskap, sällskap och utrustning.
          </p>
          <p>Kontrollera alltid isen själv på plats.</p>
          <p className={styles.more}>
            Läs mer om hur Isvak fungerar och dess begränsningar under{" "}
            <a href="/om" target="_blank" rel="noopener noreferrer">
              Om Isvak
            </a>
            .
          </p>
        </div>

        <button type="button" className={styles.confirm} onClick={onAccept}>
          Jag förstår – visa kartan
        </button>
      </div>
    </div>
  );
}
