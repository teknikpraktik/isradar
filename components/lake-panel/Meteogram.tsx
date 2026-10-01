"use client";

/**
 * 48 h-meteogram i ren SVG (inget chart-bibliotek):
 *   temperaturkurva (huvudinformation) med 0 °C-linje,
 *   nederbördsstaplar (mm vattenekvivalent) längs samma tidsaxel,
 *   vindrad var 3:e timme – pilen visar VART vinden blåser.
 * Hover (mus), tap (pekskärm, ligger kvar) och piltangenter visar exakt timme.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
import { PRECIP_TYPE_LABEL, type PrecipitationType } from "@/lib/weather/precipitation";
import styles from "./Meteogram.module.css";

// Vertikal layout (px)
const DAY_Y = 10;
const TEMP_TOP = 18;
const TEMP_BOTTOM = 114;
const PRECIP_TOP = 130;
const PRECIP_BOTTOM = 160;
const AXIS_Y = 172;
const WIND_ARROW_Y = 190;
const WIND_TEXT_Y = 210;
const HEIGHT = 218;
const LEFT = 28;
const RIGHT = 6;
/** Minsta bredd innan diagrammet blir horisontellt scrollbart. */
const MIN_WIDTH = 320;

const nf = (v: number, d = 1) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: d }).format(v);
const sign = (v: number, d = 1) => `${v < 0 ? "−" : ""}${nf(Math.abs(v), d)}`;

const FILL: Record<PrecipitationType, string> = {
  rain: "url(#mg-rain)",
  snow: "url(#mg-snow)",
  mixed: "url(#mg-mixed)",
  unknown: "url(#mg-unknown)",
};

