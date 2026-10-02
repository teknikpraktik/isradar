/**
 * Väljer beräkningsmodell för Modellerad åkbarhet: sjömodellen där MEPS-data finns,
 * Vänernmodellen där MEPS-istjocklek saknas (Vänern). Båda ger score 0–100 och
 * kategori-id ur samma skala (lib/rideability/config.ts).
 */
import { calculateVanernRideability, type VanernCellInputs, type VanernCellResult } from "../vanern/score.ts";
import { calculateRideabilityScore } from "./score.ts";
import type { RideabilityInputs, RideabilityResult } from "./types.ts";

export const calculateLakeRideability = calculateRideabilityScore;
export { calculateVanernRideability };

export type RideabilityRequest =
  | { model: "lake"; inputs: RideabilityInputs }
  | { model: "vanern"; inputs: VanernCellInputs; now?: Date };

export function calculateRideability(req: { model: "lake"; inputs: RideabilityInputs }): RideabilityResult;
export function calculateRideability(req: { model: "vanern"; inputs: VanernCellInputs; now?: Date }): VanernCellResult;
export function calculateRideability(req: RideabilityRequest): RideabilityResult | VanernCellResult {
  return req.model === "vanern" ? calculateVanernRideability(req.inputs, req.now) : calculateLakeRideability(req.inputs);
}
