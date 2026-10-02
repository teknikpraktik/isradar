"use client";

/**
 * Källor för sjövyn – bara det viktigaste per källa: vilken källa, var (station,
 * ruta eller position) och när (tidpunkt för data). Visar bara det källan levererat.
 */
import type { LakeConditions } from "@/lib/data/conditions";
import { formatCoord, formatDate, formatDateShort, formatShortDateTime } from "@/lib/format";
import type { Lake } from "@/types/lake";
import type { DataResult, DataSource } from "@/types/provenance";
import styles from "./LakePanel.module.css";
import { Section } from "./parts";

type L<K extends keyof LakeConditions> = LakeConditions[K] | { status: "loading" };

type Rows = [label: string, value: React.ReactNode | null | undefined | false][];

const time = (iso: string | undefined) => (iso ? formatShortDateTime(iso) : null);

/** Källnamn, med länk om den finns. */
function SourceName({ source }: { source: DataSource }) {
  return source.url ? (
    <a href={source.url} target="_blank" rel="noopener noreferrer">
      {source.name}
    </a>
  ) : (
    <>{source.name}</>
  );
}

function Group({ title, rows }: { title: string; rows: Rows }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== false);
  return (
    <div className={styles.srcGroup}>
      <h4 className={styles.srcTitle}>{title}</h4>
      <dl className={styles.srcList}>
        {shown.map(([label, value], i) => (
          <div key={`${label}-${i}`}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Rad som berättar varför en källa saknar data (eller att den hämtas). */
function statusRows<T>(r: DataResult<T> | { status: "loading" } | undefined): Rows | null {
  if (!r || r.status === "loading") return [["Status", "Hämtas…"]];
  if (r.status === "unavailable") return [["Status", `Ej tillgänglig – ${r.reason}`]];
  if (r.status === "not_connected") return [["Status", "Ej ansluten"]];
  if (r.status === "not_applicable") return [["Status", r.reason]];
  return null;
}

const ORIGIN: Record<string, string> = { SMHI: "SMHI", TRAFIKVERKET_VVIS: "Trafikverket (VViS)" };

export function SourcesSection({
  lake,
  asOf,
  conditions: c,
}: {
  lake: Lake;
  asOf?: string;
  conditions: Partial<{ [K in keyof LakeConditions]: L<K> }>;
}) {
  const hist = lake.historicalColdAmount ?? lake.areaHistoricalColdAmount;
  const cold = c.currentCold;
  const coldObs = cold?.status === "ok" ? cold.value : null;
  const meps = c.meps?.status === "ok" ? c.meps.value : null;
  const w = c.weatherRecent?.status === "ok" ? c.weatherRecent.value : null;
  const fc = c.weatherForecast?.status === "ok" ? c.weatherForecast.value : null;
  const station = lake.temperatureStation;

  // Observerat väder: en rad per station (samma station för flera variabler slås ihop).
  const stations = new Map<string, { label: string; vars: string[]; last: string | null }>();
  for (const [name, v] of [
    ["temperatur", w?.temperature],
    ["nederbörd", w?.precipitation],
    ["vind", w?.wind],
  ] as const) {
    if (!v) continue;
    const key = `${v.station.source}:${v.station.id}`;
    const last = v.provenance.time.kind === "observation" ? v.provenance.time.observedAt : null;
    const prev = stations.get(key);
    stations.set(key, {
      label: `${v.station.name} (${ORIGIN[v.station.source] ?? v.station.source}), ${v.station.distanceKm} km från vattnet`,
      vars: [...(prev?.vars ?? []), name],
      last: prev?.last && last && prev.last > last ? prev.last : (last ?? prev?.last ?? null),
    });
  }
  const weatherShown: Rows = stations.size
    ? [
        ["Källa", "SMHI och Trafikverket"],
        ...[...stations.values()].flatMap((s): Rows => [
          ["Plats", `${s.label} – ${s.vars.join(", ")}`],
          ["Tid", s.last ? `senaste värde ${time(s.last)}` : null],
        ]),
      ]
    : [];

  const coldDay = coldObs
    ? formatDateShort(new Date(Date.parse(coldObs.provenance.time.kind === "observation" ? coldObs.provenance.time.observedAt : "") - 1).toISOString().slice(0, 10))
    : null;

  return (
    <Section title="Källor" kinds={[]} status="ok">
      <Group
        title="Historisk köldmängd"
        rows={[
          ["Källa", hist ? <SourceName key="s" source={hist.provenance.source} /> : "Saknas"],
          ["Plats", station ? `${station.name} · ${formatCoord(station.position)}` : null],
          ["Tid", hist ? "median av tidigare säsonger" : null],
        ]}
      />

      <Group
        title={asOf ? `Köldmängd ${formatDate(asOf)}` : "Aktuell köldmängd"}
        rows={
          statusRows(cold) ?? [
            ["Källa", coldObs ? <SourceName key="s" source={coldObs.provenance.source} /> : null],
            ["Plats", coldObs ? `${coldObs.measuringStation.name} (mätstation)` : null],
            ["Tid", coldDay ? `1 okt – ${coldDay}` : null],
          ]
        }
      />

      <Group
        title="Modellerad is och snö"
        rows={
          statusRows(c.meps) ?? [
            ["Källa", meps?.analysis ? <SourceName key="s" source={meps.analysis.provenance.source} /> : null],
            [
              "Plats",
              meps?.analysis?.provenance.quality?.cells
                ? `${meps.analysis.provenance.quality.cells.valid} gitterrutor med sjöyta (${(meps.analysis.provenance.quality.resolutionM ?? 2500) / 1000} km)`
                : null,
            ],
            ["Tid", meps ? `modellkörning ${time(meps.modelRun)}` : null],
          ]
        }
      />

      <Group title="Observerat väder" rows={statusRows(c.weatherRecent) ?? weatherShown} />

      <Group
        title="Väderprognos"
        rows={
          statusRows(c.weatherForecast) ?? [
            ["Källa", fc ? <SourceName key="s" source={fc.provenance.source} /> : null],
            ["Plats", fc ? `vattnets position ${formatCoord(lake.centroid)}` : null],
            ["Tid", fc && fc.provenance.time.kind === "forecast" ? `modellkörning ${time(fc.provenance.time.modelRun)}` : null],
          ]
        }
      />
    </Section>
  );
}