export default function Meteogram({ hours }: { hours: ForecastHour[] }) {
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

  const n = hours.length;
  const plotW = width - LEFT - RIGHT;
  const xAt = (i: number) => LEFT + ((i + 0.5) / n) * plotW;
  const dom = useMemo(() => temperatureDomain(hours.map((h) => h.temperature)), [hours]);
  const yT = (t: number) => TEMP_BOTTOM - ((t - dom.min) / (dom.max - dom.min)) * (TEMP_BOTTOM - TEMP_TOP);
  const maxMm = Math.max(1, ...hours.map((h) => h.precipitationMm ?? 0));
  const barH = (mm: number) => (mm / maxMm) * (PRECIP_BOTTOM - PRECIP_TOP);
  const barW = Math.max(2, plotW / n - 1.5);

  const yTicks = useMemo(() => {
    const out: number[] = [];
    for (let t = dom.min; t <= dom.max + 1e-9; t += dom.step) out.push(t);
    return out;
  }, [dom]);
  const ticks = useMemo(() => timeTicks(hours, width < 400 ? 6 : 3), [hours, width]);
  const days = useMemo(() => dayLabels(hours), [hours]);
  const segments = useMemo(() => temperatureSegments(hours), [hours]);
  const summary = useMemo(() => meteogramSummary(hours), [hours]);
  const types = useMemo(
    () => [...new Set(hours.filter((h) => (h.precipitationMm ?? 0) > 0).map((h) => h.precipitationType ?? "unknown"))],
    [hours],
  );

  const active = pinned ?? hover;
  const indexFromEvent = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * plotW;
    return Math.min(n - 1, Math.max(0, Math.floor((x / plotW) * n)));
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
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className={styles.svg} aria-hidden>
        <defs>
          <pattern id="mg-rain" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" fill="#6f9fc4" />
          </pattern>
          {/* Snö: ljus kontur + svag fyllning – skiljer sig i form, inte bara färg */}
          <pattern id="mg-snow" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" fill="rgb(219 233 240 / 0.35)" />
            <circle cx="2" cy="2" r="0.9" fill="#dbe9f0" />
          </pattern>
          <pattern id="mg-mixed" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="rgb(111 159 196 / 0.35)" />
            <rect width="2" height="5" fill="#dbe9f0" />
          </pattern>
          <pattern id="mg-unknown" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" fill="#7d8995" />
          </pattern>
        </defs>

        {/* Midnatt och dagsetiketter */}
        {ticks.filter((t) => t.midnight).map((t) => (
          <line key={`m${t.index}`} x1={xAt(t.index) - plotW / n / 2} x2={xAt(t.index) - plotW / n / 2} y1={TEMP_TOP - 6} y2={PRECIP_BOTTOM} className={styles.midnight} />
        ))}
        {days.map((d) => (
          <text key={`d${d.index}`} x={(d.index === 0 ? LEFT : xAt(d.index) - plotW / n / 2) + 3} y={DAY_Y} className={styles.day}>
            {d.label}
          </text>
        ))}

        {/* Temperatur-grid och axel */}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={LEFT} x2={width - RIGHT} y1={yT(t)} y2={yT(t)} className={t === 0 ? styles.zero : styles.grid} />
            <text x={LEFT - 4} y={yT(t) + 3} className={t === 0 ? `${styles.axis} ${styles.zeroLabel}` : styles.axis}>
              {sign(t, 0)}°
            </text>
          </g>
        ))}

        {/* Temperaturkurva – segment bryts vid saknade timmar */}
        {segments.map((seg, k) =>
          seg.length === 1 ? (
            <circle key={k} cx={xAt(seg[0].index)} cy={yT(seg[0].t)} r={1.8} className={styles.tempDot} />
          ) : (
            <polyline key={k} points={seg.map((p) => `${xAt(p.index)},${yT(p.t)}`).join(" ")} className={styles.temp} />
          ),
        )}

        {/* Nederbörd */}
        <line x1={LEFT} x2={width - RIGHT} y1={PRECIP_BOTTOM} y2={PRECIP_BOTTOM} className={styles.grid} />
        {hours.map((hr, i) =>
          (hr.precipitationMm ?? 0) > 0 ? (
            <rect
              key={`p${i}`}
              x={xAt(i) - barW / 2}
              y={PRECIP_BOTTOM - Math.max(1.5, barH(hr.precipitationMm!))}
              width={barW}
              height={Math.max(1.5, barH(hr.precipitationMm!))}
              fill={FILL[hr.precipitationType ?? "unknown"]}
            />
          ) : null,
        )}
        <text x={LEFT - 4} y={PRECIP_TOP + 7} className={styles.axis}>
          {nf(maxMm)}
        </text>
        <text x={LEFT - 4} y={PRECIP_BOTTOM} className={styles.axis}>
          mm
        </text>

        {/* Tidsaxel */}
        {ticks.map((t) => (
          <text key={`t${t.index}`} x={xAt(t.index)} y={AXIS_Y} className={styles.time}>
            {t.label}
          </text>
        ))}

        {/* Vind var 3:e timme – pil mot den riktning vinden blåser */}
        {hours.map((hr, i) =>
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
        <text x={LEFT - 4} y={WIND_TEXT_Y} className={styles.axis}>
          m/s
        </text>

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
          height={HEIGHT}
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
                ? `${PRECIP_TYPE_LABEL[h.precipitationType ?? "unknown"]} ${nf(h.precipitationMm)} mm`
                : "Ingen nederbörd"}
          </div>
          {h.windSpeed !== null && (
            <div>
              Vind {nf(h.windSpeed)} m/s{h.windFromDirection !== null ? ` ${compassSv(h.windFromDirection)}` : ""}
            </div>
          )}
          {h.gust !== null && <div>Byvind {nf(h.gust)} m/s</div>}
        </div>
      )}

      {types.length > 0 && (
        <div className={styles.legend} aria-hidden>
          {types.map((t) => (
            <span key={t}>
              <svg width="10" height="10">
                <rect width="10" height="10" fill={FILL[t]} />
              </svg>
              {PRECIP_TYPE_LABEL[t]}
            </span>
          ))}
          <span className={styles.legendNote}>mm vattenekvivalent</span>
        </div>
      )}
    </div>
  );
}
