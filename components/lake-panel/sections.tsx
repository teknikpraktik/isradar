"use client";

import type { LakeConditions } from "@/lib/data/conditions";
import { distanceKm, formatDate, formatDateShort, formatShortDateTime } from "@/lib/format";
import { COLLECTION_AREA_NOTE, getColdDayStyle } from "@/lib/map/coldScale";
import { compassSv } from "@/lib/weather/compute";
import type {
  ColdAmountObservation,
  SatellitePass,
  WeatherForecast,
  WeatherStation,
} from "@/types/observations";
import type { Lake } from "@/types/lake";
import styles from "./LakePanel.module.css";
import { KindBadge, Row, Section, fmtQ, fmtSignedQ, type Loadable } from "./parts";
import {
  formatPrecipitation,
  formatStation,
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

const fmtNum = (v: number | null | undefined, unit: string) =>
  v === null || v === undefined ? "–" : `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(v)}${unit}`;

export function ModelSection({ meps }: { meps: L<"meps"> }) {
  const run = meps.status === "ok" ? meps.value : null;
  const steps = run ? [run.analysis, ...run.forecasts].filter((s): s is NonNullable<typeof s> => !!s) : [];
  const lead = (s: (typeof steps)[number]) => (s.provenance.time.kind === "forecast" ? s.provenance.time.leadTimeHours : 0);
  const q = steps[0]?.provenance.quality;
  const cellCount = q?.cells ? `${q.cells.valid} av ${q.cells.total} med sjöyta` : null;
  const placeholder =
    meps.status === "unavailable"
      ? meps.code === "not_historical"
        ? "Endast nuläge"
        : meps.code === "no_data_yet"
          ? meps.reason
          : "N/A"
      : undefined;

  return (
    <Section
      title="Modell · MEPS"
      kinds={["model", "forecast"]}
      status={meps.status === "unavailable" ? "ok" : meps.status}
      hintLabel="Information om MEPS-modellen"
      hint={
        <>
          <p className={styles.hintTitle}>MEPS modellprognos</p>
          <p>
            Beräknade förhållanden i modellrutor med cirka 2,5 km upplösning. Inte en lokal mätning av sjön.
          </p>
          <p>Modellen använder den sjöyta som finns representerad i MEPS-rutan.</p>
          {run && (
            <dl className={styles.hintMeta}>
              <dt>Körning</dt>
              <dd>{formatShortDateTime(run.modelRun)}</dd>
              <dt>Upplösning</dt>
              <dd>~{fmtNum((q?.resolutionM ?? 2500) / 1000, " km")}</dd>
              <dt>Sjörutor</dt>
              <dd>{cellCount ?? "–"}</dd>
            </dl>
          )}
          <p>MET Norway · CC BY 4.0</p>
        </>
      }
    >
      {run ? (
        <>
          <div className={styles.forecast}>
            <table>
              <thead>
                <tr>
                  <th scope="col" />
                  {steps.map((s) => (
                    <th key={lead(s)} scope="col" className="num">
                      {lead(s) === 0 ? "Nu" : `+${lead(s)} h`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Istjocklek</th>
                  {steps.map((s) => (
                    <td key={lead(s)}>{fmtNum(s.values.iceThickness?.value, " cm")}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Snö på is</th>
                  {steps.map((s) => (
                    <td key={lead(s)}>{fmtNum(s.values.snowOnIce?.value, " cm")}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Yttemperatur</th>
                  {steps.map((s) => (
                    <td key={lead(s)}>{fmtNum(s.values.surfaceTemperature?.value, "°")}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Row
          label="Istjocklek"
          status={meps.status}
          placeholder={placeholder}
          placeholderTitle={meps.status === "unavailable" ? meps.reason : undefined}
        />
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* SATELLIT – Sentinel                                                 */
/* ------------------------------------------------------------------ */

const ORBIT: Record<string, string> = { ascending: "stigande", descending: "fallande" };

function passValue(p: SatellitePass | null) {
  if (!p || p.provenance.time.kind !== "observation") return undefined;
  return formatShortDateTime(p.provenance.time.observedAt);
}

function passMeta(p: SatellitePass | null) {
  if (!p) return undefined;
  const cloud = p.provenance.quality?.cloudCoverPct;
  return join(p.platform, cloud !== undefined && `moln ${cloud} %`, p.orbitState && ORBIT[p.orbitState]);
}

export function SatelliteSection({ sat }: { sat: L<"satellite"> }) {
  const v = sat.status === "ok" ? sat.value : null;
  const none = v ? `Ingen inom ${v.windowDays} d` : undefined;
  return (
    <Section
      title="Satellit · Sentinel"
      kinds={["observation"]}
      status={sat.status}
      hintLabel="Information om satellitpassager"
      hint={
        <>
          <p className={styles.hintTitle}>Senaste passager</p>
          <p>När Sentinel senast tog en bild över vattnet. Ingen tolkning av is eller vatten ännu.</p>
          <p>Radar (Sentinel-1) ser genom moln och mörker. Optisk (Sentinel-2) kräver klart väder.</p>
          <p>Molnighet gäller hela bildrutan (~110 km), inte vattnet.</p>
          <p>Copernicus Data Space Ecosystem</p>
        </>
      }
    >
      <Row
        label="Radar"
        status={sat.status}
        value={v ? passValue(v.sar) : undefined}
        placeholder={v && !v.sar ? none : undefined}
        meta={v ? passMeta(v.sar) : undefined}
      />
      <Row
        label="Optisk"
        status={sat.status}
        value={v ? passValue(v.optical) : undefined}
        placeholder={v && !v.optical ? none : undefined}
        meta={v ? passMeta(v.optical) : undefined}
      />
      <Row
        label={v ? `Optisk ≤ ${v.clearMaxCloudPct} % moln` : "Optisk, klar"}
        status={sat.status}
        value={v ? passValue(v.opticalClear) : undefined}
        placeholder={v && !v.opticalClear ? none : undefined}
        meta={v ? passMeta(v.opticalClear) : undefined}
      />
      <Row label="Is/vatten" status="not_connected" placeholder="Ej ansluten" />
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

/**
 * "Karlstad Flygplats · 16 km" / "VViS Högåsen · 13 km". VViS-namn (vägpunkter)
 * visar inte källan själva, därav prefixet. Täckning visas inte.
 */
const stationMeta = (v: { station: WeatherStation }) =>
  formatStation(v.station.source === "TRAFIKVERKET_VVIS" ? `VViS ${v.station.name}` : v.station.name, v.station.distanceKm);

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
          Observationer: SMHI + Trafikverket VViS
          <br />
          {join("Prognos: SMHI", run?.kind === "forecast" && `uppdaterad ${formatShortDateTime(run.modelRun)}`)}
          <br />
          SMHI CC BY 4.0 · Källa: Trafikverket
        </p>
      )}
    </Section>
  );
}

/** Ett prognosfönster: temperatur, nederbörd, vind, byvind. */
function ForecastBlock({ f }: { f: WeatherForecast }) {
  const v = f.values;
  const temp = formatTemperatureRange(v.temperatureMin?.value ?? null, v.temperatureMax?.value ?? null, 0);
  const cold = (v.temperatureMin?.value ?? 1) < 0;
  const precip = formatPrecipitation(v.precipitation?.value ?? null);
  const wind = formatWind(v.windMax?.value ?? null);
  const gust = formatWind(v.gustMax?.value ?? null);
  return (
    <div className={styles.fcBlock}>
      <div className={styles.fcWindow}>
        {f.window[0]}–{f.window[1]} h
      </div>
      <div className={cold ? `${styles.fcTemp} ${styles.cold}` : styles.fcTemp}>{temp ?? "Ingen data"}</div>
      <div className={styles.fcLine}>{precip ?? "Nederbörd saknas"}</div>
      <div className={styles.fcLine}>{wind ? `Vind ${wind}` : "Vind saknas"}</div>
      <div className={styles.fcLine}>{gust ? `Byvind ${gust}` : "Byvind saknas"}</div>
    </div>
  );
}
