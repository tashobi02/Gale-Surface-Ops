/**
 * Sky-view factor terrain refuge (docs/specs/02 §D.16; FR-47, Tier 2). SVF ≈ mean over 16
 * azimuths of cos²(horizon elevation), max distance 2 km. Simplified isotropic model. TASK-18.
 */
import type { LoadedGrid } from "./grid";

/** SVF per cell on a coarse grid. TASK-18. */
export function skyViewFactor(grid: LoadedGrid, cell_m: number, max_dist_m: number): Float32Array {
  throw new Error("TODO(TASK-18): not implemented");
}
