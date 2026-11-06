/**
 * Suit consumables (docs/specs/02 §D.14, §D.6; FR-35). O₂ fraction falls at
 * rate = P_met / P_ref / o2_nominal_h, with P_met for walking or resting (05 ParamSet kind `suit`).
 * TASK-05b.
 */
import type { ParamSet } from "@marswalk/protocol";

/** New O₂ fraction after dt_s seconds of the given activity. TASK-05b. */
export function stepO2(o2_frac: number, activity: "walking" | "resting", dt_s: number, suit: ParamSet): number {
  throw new Error("TODO(TASK-05b): not implemented");
}

/** Time left at the current activity, seconds. TASK-05b. */
export function o2RemainingS(o2_frac: number, activity: "walking" | "resting", suit: ParamSet): number {
  throw new Error("TODO(TASK-05b): not implemented");
}
