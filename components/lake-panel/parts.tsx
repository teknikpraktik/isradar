"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { KIND_DESCRIPTION, KIND_LABEL } from "@/lib/format";
import type { DataKind, DataResult, Quantity } from "@/types/provenance";
import styles from "./LakePanel.module.css";

/** DataResult eller "hämtas". */
export type Loadable<T> = DataResult<T> | { status: "loading" };
export const LOADING = { status: "loading" } as const;

export type SectionStatus = Loadable<unknown>["status"];

export const PLACEHOLDER: Record<Exclude<SectionStatus, "ok">, string> = {
  not_connected: "Data kommer senare",
  unavailable: "Ej tillgänglig",
  not_applicable: "Ej klassificerad",
  loading: "Hämtar…",
};

export function KindBadge({ kind }: { kind: DataKind }) {
  return (
    <span className={styles.kind} data-kind={kind} title={KIND_DESCRIPTION[kind]}>
      {KIND_LABEL[kind]}
    </span>
  );
}

/**
 * Appens informationsmönster: litet "?" som fäller ut en förklaring i flödet
 * (kapas aldrig av panelens kanter). Klick/tap/Enter växlar; tap utanför och
 * Escape stänger.
 */
function useHint(): [boolean, () => void, RefObject<HTMLDivElement | null>] {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return [open, () => setOpen((v) => !v), ref];
}

export function HintButton({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" className={styles.hintBtn} onClick={onToggle} aria-expanded={open} aria-label={label}>
      ?
    </button>
  );
}

export function Section({
  title,
  kinds,
  status,
  source,
  hint,
  hintLabel,
  children,
}: {
  title: string;
  kinds: DataKind[];
  status: SectionStatus;
  source?: string;
  /** Förklaring/metadata bakom "?" vid rubriken. */
  hint?: ReactNode;
  hintLabel?: string;
  children: ReactNode;
}) {
  const [open, toggle, ref] = useHint();
  return (
    <section className={styles.section} ref={ref as RefObject<HTMLElement | null>}>
      <header className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>
          {title}
          {hint && <HintButton open={open} onToggle={toggle} label={hintLabel ?? `Information om ${title}`} />}
        </h3>
        <div className={styles.sectionTags}>
          {kinds.map((k) => (
            <KindBadge key={k} kind={k} />
          ))}
          {status === "not_connected" && <span className={styles.status}>Ej ansluten</span>}
          {status === "unavailable" && <span className={styles.status}>Saknas</span>}
        </div>
      </header>
      {hint && open && <div className={styles.hint}>{hint}</div>}
      {/* Ej anslutna källor: bara rubrik + tagg, inga tomma rader. */}
      {status !== "not_connected" && <div className={styles.rows}>{children}</div>}
      {source && <p className={styles.source}>{source}</p>}
    </section>
  );
}

/**
 * En rad. Utan `value` visas platshållartext för `status` – värden gissas
 * aldrig fram.
 */
export function Row({
  label,
  value,
  meta,
  status = "ok",
  placeholder,
  placeholderTitle,
  hint,
}: {
  label: ReactNode;
  value?: ReactNode;
  meta?: ReactNode;
  status?: SectionStatus;
  /** Ersätter standardtexten när värde saknas, t.ex. en orsak. */
  placeholder?: string;
  /** Längre förklaring när värde saknas – visas vid hovring. */
  placeholderTitle?: string;
  hint?: ReactNode;
}) {
  const [showHint, toggleHint, ref] = useHint();
  const empty = value === undefined || value === null;
  return (
    <div className={styles.row} ref={ref}>
      <span className={styles.label}>
        {label}
        {hint && (
          <HintButton open={showHint} onToggle={toggleHint} label={`Förklaring: ${typeof label === "string" ? label : ""}`} />
        )}
      </span>
      <span className={empty ? styles.placeholder : styles.value} title={empty ? placeholderTitle : undefined}>
        {empty ? (placeholder ?? (status === "ok" ? "–" : PLACEHOLDER[status])) : value}
      </span>
      {meta && !empty && <p className={styles.meta}>{meta}</p>}
      {hint && showHint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

const nf = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });

export function fmtQ(q: Quantity | null | undefined): ReactNode {
  if (!q) return undefined;
  return (
    <>
      <span className="num">{nf.format(q.value)}</span>{" "}
      {q.unit === "GD" ? (
        <abbr title="graddagar" className="unit">
          GD
        </abbr>
      ) : (
        <span className="unit">{q.unit}</span>
      )}
    </>
  );
}

/** Förändring med tecken: "+3,2 GD", "−1,5 GD", "±0 GD". */
export function fmtSignedQ(q: Quantity | null | undefined): ReactNode {
  if (!q) return undefined;
  const sign = q.value > 0 ? "+" : q.value < 0 ? "−" : "±";
  return (
    <>
      <span className="num">{sign}</span>
      {fmtQ({ ...q, value: Math.abs(q.value) })}
    </>
  );
}

export function fmtPct(v: number | undefined): ReactNode {
  return v === undefined ? undefined : <span className="num">{nf.format(v)} %</span>;
}
