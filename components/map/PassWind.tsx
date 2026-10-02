"use client";

/**
 * Observerad vind och byvind vid Sentinel-1-passagen (SMHI/VViS, ±1 h), intill
 * uppgiften om när passagen skedde. Hämtas för kartvyns position.
 */
import { useEffect, useState } from "react";
import { getPassWind } from "@/lib/data/satellite";
import type { PassWindResponse } from "@/lib/satellite/api";
import { compassSv } from "@/lib/weather/compute";
import { formatWind } from "@/lib/weather/format";

export default function PassWind({ position, time }: { position: [number, number]; time: string }) {
  const key = `${position.join(",")}|${time}`;
  const [state, setState] = useState<{ key: string; res: PassWindResponse | "error" } | null>(null);
  useEffect(() => {
    let live = true;
    getPassWind(position, time).then(
      (res) => live && setState({ key, res }),
      () => live && setState({ key, res: "error" }),
    );
    return () => {
      live = false;
    };
  }, [position, time, key]);
  const res = state?.key === key ? state.res : undefined;
  if (res === undefined) return <span>Vind …</span>;
  const w = res === "error" ? null : res.wind;
  if (!w) return <span>Vind vid passage: ingen observation</span>;
  return (
    <>
      <span>
        Vind <span className="num">{formatWind(w.speed, w.fromDirection !== null ? compassSv(w.fromDirection) : null)}</span>
      </span>
      {w.gust !== null && (
        <span>
          Byvind <span className="num">{formatWind(w.gust)}</span>
        </span>
      )}
    </>
  );
}
