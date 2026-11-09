/**
 * Suit consumables (docs/specs/02 §D.14, §D.6; FR-35). O₂ fraction falls at
 * rate = P_met / P_ref / o2_nominal_h, with P_met for walking or resting (05 ParamSet kind `suit`).
 * TASK-05b (T05b.17). Pure; every coefficient from the suit ParamSet.
 */
import type { ParamSet } from "@marswalk/protocol";

function num(p: ParamSet, key: string): number {
  const value = (p.values as Record<string, unknown>)[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`consumables: ParamSet ${p.param_set_id} has no positive number ${key}`);
  return value;
}

/** O₂ fraction used per second at the given activity. */
function ratePerS(activity: "walking" | "resting", suit: ParamSet): number {
  const p_met = num(suit, activity === "walking" ? "p_walk_w" : "p_rest_w");
  return p_met / num(suit, "p_ref_w") / (num(suit, "o2_nominal_h") * 3600);
}

/** New O₂ fraction after dt_s seconds of the given activity; never below 0. */
export function stepO2(o2_frac: number, activity: "walking" | "resting", dt_s: number, suit: ParamSet): number {
  return Math.max(0, o2_frac - ratePerS(activity, suit) * dt_s);
}

/** Time left at the current activity, seconds. */
export function o2RemainingS(o2_frac: number, activity: "walking" | "resting", suit: ParamSet): number {
  return Math.max(0, o2_frac) / ratePerS(activity, suit);
}
