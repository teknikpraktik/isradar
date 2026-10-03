"use client";

/**
 * Startgate: obligatorisk bekräftelse mitt i skärmen innan appen används. Den kan inte stängas med Escape,
 * klick utanför eller en stängknapp, och fokus hålls inne i dialogen (Tab/Skift+Tab cirkulerar). Bakgrunden
 * görs inert av föräldern (IsvakApp) så att varken tangentbord, pekare eller skärmläsare når kartan bakom.
 * Enda vägen vidare är knappen "Jag har förstått". Innehållet är avsiktligt begränsat till rubrik, saklig
 * kort säkerhetsvarning och knapp – ingen länk härifrån.
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
        aria-describedby="gate-body"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className={styles.header}>
          <h2 id="gate-title" className={styles.title}>
            Isvak
          </h2>
          <p className={styles.subtitle}>Datadriven bevakning av isbildning</p>
        </header>

        <div id="gate-body" className={styles.body}>
          <p>
            Isvak sammanställer väderdata, satellitdata och historiska referenser för att identifiera sjöar där
            isbildningen kan vara värd att undersöka.
          </p>
          <section className={styles.notice} aria-labelledby="gate-safety">
            <h3 id="gate-safety" className={styles.noticeTitle}>
              <svg className={styles.noticeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3 2.5 20h19z" />
                <path d="M12 10v4.5M12 17.2v.1" />
              </svg>
              Viktig säkerhetsinformation
            </h3>
            <p>
              Isvak bedömer inte om en is är säker att beträda. Modellresultat och underliggande data kan vara
              osäkra, ofullständiga eller inaktuella. Isens bärighet måste alltid bedömas på plats med rätt kunskap
              och utrustning.
            </p>
          </section>
        </div>

        <button type="button" className={styles.confirm} onClick={onAccept}>
          Jag har förstått
        </button>
      </div>
    </div>
  );
}
