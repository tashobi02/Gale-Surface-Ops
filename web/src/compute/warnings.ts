/**
 * Hazard and constraint warnings (docs/specs/01 FR-10; 05 §C Warning; 02 §E.2 PARTIAL rule).
 * Implemented by TASK-05.
 */
import type { Leg, MissionScenario, PlanResult, Warning } from "../types/schema";

/**
 * Collect slope, LOW_TI / TI_UNKNOWN, LOW_RES_DEM, NO_ROUTE, EVA duration, walkback and
 * darkness warnings. Missing TI layer yields TI_UNKNOWN, never silence (05 §E.6). TASK-05.
 */
export function collectWarnings(legs: Leg[], scenario: MissionScenario, timeline: PlanResult["stops_timeline"], maxWalkbackKm: number): Warning[] {
  throw new Error("TODO(TASK-05): not implemented");
}

/**
 * Plan status: PARTIAL if any leg is NO_ROUTE (totals null), OVER_LIMITS if a limit is
 * exceeded, else OK (03 §E.4). TASK-05.
 */
export function planStatus(legs: Leg[], warnings: Warning[]): PlanResult["status"] {
  throw new Error("TODO(TASK-05): not implemented");
}
