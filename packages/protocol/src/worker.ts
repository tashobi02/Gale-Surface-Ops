/**
 * Worker message contract from docs/specs/02 §E.2 (FR-03, FR-06, FR-07).
 * Every request carries request_id; the worker processes only the latest plan_revision and
 * a newer request cancels an older one.
 * PLAN_RESULT reuses the 05 PlanResult type: 02 §E says 05 owns field definitions
 * (the 02 §E.2 example's `path_cells` / `geometry_ref` differ from 05's Leg fields).
 */
import type { FlagName, MissionScenario, PlanResult, Waypoint } from "./schema";

export interface SamplePointRequest {
  type: "SAMPLE_POINT";
  request_id: string;
  /** Working-projection metres. */
  x_m: number;
  y_m: number;
  /** Snap search radius, metres (default use: 50). */
  snap_radius_m: number;
}

export type SampleReason = "OUTSIDE_AOI" | "NO_DATA" | "HARD_HAZARD" | "SLOPE_OVER_LIMIT";

export interface SampleResult {
  type: "SAMPLE_RESULT";
  request_id: string;
  inside_aoi: boolean;
  passable: boolean;
  reason: SampleReason | null;
  lat: number;
  lon_e: number;
  elevation_m: number;
  slope_p90_deg: number;
  /** tiu, or null when no TI coverage. */
  ti_tiu: number | null;
  flags: FlagName[];
  /** null when no passable cell lies within snap_radius_m. */
  snap: { x_m: number; y_m: number; distance_m: number } | null;
}

export interface ComputePlanRequest {
  type: "COMPUTE_PLAN";
  request_id: string;
  plan_revision: number;
  site_id: string;
  data_version: string;
  scenario: MissionScenario;
  waypoints: Waypoint[];
}

/** Rule (02 §E.2): any NO_ROUTE leg ⇒ status "PARTIAL" and totals null. */
export type PlanResultMessage = {
  type: "PLAN_RESULT";
  request_id: string;
  plan_revision: number;
} & PlanResult;

export type WorkerErrorCode = "GRID_NOT_LOADED" | "INVALID_INPUT" | "TIMEOUT" | "CANCELLED" | "INTERNAL";

export interface WorkerError {
  type: "ERROR";
  request_id: string;
  code: WorkerErrorCode;
  message: string;
}

export type WorkerRequest = SamplePointRequest | ComputePlanRequest;
export type WorkerResponse = SampleResult | PlanResultMessage | WorkerError;

/** Cooperative cancellation check interval, node expansions (02 §E.2). */
export const CANCEL_CHECK_EVERY_EXPANSIONS = 50_000;
