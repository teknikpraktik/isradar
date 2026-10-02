/**
 * Sentinel-1-indikatorn i sjömodellen. Själva beräkningen (lib/sentinel/score.ts) och
 * hämtningen (lib/data/sentinel.ts) delas med modellen för stora sjöar; här översätts
 * resultatet till sjömodellens normaliserade form (0–1 av faktorns maxpoäng).
 *
 * Saknas Sentinel-data för en sjö (för liten, utanför passens täckning, för få giltiga
 * pixlar eller för gammalt pass) returneras null = data saknas – aldrig ett negativt värde.
 * Radarrespons är tvetydig och heuristiken är okalibrerad: faktorn är en indikator bland flera.
 */
import { calculateSentinelScore, type SentinelCellInput } from "../sentinel/score.ts";
import type { SentinelIndication } from "./types.ts";

export function toLakeSentinelIndication(input: SentinelCellInput | null, now: Date = new Date()): SentinelIndication | null {
  const s = calculateSentinelScore(input, now);
  return s ? { favourability: s.score / 100 } : null;
}
