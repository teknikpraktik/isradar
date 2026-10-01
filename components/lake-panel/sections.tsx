"use client";

import type { ReactNode } from "react";
import type { LakeConditions } from "@/lib/data/conditions";
import { MEPS_LEAD_TIMES_H } from "@/lib/data/meps";
import { describeTime, distanceKm, formatDate, formatDateShort, formatShortDateTime } from "@/lib/format";
import { COLLECTION_AREA_NOTE, getColdDayStyle } from "@/lib/map/coldScale";
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

/*
 * Textprincip: siffror först, minimalt med ord. Station, tid och täckning
 * står på en kort metarad. Förklaringar ligger bakom "?" och är en rad.
 */

const nf1 = (v: number) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(v);
const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/** Datakälla som kan vara under hämtning. */
type L<K extends keyof LakeConditions> = LakeConditions[K] | { status: "loading" };

/* ------------------------------------------------------------------ */
/* KÖLDMÄNGD                                                           */
/* ------------------------------------------------------------------ */

/** "t.o.m. 15 feb · Örebro Flygplats · 2 d saknas" */
function coldMeta(c: ColdAmountObservation): string {
  const t = c.provenance.time;
  if (t.kind !== "observation") return "";
  const lastDay = new Date(Date.parse(t.observedAt) - 1).toISOString().slice(0, 10);
  return join(`t.o.m. ${formatDateShort(lastDay)}`, c.measuringStation.name, c.missingDays > 0 && `${c.missingDays} d saknas`);
}

/** Aldrig "0 GD" när data saknas. */
function currentColdPlaceholder(cold: Loadable<ColdAmountObservation>, row: "value" | "change") {
  if (cold.status !== "unavailable") return undefined;
  if (row === "change") return "–";
  return cold.code === "no_data_yet" ? "Ingen ackumulerad köld ännu" : "N/A";
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
  if (lake.areaType === "COLLECTION_AREA") return <CollectionAreaOverview lake={lake} />;

  const hca = lake.historicalColdAmount;
  const station = lake.temperatureStation;
  const current = cold.status === "ok" ? cold.value : null;
  const reason = cold.status === "unavailable" ? cold.reason : undefined;
  return (
    <Section title="Köldmängd" kinds={["historical_reference", "observation"]} status="ok">
      <Row
        label="Historisk köldmängd"
        value={hca ? <ColdValue lake={lake} gd={hca.amount.value} /> : undefined}
        placeholder={hca ? undefined : "Saknas"}
        hint="Median vid första rapporterade åkning (Skridskonätet). GD = graddagar. Ingen säkerhetsgräns."
      />
      {lake.parent && <Row label="Del av" value={lake.parent.name} />}
      <Row
        label="Temperaturstation"
        value={station?.name}
        placeholder={station ? undefined : "Ingen"}
        meta={station ? `${Math.round(distanceKm(lake.centroid, station.position))} km` : undefined}
      />
      <Row
        label={asOf ? `Köldmängd ${formatDate(asOf)}` : "Aktuell köldmängd"}
        status={cold.status}
        placeholder={currentColdPlaceholder(cold, "value")}
        placeholderTitle={reason}
        value={current ? <ColdValue lake={lake} gd={current.accumulated.value} /> : undefined}
        meta={current ? coldMeta(current) : undefined}
        hint="Från 1 okt. SMHI-dygnsmedel vid stationen, netto, golv 0."
      />
      <Row
        label="Förändring 24 h"
        status={cold.status}
        placeholder={currentColdPlaceholder(cold, "change") ?? (current && !current.change24h ? "–" : undefined)}
        placeholderTitle={reason}
        value={fmtSignedQ(current?.change24h)}
      />
      <Row
        label="Förändring 7 d"
        status={cold.status}
        placeholder={currentColdPlaceholder(cold, "change") ?? (current && !current.change7d ? "–" : undefined)}
        placeholderTitle={reason}
        value={fmtSignedQ(current?.change7d)}
      />
    </Section>
  );
}

/** GD-värde med klassfärg – via samma centrala regel som kartan. */
function ColdValue({ lake, gd }: { lake: Lake; gd: number }) {
  const style = getColdDayStyle(lake.areaType, gd);
  return (
    <span className={styles.coldValue}>
      {style.kind === "class" && (
        <span className={styles.classSwatch} style={{ background: style.cls.color }} aria-hidden />
      )}
      {fmtQ({ value: gd, unit: "GD" })}
    </span>
  );
}

/**
 * Samlingsområde: ingen sjöspecifik GD. Ev. historiskt värde visas separat
 * som områdeshistorik, utan klassfärg.
 */
