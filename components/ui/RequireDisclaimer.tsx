"use client";

/**
 * Håller informationssidan innanför friskrivningen: utan kvittering för den aktuella starten (t.ex. en
 * direktlänk till /om) skickas besökaren till kartan, där friskrivningen visas. Med kvittering visas
 * innehållet direkt.
 */
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { disclaimerGate } from "@/lib/session/gate";

export default function RequireDisclaimer({ children }: { children: ReactNode }) {
  const router = useRouter();
  const accepted = useSyncExternalStore(disclaimerGate.subscribe, disclaimerGate.isAccepted, disclaimerGate.isAcceptedOnServer);
  useEffect(() => {
    if (!accepted) router.replace("/");
  }, [accepted, router]);
  return accepted ? children : null;
}
