/**
 * Point and profile sampling (docs/specs/02 §D.1). FR-03, FR-08. Implemented by TASK-05.
 * Nearest cell for slope/flags, bilinear elevation for profiles, nearest TI from the 100 m sidecar.
 */
import type { LegProfile } from "@marswalk/protocol";
import type { SampleResult } from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";

/**
 * Sample one point. Input: x_m, y_m (m), snap radius (m), hard slope limit (°).
 * Output: SAMPLE_RESULT fields; OUTSIDE_AOI / NO_DATA give null-like values with a reason. TASK-05.
 */
export function samplePoint(
  grid: LoadedGrid,
  x_m: number,
  y_m: number,
  snapRadiusM: number,
  hardSlopeLimitDeg: number,
): Omit<SampleResult, "type" | "request_id"> {
  throw new Error("TODO(TASK-05): not implemented");
}

/**
 * Elevation/slope profile along a cell path, every 5 m (05 §C Leg.profile).
 * Input: path as [x_m, y_m] pairs. Output: dist_m[], elev_m[], slope_class[]. TASK-05.
 */
export function sampleProfile(grid: LoadedGrid, path: [number, number][], cautionSlopeDeg: number, hardSlopeLimitDeg: number): LegProfile {
  throw new Error("TODO(TASK-05): not implemented");
}
