"use client";

import { useState, type ReactNode } from "react";
import { KIND_DESCRIPTION, KIND_LABEL } from "@/lib/format";
import type { DataKind, DataResult, Quantity } from "@/types/provenance";
import styles from "./LakePanel.module.css";

export type SectionStatus = DataResult<unknown>["status"];

export const PLACEHOLDER: Record<Exclude<SectionStatus, "ok">, string> = {
  not_connected: "Data kommer senare",
  unavailable: "Ej tillgänglig",
};

export function KindBadge({ kind }: { kind: DataKind }) {
  return (
    <span className={styles.kind} data-kind={kind} title={KIND_DESCRIPTION[kind]}>
      {KIND_LABEL[kind]}
    </span>
  );
}

export function Section({
  title,
  kinds,
  status,
  source,
  children,
}: {
  title: string;
  kinds: DataKind[];
  status: SectionStatus;
  source?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <h3>{title}</h3>
        <div className={styles.sectionTags}>
          {kinds.map((k) => (
            <KindBadge key={k} kind={k} />
          ))}
          {status === "not_connected" && <span className={styles.status}>Ej ansluten</span>}
          {status === "unavailable" && <span className={styles.status}>Saknas</span>}
        </div>
      </header>
      <dl className={styles.rows}>{children}</dl>
      {source && <p className={styles.source}>Källa: {source}</p>}
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
  hint,
}: {
  label: ReactNode;
  value?: ReactNode;
  meta?: ReactNode;
  status?: SectionStatus;
  hint?: ReactNode;
}) {
  const [showHint, setShowHint] = useState(false);
  const empty = value === undefined || value === null;
  return (
    <div className={styles.row}>
      <dt>
        {label}
        {hint && (
          <button
            type="button"
            className={styles.hintBtn}
            onClick={() => setShowHint((v) => !v)}
            aria-expanded={showHint}
            aria-label="Förklaring"
          >
            ?
          </button>
        )}
      </dt>
      <dd className={empty ? styles.placeholder : styles.value}>
        {empty ? (status === "ok" ? "–" : PLACEHOLDER[status]) : value}
        {meta && !empty && <span className={styles.meta}>{meta}</span>}
      </dd>
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

export function fmtPct(v: number | undefined): ReactNode {
  return v === undefined ? undefined : <span className="num">{nf.format(v)} %</span>;
}
