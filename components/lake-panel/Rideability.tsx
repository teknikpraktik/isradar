"use client";

/**
 * Förmodad åkbarhet · BETA i sjöpanelen: reglage (under Väder) och detaljvy
 * (visas överst när lagret är aktivt). All beräkning ligger i lib/rideability.
 * Score 0–100 visas aldrig; bara kategori och ingående indikatorer.
 */
import { CATEGORY_BY_ID, RIDEABILITY_FOOTNOTE, RIDEABILITY_HELP, RIDEABILITY_TITLE, SENTINEL_LABEL_BREAKS } from "@/lib/rideability/config";
import type { GateReason, RideabilityResult } from "@/lib/rideability/types";
import styles from "./LakePanel.module.css";
import { Row, Section } from "./parts";

const nf = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });
const FACTOR_LABEL = {
  iceThickness: "MEPS is",
  coldDegree: "GD aktuell",
  snow: "Snö på is",
  sentinel: "Sentinel-1",
  precipitation: "Nederbörd 24 h",
} as const;

const GATE_NOTE: Record<GateReason, string> = {
  ice_below_2: "Begränsad av låg modellerad istjocklek (< 2 cm).",
  ice_2_to_5: "Begränsad av modellerad istjocklek (2–5 cm).",
  ice_missing: "Modellerad istjocklek saknas – högsta nivå kan inte nås.",
};

const BetaBadge = () => (
  <span className={styles.beta} title="Första experimentella versionen – vikter och gränser justeras">
    BETA
  </span>
);

const Title = () => (
  <>
    {RIDEABILITY_TITLE} <BetaBadge />
  </>
);

/** Reglage + hjälptext. Sitter under Väder. */
export function RideabilityToggleSection({
  active,
  loading,
  failed,
  onToggle,
}: {
  active: boolean;
  loading: boolean;
  failed: string[];
  onToggle: (on: boolean) => void;
}) {
  return (
    <Section title={<Title />} kinds={[]} status="ok">
      <label className={styles.switchRow}>
        <input
          type="checkbox"
          role="switch"
          className={styles.switchInput}
          checked={active}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className={styles.switchTrack} aria-hidden />
        <span className={styles.switchLabel}>Visa på kartan</span>
      </label>
      <p className={styles.rideHelp}>{RIDEABILITY_HELP}</p>
      {active && <p className={styles.rideHelp}>Köldmängdslagret är avstängt medan detta lager visas.</p>}
      {active && loading && <p className={styles.rideHelp}>Hämtar underlag…</p>}
      {active && failed.length > 0 && (
        <p className={styles.rideHelp}>Kunde inte hämta: {failed.join(", ")}. Räknas som data saknas.</p>
      )}
    </Section>
  );
}

function sentinelText(favourability: number): string {
  return favourability >= SENTINEL_LABEL_BREAKS.favourable
    ? "gynnsam signal"
    : favourability >= SENTINEL_LABEL_BREAKS.mixed
      ? "blandad signal"
      : "svag signal";
}

/** Kategori och ingående indikatorer för vald sjö. */
export function RideabilityDetail({ result, loading }: { result: RideabilityResult | undefined; loading: boolean }) {
  if (!result) {
    return (
      <Section title={<Title />} kinds={[]} status={loading ? "loading" : "not_applicable"}>
        <Row label="Bedömning" status={loading ? "loading" : "not_applicable"} />
      </Section>
    );
  }
  const cat = CATEGORY_BY_ID[result.category];
  const i = result.inputs;
  return (
    <Section title={<Title />} kinds={[]} status="ok">
      <p className={styles.rideCategory}>
        <span className={styles.rideDot} style={{ background: cat.fill }} aria-hidden />
        {cat.label}
      </p>
      <Row
        label={FACTOR_LABEL.coldDegree}
        value={i.gdPercent === null ? undefined : `${Math.round(i.gdPercent)} % av historisk`}
        placeholder="Data saknas"
      />
      <Row
        label={FACTOR_LABEL.iceThickness}
        value={i.iceThicknessCm === null ? undefined : `${nf.format(i.iceThicknessCm)} cm`}
        placeholder="Data saknas"
      />
      <Row
        label={FACTOR_LABEL.snow}
        value={i.snowOnIceCm === null ? undefined : `${nf.format(i.snowOnIceCm)} cm`}
        placeholder="Data saknas"
      />
      <Row
        label={FACTOR_LABEL.sentinel}
        value={i.sentinel ? sentinelText(i.sentinel.favourability) : undefined}
        placeholder="Data saknas"
      />
      <Row
        label={FACTOR_LABEL.precipitation}
        value={i.precipitation24hMm === null ? undefined : `${nf.format(i.precipitation24hMm)} mm`}
        placeholder="Data saknas"
      />
      {result.gate && <p className={styles.rideHelp}>{GATE_NOTE[result.gate]}</p>}
      {result.missing.length > 0 && (
        <p className={styles.rideHelp}>
          Data saknas: {result.missing.map((m) => FACTOR_LABEL[m]).join(", ")} ({result.availableSources} av{" "}
          {result.totalSources} underlag).
        </p>
      )}
      <p className={styles.rideFoot}>{RIDEABILITY_FOOTNOTE}</p>
    </Section>
  );
}
