import { Suspense } from "react";
import IsvakApp from "@/components/IsvakApp";

export default function Home() {
  // Suspense krävs för useSearchParams (?asOf=) i en statiskt renderad sida.
  return (
    <Suspense>
      <IsvakApp />
    </Suspense>
  );
}
