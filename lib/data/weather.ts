/**
 * Väder: uppmätt (OBSERVATION, t.ex. senaste 24 h) och prognos (FORECAST).
 * Ej ansluten i V1.
 */
import { SOURCES } from "@/lib/sources";
import type { Lake } from "@/types/lake";
import type { WeatherForecast, WeatherObservation } from "@/types/observations";
import type { DataResult } from "@/types/provenance";

export async function getRecentWeather(
  _lake: Lake,
): Promise<DataResult<WeatherObservation>> {
  return { status: "not_connected", source: SOURCES.weather };
}

export async function getWeatherForecast(
  _lake: Lake,
): Promise<DataResult<WeatherForecast[]>> {
  return { status: "not_connected", source: SOURCES.weather };
}
