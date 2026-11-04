/**
 * Line-of-sight coverage (docs/specs/02 §D.11; FR-42). Binary LOS with Mars curvature drop
 * d² / 2R, R = 3,396,190 m. No Fresnel zone, diffraction or link budget. TASK-05b.
 */
import type { LoadedGrid } from "./grid";

export const MARS_RADIUS_M = 3_396_190;

/** Horizon distance for an antenna height h on a smooth Mars sphere: √(2Rh). */
export function horizonDistanceM(height_m: number): number {
  throw new Error("TODO(TASK-05b): not implemented");
}

/** Is target visible from source? Heights are above local terrain. TASK-05b. */
export function lineOfSight(
  grid: LoadedGrid,
  from: { x_m: number; y_m: number; height_m: number },
  to: { x_m: number; y_m: number; height_m: number },
): boolean {
  throw new Error("TODO(TASK-05b): not implemented");
}

/** Viewshed on a coarse grid (20 m) within `radius_m` of a relay rover. 1 = visible. TASK-05b. */
export function viewshed(grid: LoadedGrid, from: { x_m: number; y_m: number; height_m: number }, target_height_m: number, radius_m: number, cell_m: number): Uint8Array {
  throw new Error("TODO(TASK-05b): not implemented");
}
