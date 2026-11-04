/**
 * Space-weather replay: trigger and dose integral (docs/specs/02 §D.13; FR-37, FR-38). TASK-05b.
 * Units: absorbed dose µGy and µGy/h. Never converted to Sv for the event.
 */
import type { DoseSeries, ParamSet } from "@marswalk/protocol";

/** Replayed rate at t; step-hold between samples; null inside a gap. TASK-05b. */
export function rateAt(series: DoseSeries, t_utc: string): number | null {
  throw new Error("TODO(TASK-05b): not implemented");
}

/**
 * Trigger state: alert when rate > k × background for 2 consecutive samples; clear when
 * rate < clear_k × background for clear_min minutes (05 ParamSet kind `alert`). TASK-05b.
 */
export function triggerState(series: DoseSeries, t_utc: string, alertParams: ParamSet): "nominal" | "alert" {
  throw new Error("TODO(TASK-05b): not implemented");
}

/** dose = Σ rate(t) × shielding(location(t)) × Δt, with Δt in hours. TASK-05b. */
export function integrateDose(
  series: DoseSeries,
  steps: { t_utc: string; dt_s: number; shelter: "suit" | "pressurized_rover" | "hab" | "refuge"; refuge_factor?: number }[],
  shielding: ParamSet,
): number {
  throw new Error("TODO(TASK-05b): not implemented");
}
