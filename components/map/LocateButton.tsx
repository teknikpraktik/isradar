"use client";

import { useState } from "react";
import type { LngLat } from "@/types/lake";
import styles from "@/components/IsvakApp.module.css";

interface Props {
  onPosition: (p: LngLat) => void;
  onMessage: (msg: string) => void;
}

/**
 * Hämtar enhetens position via Geolocation API. Positionen används bara
 * lokalt i klienten (för att centrera kartan) och skickas aldrig vidare.
 */
export default function LocateButton({ onPosition, onMessage }: Props) {
  const [busy, setBusy] = useState(false);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      onMessage("Positionering stöds inte av webbläsaren.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onPosition([pos.coords.longitude, pos.coords.latitude]);
      },
      (err) => {
        setBusy(false);
        onMessage(
          err.code === err.PERMISSION_DENIED
            ? "Platsåtkomst nekad. Kartan fungerar ändå."
            : "Kunde inte bestämma position.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <button
      type="button"
      className={styles.iconBtn}
      onClick={locate}
      disabled={busy}
      aria-label="Min position"
      title="Min position"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      </svg>
    </button>
  );
}
