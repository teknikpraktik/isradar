"use client";

import type { LakeConditions } from "@/lib/data/conditions";
import { distanceKm, formatDate, formatDateShort, formatShortDateTime } from "@/lib/format";
import { COLLECTION_AREA_NOTE, getColdDayStyle } from "@/lib/map/coldScale";
import type { SatelliteScene } from "@/lib/satellite/api";
import { compassSv } from "@/lib/weather/compute";
import { formatSnowfall } from "@/lib/weather/precipitation";
import Meteogram from "./Meteogram";
import Sparkline from "./Sparkline";
import { MIN_SPARKLINE_POINTS } from "@/lib/weather/meteogram";

const PRECIP_HINT =
  "Anges som vattenekvivalent: 1 mm = 1 liter vatten per m². Vid snöfall kan nysnön bli flera gånger djupare. SMHI:s prognos saknar egen snöparameter – beräknad nysnö är en grov temperaturbaserad uppskattning. Skiljs från MEPS snö på is (befintligt snötäcke).";
import type {
  ColdAmountObservation,
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

type ActiveSat = { scene: SatelliteScene; opacity: number } | null;

const sceneMeta = (s: SatelliteScene) =>
  join(s.platform, s.cloudCoverPct !== null && `moln ${Math.round(s.cloudCoverPct)} %`, s.orbitState && ORBIT[s.orbitState]);

/** "1 okt" – datumdel av kort tid. */
const shortDay = (iso: string) => formatShortDateTime(iso).split(" ").slice(0, 2).join(" ");

/** Ett sensorblock: senaste scen, knapp, och när aktivt: opacitet + scenbyte. */
function SensorBlock({
  title,
  showLabel,
  activeLabel,
  scenes,
  emptyText,
  active,
  onShow,
  onOpacity,
}: {
  title: string;
  showLabel: string;
  activeLabel: string;
  scenes: SatelliteScene[];
  emptyText: string;
  active: ActiveSat;
  onShow: (s: SatelliteScene | null) => void;
  onOpacity: (o: number) => void;
}) {
  const idx = active ? scenes.findIndex((s) => s.id === active.scene.id) : -1;
  const isActive = idx >= 0;
  const scene = isActive ? scenes[idx] : scenes[0];
  return (
    <div className={styles.satBlock}>
      <h4 className={styles.subhead}>{title}</h4>
      {scene ? (
        <>
          <div className={styles.satTime}>{formatShortDateTime(scene.acquiredAt)}</div>
          <p className={styles.satMeta}>{sceneMeta(scene)}</p>
          <button
            type="button"
            className={isActive ? `${styles.satBtn} ${styles.satBtnOn}` : styles.satBtn}
            aria-pressed={isActive}
            onClick={() => onShow(isActive ? null : scene)}
          >
            {isActive ? `✓ ${activeLabel}` : showLabel}
          </button>
          {isActive && active && (
            <div className={styles.satControls}>
              <label className={styles.opacity}>
                <span>Opacitet</span>
                <input
                  type="range"
                  min={30}
                  max={100}
                  step={5}
                  value={Math.round(active.opacity * 100)}
                  onChange={(e) => onOpacity(Number(e.target.value) / 100)}
                  aria-label="Satellitbildens opacitet"
                />
                <span className="num">{Math.round(active.opacity * 100)} %</span>
              </label>
              {scenes.length > 1 && (
                <div className={styles.sceneNav}>
                  <button
                    type="button"
                    disabled={idx >= scenes.length - 1}
                    onClick={() => onShow(scenes[idx + 1])}
                    aria-label="Äldre scen"
                  >
                    ‹ {idx < scenes.length - 1 ? shortDay(scenes[idx + 1].acquiredAt) : ""}
                  </button>
                  <span className="num">
                    {idx + 1}/{scenes.length}
                  </span>
                  <button type="button" disabled={idx <= 0} onClick={() => onShow(scenes[idx - 1])} aria-label="Nyare scen">
                    {idx > 0 ? shortDay(scenes[idx - 1].acquiredAt) : ""} ›
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p className={styles.satMeta}>{emptyText}</p>
      )}
    </div>
  );
}

export function SatelliteSection({
  sat,
  active,
  onShow,
  onOpacity,
}: {
  sat: L<"satellite">;
  active: ActiveSat;
  onShow: (s: SatelliteScene | null) => void;
  onOpacity: (o: number) => void;
}) {
  const v = sat.status === "ok" ? sat.value : null;
  const optical = v ? (v.optical.length ? v.optical : v.opticalAny ? [v.opticalAny] : []) : [];
  return (
    <Section
      title="Satellit · Sentinel"
      kinds={["observation"]}
      status={sat.status === "unavailable" ? "ok" : sat.status}
      hintLabel="Information om Sentinel-satellitdata"
      hint={
        <>
          <p className={styles.hintTitle}>Sentinel-satellitdata</p>
          <p>Sentinel-1 är radar och fungerar genom moln och mörker.</p>
          <p>
            Radarbilden mäter inte istjocklek eller säker is. Vatten, is, snö och vindpåverkad yta kan ge olika
            radarsignaturer.
          </p>
          <p>Sentinel-2 är optisk och påverkas av moln och dagsljus. Molnighet gäller hela bildrutan.</p>
          <p>Tolka tillsammans med övriga indikatorer.</p>
          <p>Copernicus Sentinel-data · Microsoft Planetary Computer</p>
        </>
      }
    >
      {v ? (
        <>
          <SensorBlock
            title="Radar"
            showLabel="Visa radar på kartan"
            activeLabel="Radar visas"
            scenes={v.sar}
            emptyText={`Ingen radarbild senaste ${v.windowDays} d`}
            active={active?.scene.sensor === "SAR" ? active : null}
            onShow={onShow}
            onOpacity={onOpacity}
          />
          <SensorBlock
            title={v.optical.length ? `Optisk ≤ ${v.clearMaxCloudPct} % moln` : "Optisk"}
            showLabel="Visa optisk bild"
            activeLabel="Optisk bild visas"
            scenes={optical}
            emptyText={`Ingen optisk bild senaste ${v.windowDays} d`}
            active={active?.scene.sensor === "optical" ? active : null}
            onShow={onShow}
            onOpacity={onOpacity}
          />
        </>
      ) : (
        <Row
          label="Satellitbilder"
          status={sat.status}
          placeholder={sat.status === "unavailable" ? "Kunde inte hämtas" : undefined}
          placeholderTitle={sat.status === "unavailable" ? sat.reason : undefined}
        />
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* VÄDER                                                               */
/* ------------------------------------------------------------------ */

/** Observationsperiod (samma för alla parametrar: nu − 24 h → nu). */
function periodOf(v: { provenance: { time: { kind: string; period?: { from: string; to: string } } } }) {
  const p = v.provenance.time.period;
  const to = p?.to ?? new Date().toISOString();
  return { from: p?.from ?? new Date(Date.parse(to) - 24 * 3_600_000).toISOString(), to };
}

/**
 * Observationsblock: etikett, valfri sparkline, huvudvärde, sekundärt värde
 * och station. Ingen kortram – sektionens luft räcker.
 */
function ObsBlock({
  label,
  hint,
  sparkline,
  value,
  secondary,
  meta,
}: {
  label: string;
  hint?: string;
  sparkline: React.ReactNode;
  value: string | null;
  secondary?: string | null;
  meta: string;
}) {
  return (
    <div className={styles.obsBlock}>
      <Row label={label} hint={hint} value={value ?? undefined} />
      {sparkline}
      <p className={styles.obsMeta}>{join(secondary, meta)}</p>
    </div>
  );
}

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
  const run = fc?.provenance.time;
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
      {t ? (
        <ObsBlock
          label="Temperatur"
          sparkline={
            t.series.length >= MIN_SPARKLINE_POINTS ? (
              <Sparkline kind="temperature" series={t.series} from={periodOf(t).from} to={periodOf(t).to} />
            ) : null
          }
          value={`Nu ${formatTemperature(t.values.latest.value)}`}
          secondary={formatTemperatureRange(t.values.min.value, t.values.max.value)}
          meta={stationMeta(t)}
        />
      ) : (
        <Row label="Temperatur" status={recent.status} placeholder={missing} placeholderTitle={missingTitle} />
      )}
      {p ? (
        <ObsBlock
          label="Nederbörd"
          hint={PRECIP_HINT}
          sparkline={
            // Vid 0 mm finns ingen timing att visa – bara texten.
            p.series.length >= MIN_SPARKLINE_POINTS && p.values.sum.value > 0 ? (
              <Sparkline kind="precipitation" series={p.series} from={periodOf(p).from} to={periodOf(p).to} />
            ) : null
          }
          value={
            p.values.sum.value > 0
              ? `${formatPrecipitation(p.values.sum.value)} totalt`
              : formatPrecipitation(p.values.sum.value)
          }
          meta={stationMeta(p)}
        />
      ) : (
        <Row label="Nederbörd" hint={PRECIP_HINT} status={recent.status} placeholder={missing} placeholderTitle={missingTitle} />
      )}
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
        Prognos · 48 h <KindBadge kind="forecast" />
      </h4>
      {fc ? (
        <>
          <Meteogram hours={fc.hours} />
          {fc.forecastSnowfall && (
            <p className={styles.snowNote}>
              {fc.forecastSnowfall.estimated ? "Beräknad nysnö 48 h" : "Nysnö 48 h"}{" "}
              {formatSnowfall([fc.forecastSnowfall.minCm, fc.forecastSnowfall.maxCm])}
            </p>
          )}
        </>
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
