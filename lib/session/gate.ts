/**
 * Friskrivningens kvittens för den aktuella appstarten. Hålls i modulminnet: klientnavigering mellan kartan och
 * Om Isvak behåller den, medan en omladdning eller en ny start (t.ex. PWA från hemskärmen) nollställer den.
 *
 * Reserv för när webbläsaren gör en full sidladdning i stället för klientnavigering (t.ex. inaktuell
 * cache eller misslyckad RSC-hämtning): kvittensen sparas då i sessionStorage och återställs bara om
 * laddningen kommer från en länk inne i appen (samma ursprung som referent) och inte är en omladdning.
 * En ny start, direktlänk eller omladdning har tom referent eller typen "reload" och visar friskrivningen.
 */
const KEY = "isvak.disclaimer";

function restore(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const fromApp = document.referrer.startsWith(window.location.origin);
    if (nav?.type === "reload" || !fromApp) {
      sessionStorage.removeItem(KEY);
      return false;
    }
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let accepted = restore();
const listeners = new Set<() => void>();

export const disclaimerGate = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  isAccepted: () => accepted,
  /** Servern vet aldrig om något är kvitterat – första renderingen visar alltid gaten. */
  isAcceptedOnServer: () => false,
  accept() {
    if (accepted) return;
    accepted = true;
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* modulminnet räcker för klientnavigering */
    }
    listeners.forEach((l) => l());
  },
};
