/**
 * Friskrivningens kvittens för den aktuella appstarten. Hålls i modulminnet (inte sessionStorage):
 * klientnavigering mellan kartan och Om Isvak behåller den, medan en omladdning eller en ny start
 * (t.ex. PWA från hemskärmen) nollställer den och visar friskrivningen igen.
 */
let accepted = false;
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
    listeners.forEach((l) => l());
  },
};
