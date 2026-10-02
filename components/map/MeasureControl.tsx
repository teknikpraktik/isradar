"use client";

/**
 * Mätverktyg: eget reglage under lagerväljaren (inte ett kartlager). Medan det är
 * på lägger klick på kartan ut en rutt; aktivt kartlager påverkas inte. Rutten ligger
 * kvar när verktyget stängs av och tas bort med "Ta bort rutt".
 */
import { useEffect } from "react";
import { formatLength, routeLengthM } from "@/lib/measure/route";
import type { LngLat } from "@/types/lake";
import styles from "./MeasureControl.module.css";

interface Props {
  on: boolean;
  points: LngLat[];
  onToggle: (on: boolean) => void;
  onUndo: () => void;
  onClear: () => void;
}

/** Kryss (stänger mätläget). */
function CloseIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Linjal. */
function RulerIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 16.5 16.5 3.5l4 4-13 13z" />
      <path d="m7.5 12.5 2 2M10.5 9.5l2 2M13.5 6.5l2 2" />
    </svg>
  );
}

export default function MeasureControl({ on, points, onToggle, onUndo, onClear }: Props) {
  const hasRoute = points.length > 0;
  // Esc avslutar mätläget (rutten ligger kvar).
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onToggle(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [on, onToggle]);
  return (
    <section className={styles.measure} aria-label="Mätverktyg">
      <button
        type="button"
        className={on ? `${styles.btn} ${styles.btnOn}` : styles.btn}
        aria-pressed={on}
        onClick={() => onToggle(!on)}
      >
        {on ? <CloseIcon /> : <RulerIcon />}
        <span>{on ? "Avsluta mätning" : "Mät rutt"}</span>
      </button>
      {(on || hasRoute) && (
        <div className={styles.body}>
          {on && (
            <p className={styles.help}>
              {hasRoute ? "Klicka för att lägga till fler punkter." : "Klicka på kartan för att lägga ut hur du tänker åka."}{" "}
              Avsluta med knappen ovan eller Esc.
            </p>
          )}
          {hasRoute && (
            <div className={styles.route}>
              <p className={styles.routeLen}>
                Rutt <strong className="num">{formatLength(routeLengthM(points))}</strong>
                <span className={styles.routePts}> · {points.length} punkter</span>
              </p>
              <div className={styles.routeBtns}>
                <button type="button" onClick={onUndo}>
                  Ångra punkt
                </button>
                <button type="button" onClick={onClear}>
                  Ta bort rutt
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
