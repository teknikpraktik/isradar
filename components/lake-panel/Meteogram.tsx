"use client";

/**
 * Meteogram i ren SVG (inget chart-bibliotek). Används för både observationer
 * (senaste 24 h) och prognos (48 h) med exakt samma uppbyggnad:
 *   övre zon   temperatur (°C) med 0 °C-linje, blå under noll
 *   avdelare   tydlig linje + tonad nederbördszon
 *   nedre zon  nederbörd (mm) som staplar, regn eller snö enligt tumregel (≤ 0 °C = snö)
 *   tidsaxel   klockslag, midnatt och dagsetiketter
 * Endast prognosen (variant="forecast") har en vindrad underst.
 * Hover (mus), tap (pekskärm, ligger kvar) och piltangenter visar exakt timme.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ForecastHour } from "@/lib/weather/api";
import { compassSv } from "@/lib/weather/compute";
import {
  dayLabels,
  hourLabel,
  meteogramSummary,
  temperatureDomain,
  temperatureSegments,
  timeTicks,
  windArrowRotation,
} from "@/lib/weather/meteogram";
import { simplePrecipType, type PrecipitationType } from "@/lib/weather/precipitation";
import styles from "./Meteogram.module.css";

// Vertikal layout (px)
const DAY_Y = 10;
const TEMP_TOP = 26;
const TEMP_BOTTOM = 100;
const DIVIDER_Y = 112;
const PRECIP_TOP = 124;
const PRECIP_BOTTOM = 154;
const AXIS_Y = 169;
const WIND_ARROW_Y = 187;
const WIND_TEXT_Y = 205;
const LEFT = 34;
const RIGHT = 6;
/** Minsta bredd innan diagrammet blir horisontellt scrollbart. */
const MIN_WIDTH = 300;

const nf = (v: number, d = 1) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: d }).format(v);
const sign = (v: number, d = 1) => `${v < 0 ? "−" : ""}${nf(Math.abs(v), d)}`;
const niceMax = (m: number) => (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : Math.ceil(m / 5) * 5);

const FILL: Record<PrecipitationType, string> = {
  rain: "#6f9fc4",
  snow: "url(#mg-snow)",
  mixed: "#6f9fc4",
  unknown: "#7d8995",
};
/** Legend- och tooltiptext: typen avgör vad "mm" betyder. */
const TYPE_MM: Record<PrecipitationType, string> = {
  rain: "mm regn",
  snow: "mm snö",
  mixed: "mm nederbörd",
  unknown: "mm nederbörd",
};

/** Typ per timme enligt tumregeln (temperatur samma timme). */
const typeAt = (h: ForecastHour) => simplePrecipType(h.temperature);

