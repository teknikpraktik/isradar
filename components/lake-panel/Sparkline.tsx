"use client";

/**
 * Kompakt 24 h-mikrodiagram för observationer (SENASTE 24 H) – medvetet
 * lättare än 48 h-meteogrammet. Delar tidshjälpare (splitAtGaps, hourLabel)
 * med meteogrammet. Temperatur som linje, nederbörd som staplar.
 * Saknade timmar bryter linjen; inget interpoleras.
 */
import { useEffect, useId, useRef, useState } from "react";
import { hourLabel, splitAtGaps } from "@/lib/weather/meteogram";
import styles from "./Sparkline.module.css";

const HOUR = 3_600_000;

interface Point {
  t: number;
  v: number;
}

const nf = (v: number, d = 1) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: d }).format(v);
const clock = (t: number) =>
  new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(new Date(t));
const sign = (v: number) => `${v < 0 ? "−" : ""}${nf(Math.abs(v))}`;

export default function Sparkline({
  kind,
  series,
  from,
  to,
}: {
  kind: "temperature" | "precipitation";
  series: { time: string; value: number }[];
  /** Periodens gränser – samma för alla parametrar (nu − 24 h → nu). */
  from: string;
  to: string;
}) {
  const gradId = `spark-temp-${useId().replace(/:/g, "")}`;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(200, Math.floor(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points: Point[] = series.map((p) => ({ t: Date.parse(p.time), v: p.value }));
  const t0 = Date.parse(from);
  const t1 = Date.parse(to);
  const H = kind === "temperature" ? 56 : 40;
  const PAD_TOP = 6;
  const AXIS = 12;
  const plotH = H - PAD_TOP - AXIS;
  // Temperatur får en smal axelmarginal med skalstreck; nederbörd ingen.
  const LEFT = kind === "temperature" ? 26 : 0;
  const plotW = width - LEFT;
  const xAt = (t: number) => LEFT + ((t - t0) / (t1 - t0)) * plotW;

  let yAt: (v: number) => number;
  let zeroY: number | null = null;
  const yTicks: number[] = [];
  if (kind === "temperature") {
    const vs = points.map((p) => p.v);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    // Minst 4 °C spann så att små variationer inte ser dramatiska ut.
    const mid = (lo + hi) / 2;
    const half = Math.max(2, (hi - lo) / 2) * 1.1;
    const min = mid - half;
    const max = mid + half;
    yAt = (v) => PAD_TOP + (1 - (v - min) / (max - min)) * plotH;
    // 2–3 avrundade skalstreck – fler får inte plats på ~40 px.
    const step = [1, 2, 5, 10, 20].find((st) => Math.floor(max / st) - Math.ceil(min / st) + 1 <= 3) ?? 20;
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) yTicks.push(v);
    // 0 °C bara när kurvan passerar eller ligger nära fryspunkten.
    if (min < 0 && max > 0) zeroY = yAt(0);
  } else {
    const max = Math.max(1, ...points.map((p) => p.v));
    yAt = (v) => PAD_TOP + plotH - (v / max) * plotH;
  }

  // Andel av plotytan (uppifrån) där 0 °C ligger; under den ritas linjen blå.
  const freezeAt = kind === "temperature" ? Math.min(1, Math.max(0, (yAt(0) - PAD_TOP) / plotH)) : 1;
  const barW = Math.max(2, (width / 24) * 0.7);
  const segments = kind === "temperature" ? splitAtGaps(points) : [];
  const ticks = [
    { t: t0, label: clock(t0), anchor: "start" },
    { t: t0 + 12 * HOUR, label: clock(t0 + 12 * HOUR), anchor: "middle" },
    { t: t1, label: `nu ${clock(t1)}`, anchor: "end" },
  ] as const;

  const pick = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const t = t0 + ((clientX - r.left) / r.width) * (t1 - t0);
    let best: number | null = null;
    points.forEach((p, i) => {
      if (best === null || Math.abs(p.t - t) < Math.abs(points[best].t - t)) best = i;
    });
    return best;
  };
  const a = active !== null ? points[active] : null;

  return (
    <div
      ref={ref}
      className={styles.wrap}
      onPointerMove={(e) => e.pointerType === "mouse" && setActive(pick(e.clientX))}
      onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
      onPointerDown={(e) => setActive(pick(e.clientX))}
      aria-hidden
    >
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className={styles.svg}>
        {kind === "temperature" && (
          <>
            <line x1={LEFT} x2={LEFT} y1={PAD_TOP} y2={PAD_TOP + plotH} className={styles.yAxis} />
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={LEFT - 4} x2={LEFT} y1={yAt(v)} y2={yAt(v)} className={styles.yAxis} />
                <text x={LEFT - 6} y={yAt(v) + 3} className={styles.yLabel}>
                  {v < 0 ? "−" : ""}
                  {Math.abs(v)}°
                </text>
              </g>
            ))}
          </>
        )}
        {zeroY !== null && <line x1={LEFT} x2={width} y1={zeroY} y2={zeroY} className={styles.zero} />}
        {kind === "precipitation" && (
          <line x1={0} x2={width} y1={PAD_TOP + plotH} y2={PAD_TOP + plotH} className={styles.base} />
        )}
        {kind === "temperature" && (
          <defs>
            <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={PAD_TOP} y2={PAD_TOP + plotH}>
              <stop offset={freezeAt} className={styles.stopWarm} />
              <stop offset={freezeAt} className={styles.stopCold} />
            </linearGradient>
          </defs>
        )}
        {segments.map((seg, k) =>
          seg.length === 1 ? (
            <circle
              key={k}
              cx={xAt(seg[0].t)}
              cy={yAt(seg[0].v)}
              r={1.6}
              className={seg[0].v < 0 ? `${styles.dot} ${styles.dotCold}` : styles.dot}
            />
          ) : (
            <polyline
              key={k}
              points={seg.map((p) => `${xAt(p.t)},${yAt(p.v)}`).join(" ")}
              className={styles.line}
              style={{ stroke: `url(#${gradId})` }}
            />
          ),
        )}
        {kind === "precipitation" &&
          points.map((p, i) =>
            p.v > 0 ? (
              <rect
                key={i}
                // Nederbördsvärdet avser timmen före tidsstämpeln.
                x={xAt(p.t - HOUR / 2) - barW / 2}
                y={yAt(p.v)}
                width={barW}
                height={Math.max(1.5, PAD_TOP + plotH - yAt(p.v))}
                className={styles.bar}
              />
            ) : null,
          )}
        {a && (
          <>
            <line x1={xAt(a.t)} x2={xAt(a.t)} y1={PAD_TOP - 2} y2={PAD_TOP + plotH} className={styles.cursor} />
            {kind === "temperature" && <circle cx={xAt(a.t)} cy={yAt(a.v)} r={2.6} className={styles.cursorDot} />}
          </>
        )}
        {ticks.map((t) => (
          <text key={t.label} x={xAt(t.t)} y={H - 2} textAnchor={t.anchor} className={styles.tick}>
            {t.label}
          </text>
        ))}
      </svg>
      {a && (
        <div className={styles.tip} style={{ left: Math.min(Math.max(xAt(a.t) - 45, 0), width - 90) }}>
          <span>{hourLabel(new Date(a.t).toISOString()).split(" ")[1]}</span>{" "}
          <strong>{kind === "temperature" ? `${sign(a.v)} °C` : `${nf(a.v)} mm`}</strong>
        </div>
      )}
    </div>
  );
}
