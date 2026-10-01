"use client";

import { HISTORICAL_COLD_METHOD } from "@/lib/data/cold";
import { MEPS_LEAD_TIMES_H } from "@/lib/data/meps";
import { describeTime, distanceKm, formatDateTime } from "@/lib/format";
import { SOURCES } from "@/lib/sources";
import type { LakeConditions } from "@/lib/data/conditions";
import type { Lake } from "@/types/lake";
import { Row, Section, fmtPct, fmtQ } from "./parts";

/* ------------------------------------------------------------------ */
/* ÖVERSIKT                                                            */
/* ------------------------------------------------------------------ */

export function OverviewSection({ lake, cold }: { lake: Lake; cold: LakeConditions["currentCold"] }) {
  const hca = lake.historicalColdAmount;
  const station = lake.temperatureStation;
  const current = cold.status === "ok" ? cold.value : null;
  return (
    <Section title="Översikt" kinds={["historical_reference", "observation"]} status="ok">
      <Row
        label="Historisk köldmängd"
        value={fmtQ(hca?.amount)}
        hint={
          <>
            {HISTORICAL_COLD_METHOD}. Beräknat ur tidigare säsonger av Skridskonätet. Ett historiskt
            referensvärde – ingen säkerhetsgräns och ingen beskrivning av isen nu.
            <br />
            <abbr title="graddagar">GD</abbr> = graddagar, ett mått på ackumulerad kyla (dygnsmedeltemperaturer
            under 0 °C summerade över tid).
          </>
        }
      />
      <Row
        label="Temperaturstation"
        value={station?.name}
        meta={
          station
            ? `${Math.round(distanceKm(lake.centroid, station.position))} km från vattnet`
            : undefined
        }
        hint="Station vars temperaturserie Skridskonätets modell använder för detta vatten."
      />
      <Row
        label="Aktuell köldmängd"
        status={cold.status}
        value={fmtQ(current?.accumulated)}
        meta={current ? describeTime(current.provenance.time) : undefined}
      />
      <Row label="Förändring 24 h" status={cold.status} value={fmtQ(current?.change24h)} />
      <Row label="Förändring 7 dygn" status={cold.status} value={fmtQ(current?.change7d)} />
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* MODELL – MEPS                                                       */
/* ------------------------------------------------------------------ */

export function ModelSection({ meps }: { meps: LakeConditions["meps"] }) {
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

export function SatelliteSection({ sat }: { sat: LakeConditions["satellite"] }) {
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

export function WeatherSection({
  recent,
  forecast,
}: {
  recent: LakeConditions["weatherRecent"];
  forecast: LakeConditions["weatherForecast"];
}) {
  const w = recent.status === "ok" ? recent.value : null;
  const v = w?.values;
  const temp =
    v?.temperatureMin && v?.temperatureMax ? (
      <>
        {fmtQ(v.temperatureMin)} … {fmtQ(v.temperatureMax)}
      </>
    ) : (
      fmtQ(v?.temperature)
    );
  const fc = forecast.status === "ok" ? forecast.value : null;
  return (
    <Section title="Väder" kinds={["observation", "forecast"]} status={recent.status}>
      <Row
        label="Temperatur senaste 24 h"
        status={recent.status}
        value={temp}
        meta={w ? describeTime(w.provenance.time) : undefined}
      />
      <Row label="Nederbörd senaste 24 h" status={recent.status} value={fmtQ(v?.precipitation)} />
      <Row label="Vind" status={recent.status} value={fmtQ(v?.windSpeed)} />
      <Row
        label="Prognos"
        status={forecast.status}
        value={
          fc && fc.length > 0 ? (
            <>
              {fmtQ(fc[0].values.temperature)} · {fmtQ(fc[0].values.precipitation)}
            </>
          ) : undefined
        }
        meta={fc?.[0] ? describeTime(fc[0].provenance.time) : undefined}
      />
    </Section>
  );
}