export default function Meteogram({
  hours,
  variant,
  label,
}: {
  hours: ForecastHour[];
  variant: "observation" | "forecast";
  /** Beskrivning för skärmläsare, t.ex. "Prognos 48 timmar". */
  label: string;
}) {
  const forecast = variant === "forecast";
  const height = forecast ? 214 : 178;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(MIN_WIDTH, Math.floor(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tap utanför släpper vald timme.
  useEffect(() => {
    if (pinned === null) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPinned(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pinned]);

  const gradId = `meteo-temp-${useId().replace(/:/g, "")}`;
  const n = hours.length;
  const plotW = width - LEFT - RIGHT;
  const colW = plotW / Math.max(1, n);
  const xAt = (i: number) => LEFT + (i + 0.5) * colW;
  const dom = useMemo(() => temperatureDomain(hours.map((h) => h.temperature)), [hours]);
  const yT = (t: number) => TEMP_BOTTOM - ((t - dom.min) / (dom.max - dom.min)) * (TEMP_BOTTOM - TEMP_TOP);
  // Andel av temperaturytan (uppifrån) där 0 °C ligger; under den ritas kurvan blå.
  const freezeAt = Math.min(1, Math.max(0, (yT(0) - TEMP_TOP) / (TEMP_BOTTOM - TEMP_TOP)));
  const hasTemp = hours.some((h) => h.temperature !== null);
  const maxMm = niceMax(Math.max(0, ...hours.map((h) => h.precipitationMm ?? 0)));
  const barH = (mm: number) => (mm / maxMm) * (PRECIP_BOTTOM - PRECIP_TOP);
  const barW = Math.max(2, colW - 1.5);

  const yTicks = useMemo(() => {
    const out: number[] = [];
    for (let t = dom.min; t <= dom.max + 1e-9; t += dom.step) out.push(t);
    return out;
  }, [dom]);
  const ticks = useMemo(() => timeTicks(hours, forecast && width < 400 ? 6 : 3), [hours, forecast, width]);
  const days = useMemo(() => dayLabels(hours), [hours]);
  const segments = useMemo(() => temperatureSegments(hours), [hours]);
  const summary = useMemo(() => meteogramSummary(hours, label), [hours, label]);
  const types = useMemo(
    () => [...new Set(hours.filter((h) => (h.precipitationMm ?? 0) > 0).map(typeAt))],
    [hours],
  );

  const active = pinned ?? hover;
  const indexFromEvent = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * plotW;
    return Math.min(n - 1, Math.max(0, Math.floor(x / colW)));
  };

  if (n === 0) return null;
  const h = active !== null ? hours[active] : null;
  const tipLeft = active !== null ? Math.min(Math.max(xAt(active) - 70, 0), width - 140) : 0;

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      tabIndex={0}
      role="group"
      aria-label={summary}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") setPinned((p) => Math.min(n - 1, (p ?? -1) + 1));
        else if (e.key === "ArrowLeft") setPinned((p) => Math.max(0, (p ?? n) - 1));
        else if (e.key === "Escape") setPinned(null);
        else return;
        e.preventDefault();
      }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={styles.svg} aria-hidden>
        <defs>
          {/* Snö: ljus prick-fyllning – skiljer sig i form, inte bara färg */}
          <pattern id="mg-snow" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" fill="rgb(219 233 240 / 0.35)" />
            <circle cx="2" cy="2" r="0.9" fill="#dbe9f0" />
          </pattern>
          <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={TEMP_TOP} y2={TEMP_BOTTOM}>
            <stop offset={freezeAt} className={styles.stopWarm} />
            <stop offset={freezeAt} className={styles.stopCold} />
          </linearGradient>
        </defs>

        {/* Nederbördszonen tonas så att avdelaren syns även utan data */}
        <rect x={LEFT} y={DIVIDER_Y} width={plotW} height={PRECIP_BOTTOM - DIVIDER_Y + 1} className={styles.band} />

        {/* Midnatt och dagsetiketter */}
        {ticks.filter((t) => t.midnight).map((t) => (
          <line key={`m${t.index}`} x1={xAt(t.index) - colW / 2} x2={xAt(t.index) - colW / 2} y1={TEMP_TOP - 6} y2={PRECIP_BOTTOM} className={styles.midnight} />
        ))}
        {days.map((d) => (
          <text key={`d${d.index}`} x={(d.index === 0 ? LEFT : xAt(d.index) - colW / 2) + 3} y={DAY_Y} className={styles.day}>
            {d.label}
          </text>
        ))}

        {/* Temperaturzon: enhet, axel, streck med etikett, 0 °C-linje */}
        <text x={LEFT - 7} y={TEMP_TOP - 9} className={styles.unit}>
          °C
        </text>
        <line x1={LEFT} x2={LEFT} y1={TEMP_TOP} y2={TEMP_BOTTOM} className={styles.yAxis} />
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={LEFT} x2={width - RIGHT} y1={yT(t)} y2={yT(t)} className={t === 0 ? styles.zero : styles.grid} />
            <line x1={LEFT - 4} x2={LEFT} y1={yT(t)} y2={yT(t)} className={styles.yAxis} />
            <text x={LEFT - 7} y={yT(t) + 3.5} className={t === 0 ? `${styles.tempTick} ${styles.zeroLabel}` : styles.tempTick}>
              {sign(t, 0)}
            </text>
          </g>
        ))}
        {hasTemp ? (
          segments.map((seg, k) =>
            seg.length === 1 ? (
              <circle
                key={k}
                cx={xAt(seg[0].index)}
                cy={yT(seg[0].t)}
                r={1.8}
                className={seg[0].t < 0 ? `${styles.tempDot} ${styles.tempDotCold}` : styles.tempDot}
              />
            ) : (
              <polyline
                key={k}
                points={seg.map((p) => `${xAt(p.index)},${yT(p.t)}`).join(" ")}
                className={styles.temp}
                style={{ stroke: `url(#${gradId})` }}
              />
            ),
          )
        ) : (
          <text x={LEFT + plotW / 2} y={(TEMP_TOP + TEMP_BOTTOM) / 2} className={styles.empty}>
            Temperatur saknas
          </text>
        )}

        {/* Avdelare mellan temperatur och nederbörd */}
        <line x1={0} x2={width} y1={DIVIDER_Y} y2={DIVIDER_Y} className={styles.divider} />

        {/* Nederbördszon: enhet, axel (0 och max), staplar */}
        <text x={LEFT - 7} y={PRECIP_TOP - 8} className={styles.unit}>
          mm
        </text>
        <line x1={LEFT} x2={LEFT} y1={PRECIP_TOP} y2={PRECIP_BOTTOM} className={styles.yAxis} />
        <line x1={LEFT} x2={width - RIGHT} y1={PRECIP_TOP} y2={PRECIP_TOP} className={styles.grid} />
        <line x1={LEFT} x2={width - RIGHT} y1={PRECIP_BOTTOM} y2={PRECIP_BOTTOM} className={styles.baseline} />
        <text x={LEFT - 7} y={PRECIP_TOP + 3.5} className={styles.tempTick}>
          {nf(maxMm)}
        </text>
        <text x={LEFT - 7} y={PRECIP_BOTTOM + 3.5} className={styles.tempTick}>
          0
        </text>
        {hours.map((hr, i) =>
          (hr.precipitationMm ?? 0) > 0 ? (
            <rect
              key={`p${i}`}
              x={xAt(i) - barW / 2}
              y={PRECIP_BOTTOM - Math.max(1.5, barH(hr.precipitationMm!))}
              width={barW}
              height={Math.max(1.5, barH(hr.precipitationMm!))}
              fill={FILL[typeAt(hr)]}
            />
          ) : null,
        )}

        {/* Tidsaxel (lokala klockslag) */}
        {ticks.map((t) => (
          <text key={`t${t.index}`} x={xAt(t.index)} y={AXIS_Y} className={styles.time}>
            {t.label}
          </text>
        ))}

        {/* Vind (endast prognos): var 3:e timme, pil mot den riktning vinden blåser */}
        {forecast &&
          hours.map((hr, i) =>
            i % 3 === 1 && hr.windSpeed !== null ? (
              <g key={`w${i}`}>
                {hr.windFromDirection !== null && (
                  <g transform={`translate(${xAt(i)} ${WIND_ARROW_Y}) rotate(${windArrowRotation(hr.windFromDirection)})`}>
                    <path d="M0,-6 L3.5,2 L0,0.5 L-3.5,2 Z" className={styles.arrow} />
                  </g>
                )}
                <text x={xAt(i)} y={WIND_TEXT_Y} className={styles.wind}>
                  {Math.round(hr.windSpeed)}
                </text>
              </g>
            ) : null,
          )}
        {forecast && (
          <text x={LEFT - 7} y={WIND_TEXT_Y} className={styles.unit}>
            m/s
          </text>
        )}

        {/* Markör för vald timme */}
        {active !== null && (
          <line x1={xAt(active)} x2={xAt(active)} y1={TEMP_TOP - 4} y2={PRECIP_BOTTOM} className={styles.cursor} />
        )}
        {h?.temperature !== null && h && active !== null && (
          <circle cx={xAt(active)} cy={yT(h.temperature!)} r={3} className={styles.cursorDot} />
        )}

        {/* Interaktionsyta */}
        <rect
          x={LEFT}
          y={0}
          width={plotW}
          height={height}
          fill="transparent"
          onPointerMove={(e) => e.pointerType === "mouse" && setHover(indexFromEvent(e))}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => {
            const i = indexFromEvent(e);
            setPinned((p) => (p === i && e.pointerType === "mouse" ? null : i));
          }}
        />
      </svg>

      {h && (
        <div className={styles.tip} style={{ left: tipLeft }} role="status">
          <div className={styles.tipTime}>{hourLabel(h.time)}</div>
          <div className={styles.tipTemp}>{h.temperature === null ? "–" : `${sign(h.temperature)} °C`}</div>
          <div>
            {h.precipitationMm === null
              ? "Nederbörd saknas"
              : h.precipitationMm > 0
                ? `${nf(h.precipitationMm)} ${TYPE_MM[typeAt(h)]}`
                : "Ingen nederbörd"}
          </div>
          {forecast && h.windSpeed !== null && (
            <div>
              Vind {nf(h.windSpeed)} m/s{h.windFromDirection !== null ? ` ${compassSv(h.windFromDirection)}` : ""}
            </div>
          )}
          {forecast && h.gust !== null && <div>Byvind {nf(h.gust)} m/s</div>}
        </div>
      )}

      <div className={styles.legend} aria-hidden>
        {types.length > 0 ? (
          types.map((t) => (
            <span key={t}>
              <svg width="10" height="10">
                <rect width="10" height="10" fill={FILL[t]} />
              </svg>
              {TYPE_MM[t]}
            </span>
          ))
        ) : (
          <span>Ingen nederbörd</span>
        )}
        {forecast && <span className={styles.legendNote}>vind m/s · pil = åt vilket håll</span>}
      </div>
    </div>
  );
}
