import { Suspense } from "react";
import IsradarApp from "@/components/IsradarApp";

export default function Home() {
  // Suspense krävs för useSearchParams (?asOf=) i en statiskt renderad sida.
  return (
    <Suspense>
      <IsradarApp />
    </Suspense>
  );
}
