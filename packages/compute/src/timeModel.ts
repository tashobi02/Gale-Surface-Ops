/**
 * Walking time model (docs/specs/02 §D.3; ADR-005). FR-09. Implemented by TASK-05.
 * Label: modelled — Earth hiking function scaled to an Apollo lunar planning speed;
 * not validated for Mars suits or 0.38 g.
 */
import type { MissionScenario, PlanResult, Waypoint } from "@marswalk/protocol";

/**
 * Suited walking speed for a signed gradient S = Δz/d (uphill positive).
 * Input: S (dimensionless), v0 (km/h, flat suited speed). Output: km/h. TASK-05.
 */
export function suitedSpeedKmh(gradient: number, v0Kmh: number): number {
  throw new Error("TODO(TASK-05): not implemented");
}

/**
 * Time for one grid step. Input: horizontal step d (m), Δz (m), v0 (km/h), caution multiplier.
 * Output: hours. TASK-05.
 */
export function stepTimeH(dM: number, dzM: number, v0Kmh: number, multiplier: number): number {
  throw new Error("TODO(TASK-05): not implemented");
}

/**
 * EVA timeline: start + Σ leg walk time + Σ dwell. Output: per-stop arrival/departure (UTC).
 * LTST and sun elevation are filled in by mars24.ts. TASK-05.
 */
export function evaTimeline(scenario: MissionScenario, waypoints: Waypoint[], legWalkMin: number[]): Pick<PlanResult["stops_timeline"][number], "arrive_utc" | "depart_utc">[] {
  throw new Error("TODO(TASK-05): not implemented");
}
