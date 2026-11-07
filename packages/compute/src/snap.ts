/**
 * Snapping clicked waypoints to the nearest passable cell (docs/specs/02 §D.2 "Snapping").
 * FR-06. Implemented by TASK-05 (T05.20).
 */
import type { MissionScenario } from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";

export const SNAP_RADIUS_M = 50;

/**
 * Nearest passable cell within snapRadiusM (default SNAP_RADIUS_M), or null.
 * A cell is passable if slope_p90 <= hard_slope_limit_deg and no HARD_HAZARD / NO_DATA flags.
 */
export function snapToPassable(
  grid: LoadedGrid,
  x_m: number,
  y_m: number,
  scenario: MissionScenario | { hard_slope_limit_deg: number },
  snapRadiusM = SNAP_RADIUS_M,
): { x_m: number; y_m: number; distance_m: number } | null {
  throw new Error("TODO(TASK-05): not implemented");
}
