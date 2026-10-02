"use client";

import type { LakeConditions } from "@/lib/data/conditions";
import { distanceKm, formatDate, formatShortDateTime } from "@/lib/format";
import { COLLECTION_AREA_NOTE, formatProgressPercent, getColdProgress } from "@/lib/map/coldScale";
import type { SatelliteScene } from "@/lib/satellite/api";
import { useMemo } from "react";
import { formatSnowfall } from "@/lib/weather/precipitation";
import Meteogram from "./Meteogram";
import { observationHours, sharedScales } from "@/lib/weather/meteogram";

const PRECIP_HINT =
  "Anges som vattenekvivalent: 1 mm = 1 liter vatten per m². Vid snöfall kan nysnön bli flera gånger djupare. SMHI:s prognos saknar egen snöparameter – beräknad nysnö är en grov temperaturbaserad uppskattning. Skiljs från MEPS snö på is (befintligt snötäcke). Regn eller snö i diagrammen avgörs av en enkel tumregel: ≤ 0 °C räknas som snö, annars regn.";
import type { ColdAmountObservation } from "@/types/observations";
import type { Lake } from "@/types/lake";
import styles from "./LakePanel.module.css";
import { Row, Section, fmtQ, fmtSignedQ, type Loadable } from "./parts";

/*
 * Textprincip: siffror först, minimalt med ord. Station, tid och täckning
 * står på en kort metarad. Förklaringar ligger bakom "?" och är en rad.
 */

/** Datakälla som kan vara under hämtning. */
type L<K extends keyof LakeConditions> = LakeConditions[K] | { status: "loading" };

