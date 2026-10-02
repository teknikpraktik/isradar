/**
 * Samlar alla dynamiska datakällor för en sjö. Varje källa returnerar sin egen
 * DataResult så att en källa som saknas aldrig döljer en annan.
 */
import { getCurrentColdAmount } from "@/lib/data/cold";
import { getMepsRun } from "@/lib/data/meps";
import { getRecentWeather, getWeatherForecast } from "@/lib/data/weather";
import type { Lake } from "@/types/lake";
import type {
  ColdAmountObservation,
  MepsRun,
  WeatherForecast,
  WeatherObservation,
} from "@/types/observations";
import type { DataResult } from "@/types/provenance";

export interface LakeConditions {
  currentCold: DataResult<ColdAmountObservation>;
  meps: DataResult<MepsRun>;
  weatherRecent: DataResult<WeatherObservation>;
  weatherForecast: DataResult<WeatherForecast>;
}

/** asOf (YYYY-MM-DD) visar läget ett tidigare datum; utelämnas för nuläget. */
export async function getLakeConditions(lake: Lake, asOf?: string): Promise<LakeConditions> {
  const [currentCold, meps, weatherRecent, weatherForecast] =
    await Promise.all([
      getCurrentColdAmount(lake, asOf),
      getMepsRun(lake, asOf),
      getRecentWeather(lake, asOf),
      getWeatherForecast(lake, asOf),
    ]);
  return { currentCold, meps, weatherRecent, weatherForecast };
}

/**
 * Som getLakeConditions men levererar varje källa så fort den är klar, så att
 * en långsam källa (t.ex. MEPS) inte håller tillbaka de andra.
 */
export function loadLakeConditions(
  lake: Lake,
  asOf: string | undefined,
  onPart: <K extends keyof LakeConditions>(key: K, value: LakeConditions[K]) => void,
): void {
  getCurrentColdAmount(lake, asOf).then((v) => onPart("currentCold", v));
  getMepsRun(lake, asOf).then((v) => onPart("meps", v));
  getRecentWeather(lake, asOf).then((v) => onPart("weatherRecent", v));
  getWeatherForecast(lake, asOf).then((v) => onPart("weatherForecast", v));
}
