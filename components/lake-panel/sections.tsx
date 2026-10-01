"use client";

import { HISTORICAL_COLD_METHOD, LARGE_LAKE_COLD_REASON } from "@/lib/data/cold";
import { MEPS_LEAD_TIMES_H } from "@/lib/data/meps";
import { describeTime, distanceKm, formatAge, formatDate, formatDateTime } from "@/lib/format";
import { COLD_INDICATOR_NOTE, coldDayClassFor } from "@/lib/map/coldScale";
import { SOURCES } from "@/lib/sources";
import type { LakeConditions } from "@/lib/data/conditions";
import { compassSv } from "@/lib/weather/compute";
import type {
  ColdAmountObservation,
  HourCoverage,
  WeatherForecast,
  WeatherStation,
} from "@/types/observations";
import type { Quantity } from "@/types/provenance";
import type { Lake } from "@/types/lake";
import styles from "./LakePanel.module.css";
import { Row, Section, fmtPct, fmtQ, fmtSignedQ, type Loadable } from "./parts";

const nf1 = (v: number) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(v);

/** Datakälla som kan vara under hämtning. */
type L<K extends keyof LakeConditions> = LakeConditions[K] | { status: "loading" };

/** "Dygnsmedel t.o.m. 15 feb 2026 · SMHI Blomskog A · 2 dygn saknas" */
function coldMeta(c: ColdAmountObservation, asOf?: string): string {
  const t = c.provenance.time;
  if (t.kind !== "observation") return "";
  const lastDay = new Date(Date.parse(t.observedAt) - 1).toISOString().slice(0, 10);
  const parts = [`Dygnsmedel t.o.m. ${formatDate(lastDay)}`];
  if (!asOf) parts[0] += ` (${formatAge(t.observedAt)} sedan)`;
  parts.push(`SMHI ${c.measuringStation.name}`);
  if (c.missingDays > 0) parts.push(`${c.missingDays} dygn saknas`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* ÖVERSIKT                                                            */
/* ------------------------------------------------------------------ */

const GD_HINT = (
  <>
    <abbr title="graddagar">GD</abbr> = graddagar, ett mått på ackumulerad kyla (dygnsmedeltemperaturer
    under 0 °C summerade över tid). {COLD_INDICATOR_NOTE}
  </>
);

/** Platshållare för aktuell köldmängd när värde saknas – aldrig "0 GD" om data saknas. */
function currentColdPlaceholder(cold: Loadable<ColdAmountObservation>, row: "value" | "change") {
  if (cold.status !== "unavailable") return undefined;
  if (cold.code === "no_data_yet") return row === "value" ? "Ingen ackumulerad köld ännu" : "Ingen data ännu";
  return "N/A";
}

export function OverviewSection({
  lake,
  cold,
  asOf,
}: {
  lake: Lake;
  cold: Loadable<ColdAmountObservation>;
  asOf?: string;
}) {
  if (lake.modelType === "LARGE_LAKE_OPEN_WATER") return <LargeLakeOverview lake={lake} />;

  const hca = lake.historicalColdAmount;
  const station = lake.temperatureStation;
  const current = cold.status === "ok" ? cold.value : null;
  const reason = cold.status === "unavailable" ? cold.reason : undefined;
  return (
    <Section title="Köldmängd" kinds={["historical_reference", "observation"]} status="ok">
      <Row
        label="Historisk köldmängd"
        value={hca ? <ColdValue gd={hca.amount.value} /> : undefined}
        placeholder={hca ? undefined : "Värde saknas"}
        hint={
          <>
            {HISTORICAL_COLD_METHOD}. Beräknat ur tidigare säsonger av Skridskonätet. Ett historiskt
            referensvärde – ingen säkerhetsgräns och ingen beskrivning av isen nu.
            <br />
            {GD_HINT}
          </>
        }
      />
      <Row
        label="Temperaturstation"
        value={station?.name}
        placeholder={station ? undefined : "Ingen kopplad"}
        meta={
          station
            ? `${Math.round(distanceKm(lake.centroid, station.position))} km från vattnet`
            : undefined
        }
        hint="Station vars temperaturserie Skridskonätets modell använder för detta vatten."
      />
      <Row
        label={asOf ? `Köldmängd ${formatDate(asOf)}` : "Aktuell köldmängd"}
        status={cold.status}
        placeholder={currentColdPlaceholder(cold, "value")}
        placeholderTitle={reason}
        value={current ? <ColdValue gd={current.accumulated.value} /> : undefined}
        meta={current ? coldMeta(current, asOf) : undefined}
        hint={
          <>
            Innevarande säsong, separat från den historiska köldmängden. Beräknad av ISRADAR ur
            SMHI:s uppmätta dygnsmedeltemperaturer vid temperaturstationen, från 1 oktober.
            Minusgrader ökar och plusgrader minskar värdet, som aldrig blir under 0. Gäller
            stationen, inte vattnet. Metoden kan avvika från Skridskonätets beräkning av den
            historiska köldmängden.
          </>
        }
      />
      <Row
        label="Förändring 24 h"
        status={cold.status}
        placeholder={currentColdPlaceholder(cold, "change") ?? (current && !current.change24h ? "Jämförelsedygn saknas" : undefined)}
        placeholderTitle={reason}
        value={fmtSignedQ(current?.change24h)}
      />
      <Row
        label="Förändring 7 dygn"
        status={cold.status}
        placeholder={currentColdPlaceholder(cold, "change") ?? (current && !current.change7d ? "Jämförelsedygn saknas" : undefined)}
        placeholderTitle={reason}
        value={fmtSignedQ(current?.change7d)}
      />
    </Section>
  );
}

/** GD-värde med samma klassfärg som kartan. */
function ColdValue({ gd }: { gd: number }) {
  const cls = coldDayClassFor(gd);
  return (
    <span className={styles.coldValue}>
      <span className={styles.classSwatch} style={{ background: cls.color }} aria-hidden />
      {fmtQ({ value: gd, unit: "GD" })}
    </span>
  );
}

/** Stor sjö, öppet vatten: normal GD-modell används inte. Inga GD-fält visas. */
function LargeLakeOverview({ lake }: { lake: Lake }) {
  return (
    <Section title="Köldmängd" kinds={[]} status="not_applicable">
      <p className={styles.largeLake}>
        <strong>{lake.largeLake?.name ?? "Stor sjö"} – öppet vatten</strong>
      </p>
      <Row
        label="Köldmängd"
        status="not_applicable"
        hint={
          <>
            Medvetet modellval, inte saknad data. Vänern har stor termisk tröghet och stora
            skillnader mellan öppet vatten, grunda vikar, skärgård och kustnära vatten – en enda
            lufttemperaturbaserad GD-siffra skulle bli missvisande. Vikar och skärgårdar som egna
            vattenobjekt klassificeras som vanligt. Senare kan t.ex. ytvattentemperatur, vind,
            satellit- och isobservationer användas här.
          </>
        }
      />
      <p className={styles.largeLakeNote}>{LARGE_LAKE_COLD_REASON}</p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* MODELL – MEPS                                                       */
/* ------------------------------------------------------------------ */

export function ModelSection({ meps }: { meps: L<"meps"> }) {
  const run = meps.status === "ok" ? meps.value : null;
  const a = run?.analysis;
  return (
    <Section
      title="Modell · MEPS"
      kinds={["model", "forecast"]}
      status={meps.status}
      source={run ? `${SOURCES.meps.name}, körning ${formatDateTime(run.modelRun)}` : undefined}
    >
      <Row
        label="Istjocklek"
        status={meps.status}
        value={fmtQ(a?.values.iceThickness)}
        meta={a ? describeTime(a.provenance.time) : undefined}
      />
      <Row label="Snö på is" status={meps.status} value={fmtQ(a?.values.snowOnIce)} />
      <Row label="Yttemperatur" status={meps.status} value={fmtQ(a?.values.surfaceTemperature)} />
      {MEPS_LEAD_TIMES_H.map((h) => {
        const f = run?.forecasts.find(
          (x) => x.provenance.time.kind === "forecast" && x.provenance.time.leadTimeHours === h,
        );
        return (
          <Row
            key={h}
            label={`Prognos +${h} h`}
            status={meps.status}
            value={fmtQ(f?.values.iceThickness)}
            meta={f ? describeTime(f.provenance.time) : undefined}
          />
        );
      })}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* SATELLIT – Sentinel                                                 */
/* ------------------------------------------------------------------ */

export function SatelliteSection({ sat }: { sat: L<"satellite"> }) {
  const o = sat.status === "ok" ? sat.value : null;
  const q = o?.provenance.quality;
  const quality = q
    ? [
        q.flag && `kvalitet ${q.flag}`,
        q.cloudCoverPct !== undefined && `moln ${q.cloudCoverPct} %`,
        q.resolutionM !== undefined && `${q.resolutionM} m`,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;
  return (
    <Section title="Satellit · Sentinel" kinds={["observation"]} status={sat.status}>
      <Row label="Senaste observation" status={sat.status} value={o?.platform} />
      <Row
        label="Observationstid"
        status={sat.status}
        value={o ? describeTime(o.provenance.time) : undefined}
      />
      <Row label="Is" status={sat.status} value={fmtPct(o?.icePct)} />
      <Row label="Vatten" status={sat.status} value={fmtPct(o?.waterPct)} />
      <Row label="Okänt" status={sat.status} value={fmtPct(o?.unknownPct)} />
      <Row
        label="Satellittyp"
        status={sat.status}
        value={o ? (o.sensor === "SAR" ? "Radar (SAR)" : "Optisk") : undefined}
      />
      <Row label="Datakvalitet" status={sat.status} value={quality || undefined} />
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* VÄDER                                                               */
/* ------------------------------------------------------------------ */

/** Platshållare för väder när hela källan saknas. */
function weatherPlaceholder(r: L<"weatherRecent"> | L<"weatherForecast">): string | undefined {
  if (r.status !== "unavailable") return undefined;
  if (r.code === "not_historical") return "Endast nuläge";
  if (r.code === "no_data_yet") return "Ingen station inom 50 km";
  return "N/A";
}

const stationMeta = (v: { station: WeatherStation; coverage: HourCoverage }) => {
  const parts = [`SMHI ${v.station.name}, ${v.station.distanceKm} km`];
  if (v.coverage.hours < v.coverage.expectedHours) parts.push(`${v.coverage.hours} av ${v.coverage.expectedHours} h`);
  return parts.join(" · ");
};

const range = (a: Quantity | null | undefined, b: Quantity | null | undefined) =>
  a && b ? (
    <>
      <span className="num">{nf1(a.value)}</span> … {fmtQ(b)}
    </>
  ) : undefined;

export function WeatherSection({
  recent,
  forecast,
}: {
  recent: L<"weatherRecent">;
  forecast: L<"weatherForecast">;
}) {
  const w = recent.status === "ok" ? recent.value : null;
  const fc = forecast.status === "ok" ? forecast.value : null;
  const recentPh = weatherPlaceholder(recent);
  const recentTitle = recent.status === "unavailable" ? recent.reason : undefined;
  // En variabel kan saknas även när källan svarar (ingen station inom 50 km).
  const missingVar = w ? "Ingen station inom 50 km" : recentPh;

  const t = w?.temperature;
  const p = w?.precipitation;
  const wind = w?.wind;
  const precipIncomplete = p && p.coverage.hours < p.coverage.expectedHours;

  const fcRow = (f: WeatherForecast) => ({
    value: (
      <>
        {range(f.values.temperatureMin, f.values.temperatureMax) ?? "–"}
        {f.values.precipitation && <> · {fmtQ(f.values.precipitation)}</>}
      </>
    ),
    meta: [
      f.values.windMax &&
        `vind max ${nf1(f.values.windMax.value)}${f.values.gustMax ? ` (byar ${nf1(f.values.gustMax.value)})` : ""} m/s`,
      f.values.frozenPrecipitationProbabilityMax &&
        f.values.precipitation &&
        f.values.precipitation.value > 0 &&
        `risk fryst nederbörd max ${f.values.frozenPrecipitationProbabilityMax.value} %`,
      f.provenance.time.kind === "forecast" && `körning ${formatDateTime(f.provenance.time.modelRun)}`,
    ]
      .filter(Boolean)
      .join(" · "),
  });

  return (
    <Section
      title="Väder"
      kinds={["observation", "forecast"]}
      status={
        recent.status === "ok" ||
        forecast.status === "ok" ||
        (recent.status === "unavailable" && recent.code === "not_historical")
          ? "ok"
          : recent.status
      }
      source={w || fc ? "SMHI Öppna data (CC BY 4.0)" : undefined}
    >
      <Row
        label="Temperatur senaste 24 h"
        status={recent.status}
        placeholder={t ? undefined : missingVar}
        placeholderTitle={recentTitle}
        value={t ? range(t.values.min, t.values.max) : undefined}
        meta={t ? `nu ${nf1(t.values.latest.value)} °C · ${stationMeta(t)}` : undefined}
      />
      <Row
        label="Nederbörd senaste 24 h"
        status={recent.status}
        placeholder={p ? undefined : missingVar}
        placeholderTitle={recentTitle}
        value={p ? <>{precipIncomplete && "minst "}{fmtQ(p.values.sum)}</> : undefined}
        meta={p ? stationMeta(p) : undefined}
        hint="Uppmätt mängd vid stationen, oavsett om det fallit som regn eller snö. Saknas timmar är summan en underskattning."
      />
      <Row
        label="Vind"
        status={recent.status}
        placeholder={wind ? undefined : missingVar}
        placeholderTitle={recentTitle}
        value={
          wind ? (
            <>
              {fmtQ(wind.values.latest)}
              {wind.values.latestDirection && <> {compassSv(wind.values.latestDirection.value)}</>}
            </>
          ) : undefined
        }
        meta={
          wind
            ? [
                `max medel ${nf1(wind.values.maxMean.value)}`,
                wind.values.gustMax && `byar ${nf1(wind.values.gustMax.value)}`,
              ]
                .filter(Boolean)
                .join(" · ") + ` m/s senaste 24 h · ${stationMeta(wind)}`
            : undefined
        }
      />
      {(fc ?? [null, null]).map((f, i) => {
        const label = f ? `Prognos +${f.window[0]}–${f.window[1]} h` : i === 0 ? "Prognos +0–24 h" : "Prognos +24–48 h";
        const row = f ? fcRow(f) : null;
        return (
          <Row
            key={label}
            label={label}
            status={forecast.status}
            placeholder={weatherPlaceholder(forecast)}
            placeholderTitle={forecast.status === "unavailable" ? forecast.reason : undefined}
            value={row?.value}
            meta={row?.meta}
          />
        );
      })}
    </Section>
  );
}