/* ------------------------------------------------------------------ */
/* KÖLDMÄNGD                                                           */
/* ------------------------------------------------------------------ */

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
  const progress = getColdProgress(lake.areaType, current?.accumulated.value, hca?.amount.value);
  // Progress kräver både referens och aktuellt värde; laddning visas som laddning.
  const progressStatus = progress.kind === "no_current" && cold.status === "loading" ? "loading" : "ok";
  const progressPlaceholder =
    progress.kind === "no_reference" ? "Ingen historisk referens" : progress.kind === "no_current" ? "–" : undefined;
  return (
    <Section title="Köldmängd" status="ok">
      <Row
        label="Historisk referens"
        value={hca ? fmtQ(hca.amount) : undefined}
        placeholder={hca ? undefined : "Saknas"}
        hint="Median köldmängd vid första rapporterade åkning (Skridskonätet). GD = graddagar. Ett historiskt referensvärde – ingen gräns för isbildning."
      />
      {lake.parent && <Row label="Del av" value={lake.parent.name} />}
      <Row
        label={asOf ? `Köldmängd ${formatDate(asOf)}` : "Aktuell köldmängd"}
        status={cold.status}
        placeholder={currentColdPlaceholder(cold, "value")}
        placeholderTitle={reason}
        value={current ? fmtQ(current.accumulated) : undefined}
        hint="Från 1 okt. SMHI-dygnsmedel vid stationen, netto, golv 0."
      />
      <Row
        label="Av historisk referens"
        status={progressStatus}
        placeholder={progressPlaceholder}
        value={progress.kind === "progress" ? formatProgressPercent(progress.percent) : undefined}
        hint="Aktuell köldmängd / historisk referens. Kartans färg. Visar inte isstatus, istjocklek eller säkerhet."
      />
      <Row
        label="Status"
        status={progressStatus}
        placeholder={progressPlaceholder}
        value={
          progress.kind === "progress" ? (
            <span className={styles.coldValue}>
              <span className={styles.classSwatch} style={{ background: progress.cls.color }} aria-hidden />
              {progress.cls.status}
            </span>
          ) : undefined
        }
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

/**
 * Samlingsområde: ingen sjöspecifik GD. Ev. historiskt värde visas separat
 * som områdeshistorik, utan klassfärg.
 */
function CollectionAreaOverview({ lake }: { lake: Lake }) {
  const area = lake.areaHistoricalColdAmount;
  const station = lake.temperatureStation;
  return (
    <>
      <Section title="Köldmängd" status="ok">
        <Row label="Områdestyp" value="Samlingsområde" />
        <Row label="Progress mot referens" status="not_applicable" placeholder="Ej tillämpad" hint={COLLECTION_AREA_NOTE} />
      </Section>
      {area && (
        <Section title="Områdeshistorik" status="ok">
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

/** "1 okt" – datumdel av kort tid. */
const shortDay = (iso: string) => formatShortDateTime(iso).split(" ").slice(0, 2).join(" ");

/** Scenen med vald visningsvariant (t.ex. falsk färg) som aktiv tile-URL. */
const withRendering = (s: SatelliteScene, renderingId: string | undefined) => {
  const r = s.renderings.find((x) => x.id === renderingId);
  return r ? { ...s, tileUrl: r.tileUrl } : s;
};

/** Turbo-färgskalan som titiler använder för SAR (låg → hög respons). */
const SAR_RAMP =
  "linear-gradient(90deg,#30123b 0%,#4686fb 13%,#1be5b5 33%,#a4fc3b 50%,#fbb938 67%,#e4460a 85%,#7a0403 100%)";

function SarLegend() {
  return (
    <div className={styles.sarLegend} aria-label="SAR ytrespons, låg till hög">
      <div className={styles.sarLegendTitle}>SAR ytrespons</div>
      <div className={styles.sarRamp} style={{ background: SAR_RAMP }} />
      <div className={styles.sarEnds}>
        <span>
          Låg respons
          <br />
          Slät yta
        </span>
        <span>
          Hög respons
          <br />
          Grov yta
        </span>
      </div>
    </div>
  );
}

/**
 * Kontroller för aktivt satellitlager: SAR-skala, visning (sann/falsk färg),
 * opacitet och scenbyte. Delas av sjöpanelen och kartans lagerkontroll.
 */
export function SatelliteControls({
  active,
  scenes,
  onShow,
  onOpacity,
}: {
  active: { scene: SatelliteScene; opacity: number };
  scenes: SatelliteScene[];
  onShow: (s: SatelliteScene | null) => void;
  onOpacity: (o: number) => void;
}) {
  const scene = active.scene;
  const idx = scenes.findIndex((s) => s.id === scene.id);
  const isSar = scene.sensor === "SAR";
  // Vald visningsvariant följer med vid scenbyte.
  const renderingId = scene.renderings.find((r) => r.tileUrl === scene.tileUrl)?.id;
  const show = (s: SatelliteScene) => onShow(withRendering(s, renderingId));
  return (
    <div className={styles.satControls}>
      {isSar && <SarLegend />}
      {scene.renderings.length > 1 && (
        <div className={styles.renderToggle} role="group" aria-label="Visning">
          {scene.renderings.map((r) => {
            const on = r.tileUrl === scene.tileUrl;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                className={on ? styles.renderOn : undefined}
                onClick={() => onShow({ ...scene, tileUrl: r.tileUrl })}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      )}
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
      {idx >= 0 && scenes.length > 1 && (
        <div className={styles.sceneNav}>
          <button
            type="button"
            disabled={idx >= scenes.length - 1}
            onClick={() => show(scenes[idx + 1])}
            aria-label="Föregående passage"
          >
            ‹ {idx < scenes.length - 1 ? shortDay(scenes[idx + 1].acquiredAt) : ""}
          </button>
          <span className="num">
            {idx + 1}/{scenes.length}
          </span>
          <button type="button" disabled={idx <= 0} onClick={() => show(scenes[idx - 1])} aria-label="Nästa passage">
            {idx > 0 ? shortDay(scenes[idx - 1].acquiredAt) : ""} ›
          </button>
        </div>
      )}
    </div>
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

function weatherPlaceholder(r: L<"weatherRecent"> | L<"weatherForecast">): string | undefined {
  if (r.status !== "unavailable") return undefined;
  if (r.code === "not_historical") return "Endast nuläge";
  if (r.code === "no_data_yet") return "Ingen station";
  return "N/A";
}

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
  const t = w?.temperature;
  const p = w?.precipitation;
  const wind = w?.wind;
  const notHistorical = recent.status === "unavailable" && recent.code === "not_historical";
  // Historik: samma uppbyggnad och formatering som prognosen (inklusive vind).
  const observed = useMemo(
    () => (w && (t || p || wind) ? observationHours(t?.series, p?.series, periodOf((t ?? p ?? wind)!).to, 24, wind ? { speed: wind.series, direction: wind.directionSeries, gust: wind.gustSeries } : undefined) : null),
    [w, t, p, wind],
  );

  // Samma skalsteg på y-axlarna i båda diagrammen – möjliggör direkt jämförelse.
  const scales = useMemo(
    () => (observed || fc ? sharedScales([...(observed ? [observed] : []), ...(fc ? [fc.hours] : [])]) : undefined),
    [observed, fc],
  );

  return (
    <Section
      title="Väder"
      hint={PRECIP_HINT}
      hintLabel="Om nederbörd i diagrammen"
      status={recent.status === "ok" || forecast.status === "ok" || notHistorical ? "ok" : recent.status}
    >
      <h4 className={styles.subhead}>
        Senaste 24 h
      </h4>
      {observed ? (
        <>
          <Meteogram hours={observed} label="Observationer senaste 24 timmarna" scales={scales} refHours={48} markNow />
        </>
      ) : (
        <Row
          label="Observationer"
          status={recent.status}
          placeholder={weatherPlaceholder(recent) ?? "Ingen station"}
          placeholderTitle={title}
        />
      )}

      <h4 className={`${styles.subhead} ${styles.subheadNext}`}>
        Prognos · 48 h
      </h4>
      {fc ? (
        <>
          <Meteogram hours={fc.hours} label="Prognos 48 timmar" scales={scales} refHours={48} />
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

    </Section>
  );
}