function CollectionAreaOverview({ lake }: { lake: Lake }) {
  const area = lake.areaHistoricalColdAmount;
  const station = lake.temperatureStation;
  return (
    <>
      <Section title="Köldmängd" kinds={[]} status="ok">
        <Row label="Områdestyp" value="Samlingsområde" />
        <Row label="GD-klassificering" status="not_applicable" placeholder="Ej tillämpad" hint={COLLECTION_AREA_NOTE} />
      </Section>
      {area && (
        <Section title="Områdeshistorik" kinds={["historical_reference"]} status="ok">
          <Row
            label="Historisk områdesobservation"
            value={fmtQ(area.amount)}
            meta={station ? `${station.name} ${Math.round(distanceKm(lake.centroid, station.position))} km` : undefined}
            hint="Källans värde för hela området. Används inte för färgsättning."
          />
        </Section>
      )}
    </>
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
      source={run ? `MEPS · körning ${formatShortDateTime(run.modelRun)}` : undefined}
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
        return <Row key={h} label={`Istjocklek +${h} h`} status={meps.status} value={fmtQ(f?.values.iceThickness)} />;
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
    ? join(q.flag, q.cloudCoverPct !== undefined && `moln ${q.cloudCoverPct} %`, q.resolutionM !== undefined && `${q.resolutionM} m`)
    : undefined;
  return (
    <Section title="Satellit · Sentinel" kinds={["observation"]} status={sat.status}>
      <Row
        label="Senaste"
        status={sat.status}
        value={o ? `${o.platform} ${o.sensor === "SAR" ? "radar" : "optisk"}` : undefined}
        meta={o ? describeTime(o.provenance.time) : undefined}
      />
      <Row label="Is" status={sat.status} value={fmtPct(o?.icePct)} />
      <Row label="Vatten" status={sat.status} value={fmtPct(o?.waterPct)} />
      <Row label="Okänt" status={sat.status} value={fmtPct(o?.unknownPct)} />
      <Row label="Kvalitet" status={sat.status} value={quality || undefined} />
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* VÄDER                                                               */
/* ------------------------------------------------------------------ */

function weatherPlaceholder(r: L<"weatherRecent"> | L<"weatherForecast">): string | undefined {
  if (r.status !== "unavailable") return undefined;
  if (r.code === "not_historical") return "Endast nuläge";
  if (r.code === "no_data_yet") return "Ingen station";
  return "N/A";
}

/** "Karlstad Flygplats 18 km · 17/24 h" (täckning bara om ofullständig). */
const stationMeta = (v: { station: WeatherStation; coverage: HourCoverage }) =>
  join(
    `${v.station.name} ${v.station.distanceKm} km`,
    v.coverage.hours < v.coverage.expectedHours && `${v.coverage.hours}/${v.coverage.expectedHours} h`,
  );

const span = (a: Quantity | null | undefined, b: Quantity | null | undefined, unit = true): ReactNode =>
  a && b ? (
    <>
      <span className="num">{nf1(a.value)}</span> … {unit ? fmtQ(b) : <span className="num">{nf1(b.value)}</span>}
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
  const title = recent.status === "unavailable" ? recent.reason : undefined;
  // En enskild variabel kan saknas även när källan svarar.
  const missing = w ? "Ingen station" : weatherPlaceholder(recent);
  const missingTitle = w ? "Ingen SMHI-station inom 50 km" : title;

  const t = w?.temperature;
  const p = w?.precipitation;
  const wind = w?.wind;
  const precipIncomplete = p && p.coverage.hours < p.coverage.expectedHours;

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
      source={w || fc ? "SMHI (CC BY 4.0)" : undefined}
    >
      <Row
        label="Temperatur 24 h"
        status={recent.status}
        placeholder={t ? undefined : missing}
        placeholderTitle={missingTitle}
        value={t ? span(t.values.min, t.values.max) : undefined}
        meta={t ? join(`nu ${nf1(t.values.latest.value)} °C`, stationMeta(t)) : undefined}
      />
      <Row
        label="Nederbörd 24 h"
        status={recent.status}
        placeholder={p ? undefined : missing}
        placeholderTitle={missingTitle}
        value={p ? <>{precipIncomplete && "≥ "}{fmtQ(p.values.sum)}</> : undefined}
        meta={p ? stationMeta(p) : undefined}
      />
      <Row
        label="Vind"
        status={recent.status}
        placeholder={wind ? undefined : missing}
        placeholderTitle={missingTitle}
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
            ? join(
                `max ${nf1(wind.values.maxMean.value)}`,
                wind.values.gustMax && `byar ${nf1(wind.values.gustMax.value)}`,
                stationMeta(wind),
              )
            : undefined
        }
      />
      {fc ? (
        <ForecastTable forecasts={fc} />
      ) : (
        <Row
          label="Prognos"
          status={forecast.status}
          placeholder={weatherPlaceholder(forecast)}
          placeholderTitle={forecast.status === "unavailable" ? forecast.reason : undefined}
        />
      )}
    </Section>
  );
}

/** Kompakt prognostabell: en kolumn per tidsfönster. */
function ForecastTable({ forecasts }: { forecasts: WeatherForecast[] }) {
  const anyPrecip = forecasts.some((f) => (f.values.precipitation?.value ?? 0) > 0);
  const run = forecasts[0]?.provenance.time;
  return (
    <div className={styles.forecast}>
      <table>
        <thead>
          <tr>
            <th scope="col">Prognos</th>
            {forecasts.map((f) => (
              <th key={f.window[0]} scope="col" className="num">
                +{f.window[0]}–{f.window[1]} h
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">°C</th>
            {forecasts.map((f) => (
              <td key={f.window[0]}>{span(f.values.temperatureMin, f.values.temperatureMax, false) ?? "–"}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">mm</th>
            {forecasts.map((f) => (
              <td key={f.window[0]} className="num">
                {f.values.precipitation ? nf1(f.values.precipitation.value) : "–"}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" title="Högsta medelvind (byar)">m/s</th>
            {forecasts.map((f) => (
              <td key={f.window[0]} className="num">
                {f.values.windMax ? nf1(f.values.windMax.value) : "–"}
                {f.values.gustMax && <span className={styles.dim}> ({nf1(f.values.gustMax.value)})</span>}
              </td>
            ))}
          </tr>
          {anyPrecip && (
            <tr>
              <th scope="row" title="Högsta sannolikhet för fryst nederbörd">Fryst %</th>
              {forecasts.map((f) => (
                <td key={f.window[0]}>{f.values.frozenPrecipitationProbabilityMax?.value ?? "–"}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {run?.kind === "forecast" && <p className={styles.meta}>körning {formatShortDateTime(run.modelRun)}</p>}
    </div>
  );
}
