"use client";

/**
 * Källor och underlag för sjövyn, så detaljerat som datan medger: källa, licens,
 * mätstation (namn, id, avstånd), tidpunkter, täckning och metod – för varje källa
 * som använts för just det här vattnet. Visar bara det som källan faktiskt levererat.
 */
import type { LakeConditions } from "@/lib/data/conditions";
import { formatDate, formatShortDateTime } from "@/lib/format";
import { formatCoord } from "@/lib/format";
import type { Lake } from "@/types/lake";
import type { DataResult, DataSource, Provenance } from "@/types/provenance";
import styles from "./LakePanel.module.css";
import { Section } from "./parts";

type L<K extends keyof LakeConditions> = LakeConditions[K] | { status: "loading" };

type Rows = [label: string, value: React.ReactNode | null | undefined | false][];

const time = (iso: string | undefined) => (iso ? formatShortDateTime(iso) : null);

/** Källnamn med länk och licens, om de finns. */
function SourceName({ source }: { source: DataSource }) {
  return (
    <>
      {source.url ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer">
          {source.name}
        </a>
      ) : (
        source.name
      )}
      {source.license ? ` · ${source.license}` : ""}
    </>
  );
}

function Group({ title, rows }: { title: string; rows: Rows }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== false);
  return (
    <div className={styles.srcGroup}>
      <h4 className={styles.srcTitle}>{title}</h4>
      <dl className={styles.srcList}>
        {shown.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Rad som berättar varför en källa saknar data (eller att den hämtas). */
function statusRows<T>(r: L<never> | DataResult<T> | { status: "loading" } | undefined): Rows | null {
  if (!r || r.status === "loading") return [["Status", "Hämtas…"]];
  if (r.status === "unavailable") return [["Status", `Ej tillgänglig – ${r.reason}`]];
  if (r.status === "not_connected") return [["Status", "Ej ansluten"]];
  if (r.status === "not_applicable") return [["Status", r.reason]];
  return null;
}

const SOURCE_LABEL: Record<string, string> = { SMHI: "SMHI", TRAFIKVERKET_VVIS: "Trafikverket (VViS)" };

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

  const lastDay = (p: Provenance) =>
    p.time.kind === "observation"
      ? formatDate(new Date(Date.parse(p.time.observedAt) - 1).toISOString().slice(0, 10))
      : null;

  const variable = (
    name: string,
    v: {
      station: { id: string; name: string; source: string; distanceKm: number };
      coverage: { hours: number; expectedHours: number };
      provenance: Provenance;
    } | null | undefined,
  ): Rows[number] | null =>
    v
      ? [
          name,
          <>
            {v.station.name} (id {v.station.id}) · {SOURCE_LABEL[v.station.source] ?? v.station.source} ·{" "}
            {v.station.distanceKm} km från vattnet
            {v.provenance.time.kind === "observation" && (
              <>
                <br />
                senaste värde {time(v.provenance.time.observedAt)}
                {v.provenance.time.period && ` · period ${time(v.provenance.time.period.from)} – ${time(v.provenance.time.period.to)}`}
                <br />
                {v.coverage.hours} av {v.coverage.expectedHours} timmar med värde
              </>
            )}
          </>,
        ]
      : null;

  const weatherRows: Rows = [];
  if (w) {
    for (const row of [
      variable("Temperatur", w.temperature),
      variable("Nederbörd", w.precipitation),
      variable("Vind", w.wind),
    ]) {
      if (row) weatherRows.push(row);
    }
    const prov = w.temperature?.provenance ?? w.precipitation?.provenance ?? w.wind?.provenance;
    if (prov) {
      weatherRows.push(["Hämtat", time(prov.retrievedAt)]);
      weatherRows.push(["Källor", <SourceName key="s" source={prov.source} />]);
    }
    const vvis = [w.temperature, w.precipitation, w.wind].some((v) => v?.station.source === "TRAFIKVERKET_VVIS");
    if (vvis) {
      weatherRows.push([
        "Trafikverket",
        "Vägväderstationer (VViS) står vid vägar och representerar inte sjön. Källa: Trafikverket.",
      ]);
    }
  }

  return (
    <Section title="Källor och underlag" kinds={[]} status="ok">
      <Group
        title="Historisk köldmängd (referens)"
        rows={[
          ["Källa", hist ? <SourceName key="s" source={hist.provenance.source} /> : null],
          ["Värde", hist ? `${hist.amount.value} GD` : "Saknas"],
          ["Metod", hist && hist.provenance.time.kind === "historical_reference" ? hist.provenance.time.method : null],
          ["Station i källan", station ? `${station.name} (id ${station.id}) · ${formatCoord(station.position)}` : null],
          ["Objekt-id", String(lake.id)],
        ]}
      />

      <Group
        title={asOf ? `Köldmängd ${formatDate(asOf)}` : "Aktuell köldmängd"}
        rows={
          statusRows(cold) ?? [
            ["Källa", coldObs ? <SourceName key="s" source={coldObs.provenance.source} /> : null],
            ["Mätstation", coldObs ? `${coldObs.measuringStation.name} (id ${coldObs.measuringStation.id})` : null],
            ["Säsong från", coldObs ? formatDate(coldObs.seasonStart.slice(0, 10)) : null],
            ["Data till och med", coldObs ? lastDay(coldObs.provenance) : null],
            ["Dygn utan värde", coldObs ? String(coldObs.missingDays) : null],
            ["Metod", coldObs?.methodDescription],
            ["Hämtat", time(coldObs?.provenance.retrievedAt)],
          ]
        }
      />

      <Group
        title="Modellerad is och snö (MEPS)"
        rows={
          statusRows(c.meps) ?? [
            ["Källa", meps?.analysis ? <SourceName key="s" source={meps.analysis.provenance.source} /> : null],
            ["Modellkörning", time(meps?.modelRun)],
            [
              "Gäller",
              meps?.analysis && meps.analysis.provenance.time.kind === "model"
                ? `${time(meps.analysis.provenance.time.validAt)} (analys), prognos +${meps.forecasts
                    .map((f) => (f.provenance.time.kind === "forecast" ? f.provenance.time.leadTimeHours : null))
                    .filter(Boolean)
                    .join(", +")} h`
                : null,
            ],
            ["Gitterrutor med sjöyta", meps?.analysis?.provenance.quality?.cells ? `${meps.analysis.provenance.quality.cells.valid} av ${meps.analysis.provenance.quality.cells.total}` : null],
            ["Upplösning", meps?.analysis?.provenance.quality?.resolutionM ? `${meps.analysis.provenance.quality.resolutionM / 1000} km` : null],
            ["Hämtat", time(meps?.analysis?.provenance.retrievedAt)],
            ["Obs", "Värdet gäller modellens sjöyta i rutorna, inte nödvändigtvis just det här vattnet."],
          ]
        }
      />

      <Group title="Observerat väder (senaste 24 h)" rows={statusRows(c.weatherRecent) ?? weatherRows} />

      <Group
        title="Väderprognos (48 h)"
        rows={
          statusRows(c.weatherForecast) ?? [
            ["Källa", fc ? <SourceName key="s" source={fc.provenance.source} /> : null],
            ["Läge", fc ? `vid vattnets position ${formatCoord(lake.centroid)}` : null],
            ["Modellkörning", fc && fc.provenance.time.kind === "forecast" ? time(fc.provenance.time.modelRun) : null],
            ["Gäller till", fc && fc.provenance.time.kind === "forecast" ? time(fc.provenance.time.validAt) : null],
            ["Hämtat", time(fc?.provenance.retrievedAt)],
            [
              "Regn eller snö",
              "Enkel tumregel utifrån temperatur: ≤ 0 °C snö, annars regn.",
            ],
          ]
        }
      />

      <Group
        title="Karta och vattenobjekt"
        rows={[
          ["Baskarta", "© OpenStreetMap-bidragsgivare, OpenMapTiles, OpenFreeMap"],
          ["Länsgränser", "SCB (CC0)"],
        ]}
      />
    </Section>
  );
}
