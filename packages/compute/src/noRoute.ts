/**
 * No-route failure classification and nearest reachable cell calculation (docs/specs/02 §D.2; 05 NoRouteReason).
 * FR-07. Implemented by TASK-05 (T05.19).
 */
import type { NoRouteReason } from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";

export interface NoRouteInfo {
  reason: NoRouteReason;
  nearest_reachable: { x_m: number; y_m: number };
}

/**
 * Determine the reason why a leg could not be routed and find the nearest
 * explored/reachable cell to the destination.
 */
export function determineNoRoute(
  grid: LoadedGrid,
  target: { x_m: number; y_m: number },
  exploredCells: Set<number> | number[],
): NoRouteInfo {
  throw new Error("TODO(TASK-05): not implemented");
}
