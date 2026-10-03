"use client";

/**
 * Startgate: obligatorisk bekräftelse mitt i skärmen innan appen används. Den kan inte stängas med Escape,
 * klick utanför eller en stängknapp, och fokus hålls inne i dialogen (Tab/Skift+Tab cirkulerar). Bakgrunden
 * görs inert av föräldern (IsvakApp) så att varken tangentbord, pekare eller skärmläsare når kartan bakom.
 * Enda vägen vidare är knappen "Jag förstår". Innehållet är avsiktligt begränsat till rubrik, saklig
 * information, begränsningar och knapp – ingen länk härifrån.
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
        <h2 id="gate-title" className={styles.title}>
          Välkommen till Isvak
        </h2>

        <div id="gate-body" className={styles.body}>
          <p>
            Isvak presenterar datadrivna och modellerade indikatorer för isbildning och för förhållanden som kan vara
            relevanta vid isspaning. Underlaget består av väderdata, köldmängd, satellitdata och modellberäkningar.
          </p>
          <p>
            Informationen är inte en observation av faktisk isbärighet. Modellerna innehåller osäkerheter, och lokala
            förhållanden kan avvika kraftigt från det som visas. Informationen får inte användas som bekräftelse på att
            is är säker eller åkbar.
          </p>
          <p>
            Bedömning av isen måste alltid göras på plats av användaren. Du ansvarar själv för beslutet att beträda is.
          </p>
        </div>

        <button type="button" className={styles.confirm} onClick={onAccept}>
          Jag förstår
        </button>
      </div>
    </div>
  );
}
