/**
 * Shared input validation for mission scenarios and waypoints (docs/specs/02 §E.3).
 * FR-05. Implemented by TASK-05 (T05.25).
 * Used by both UI forms (T08.04) and Web Worker / Hab Core (T05.26) for defense in depth.
 */
import type { MissionScenario, Waypoint } from "@marswalk/protocol";

export interface FieldValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Validates mission scenario parameters and waypoint lists against 02 §E.3 rules.
 * Returns an array of validation errors (empty if valid).
 */
export function validatePlanInput(
  scenario: Partial<MissionScenario>,
  waypoints?: Waypoint[],
): FieldValidationError[] {
  throw new Error("TODO(TASK-05): not implemented");
}
