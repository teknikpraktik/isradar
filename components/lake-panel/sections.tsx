"use client";

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
import type { Lake } from "@/types/lake";
import styles from "./LakePanel.module.css";
import { KindBadge, Row, Section, fmtPct, fmtQ, fmtSignedQ, type Loadable } from "./parts";
import {
  formatPrecipitation,
  formatStation,
  formatSubzeroDuration,
  formatTemperature,
  formatTemperatureRange,
  formatWind,
} from "@/lib/weather/format";

/*
 * Textprincip: siffror först, minimalt med ord. Station, tid och täckning
 * står på en kort metarad. Förklaringar ligger bakom "?" och är en rad.
 */

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

/** "Karlstad Flygplats · 16 km · 23 av 24 h" (täckning bara om ofullständig). */
const stationMeta = (v: { station: WeatherStation; coverage: HourCoverage }) =>
  join(
    formatStation(v.station.name, v.station.distanceKm),
    v.coverage.hours < v.coverage.expectedHours && `${v.coverage.hours} av ${v.coverage.expectedHours} h`,
  );

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
  const run = fc?.[0]?.provenance.time;
  const notHistorical = recent.status === "unavailable" && recent.code === "not_historical";

  return (
    <Section
      title="Väder"
      kinds={[]}
      status={recent.status === "ok" || forecast.status === "ok" || notHistorical ? "ok" : recent.status}
    >
      <h4 className={styles.subhead}>
        Senaste 24 h <KindBadge kind="observation" />
      </h4>
      <Row
        label="Temperatur"
        status={recent.status}
        placeholder={t ? undefined : missing}
        placeholderTitle={missingTitle}
        value={t ? formatTemperatureRange(t.values.min.value, t.values.max.value) : undefined}
        meta={t ? join(`Nu ${formatTemperature(t.values.latest.value)}`, stationMeta(t)) : undefined}
      />
      <Row
        label="Nederbörd"
        status={recent.status}
        placeholder={p ? undefined : missing}
        placeholderTitle={missingTitle}
        value={p ? formatPrecipitation(p.values.sum.value) : undefined}
        meta={p ? stationMeta(p) : undefined}
      />
      <Row
        label="Vind"
        status={recent.status}
        placeholder={wind ? undefined : missing}
        placeholderTitle={missingTitle}
        value={
          wind
            ? formatWind(
                wind.values.latest.value,
                wind.values.latestDirection ? compassSv(wind.values.latestDirection.value) : null,
              )
            : undefined
        }
        meta={
          wind
            ? join(
                `Max ${formatWind(wind.values.maxMean.value)}`,
                wind.values.gustMax && `byar ${formatWind(wind.values.gustMax.value)}`,
                stationMeta(wind),
              )
            : undefined
        }
      />

      <h4 className={styles.subhead}>
        Prognos <KindBadge kind="forecast" />
      </h4>
      {fc ? (
        <div className={styles.forecastGrid}>
          {fc.map((f) => (
            <ForecastBlock key={f.window[0]} f={f} />
          ))}
        </div>
      ) : (
        <Row
          label="Prognos"
          status={forecast.status}
          placeholder={forecast.status === "unavailable" && forecast.code !== "not_historical" ? "Ingen prognosdata" : weatherPlaceholder(forecast)}
          placeholderTitle={forecast.status === "unavailable" ? forecast.reason : undefined}
        />
      )}

      {(w || fc) && (
        <p className={styles.weatherSource}>
          {join("SMHI", run?.kind === "forecast" && `uppdaterad ${formatShortDateTime(run.modelRun)}`)}
          <br />
          CC BY 4.0
        </p>
      )}
    </Section>
  );
}

/** Ett prognosfönster. Prioritet: temperatur, tid under 0 °C, nederbörd, vind. */
function ForecastBlock({ f }: { f: WeatherForecast }) {
  const v = f.values;
  const temp = formatTemperatureRange(v.temperatureMin?.value ?? null, v.temperatureMax?.value ?? null, 0);
  const subzero = v.subzeroHours?.value ?? null;
  const cold = (v.temperatureMin?.value ?? 1) < 0;
  const line = (label: string, value: string | null) => (
    <div className={styles.fcLine}>
      <span>{label}</span>
      <span className={value === null ? styles.placeholder : undefined}>{value ?? "Ingen data"}</span>
    </div>
  );
  return (
    <div className={styles.fcBlock}>
      <div className={styles.fcWindow}>
        {f.window[0]}–{f.window[1]} h
      </div>
      <div className={cold ? `${styles.fcTemp} ${styles.cold}` : styles.fcTemp}>{temp ?? "Ingen data"}</div>
      <div className={styles.fcLine}>
        <span>Tid under 0 °C</span>
        <span className={subzero ? styles.cold : undefined}>{formatSubzeroDuration(subzero) ?? "Ingen data"}</span>
      </div>
      {line("Nederbörd", formatPrecipitation(v.precipitation?.value ?? null))}
      {line("Vind", formatWind(v.windMax?.value ?? null))}
      {line("Byvind", formatWind(v.gustMax?.value ?? null))}
    </div>
  );
}
