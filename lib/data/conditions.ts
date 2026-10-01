/**
 * Samlar alla dynamiska datakällor för en sjö. Varje källa returnerar sin egen
 * DataResult så att en källa som saknas aldrig döljer en annan.
 */
import { getCurrentColdAmount } from "@/lib/data/cold";
import { getMepsRun } from "@/lib/data/meps";
import { getLatestSatelliteObservation } from "@/lib/data/satellite";
import { getRecentWeather, getWeatherForecast } from "@/lib/data/weather";
import type { Lake } from "@/types/lake";
import type {
  ColdAmountObservation,
  MepsRun,
  SatelliteObservation,
  WeatherForecast,
  WeatherObservation,
} from "@/types/observations";
import type { DataResult } from "@/types/provenance";

export interface LakeConditions {
  currentCold: DataResult<ColdAmountObservation>;
  meps: DataResult<MepsRun>;
  satellite: DataResult<SatelliteObservation>;
  weatherRecent: DataResult<WeatherObservation>;
  weatherForecast: DataResult<WeatherForecast[]>;
}

/** asOf (YYYY-MM-DD) visar läget ett tidigare datum; utelämnas för nuläget. */
export async function getLakeConditions(lake: Lake, asOf?: string): Promise<LakeConditions> {
  const [currentCold, meps, satellite, weatherRecent, weatherForecast] =
    await Promise.all([
      getCurrentColdAmount(lake, asOf),
      getMepsRun(lake, asOf),
      getLatestSatelliteObservation(lake),
      getRecentWeather(lake, asOf),
      getWeatherForecast(lake, asOf),
    ]);
  return { currentCold, meps, satellite, weatherRecent, weatherForecast };
}
