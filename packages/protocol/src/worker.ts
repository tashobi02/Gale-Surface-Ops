/**
 * Worker message contract from docs/specs/02 §E.2 (FR-03, FR-06, FR-07).
 * Every request carries request_id; the worker processes only the latest plan_revision and
 * a newer request cancels an older one.
 * PLAN_RESULT reuses the 05 PlanResult type: 02 §E says 05 owns field definitions
 * (the 02 §E.2 example's `path_cells` / `geometry_ref` differ from 05's Leg fields).
 *
 * Protocol v0 — freeze date 2026-11-07 (M1; T05.01, contract C6).
 *
 * Open decisions (coordination map open points 4, 5, 19):
 * - TODO(decision): Grid delivery to the worker. 02 §E.2 defines GRID_NOT_LOADED but no
 *   message that delivers the grid. Options: dedicated LOAD_GRID message transferring
 *   ArrayBuffers, or worker fetches grid binary directly from site assets.
 * - TODO(decision): Cancellation mechanism. Check every 50,000 expansions (02 §E.2) only sees
 *   newer messages if the search yields to the worker event loop or checks an abort flag.
 * - TODO(decision): SAMPLE_POINT passability depends on hard_slope_limit_deg (02 §D.2), but
 *   02 §E.2 example carries none; optional hard_slope_limit_deg supported below.
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
  /**
   * Optional hard slope limit in degrees (default 15° from scenario).
   * Coordination map open point 19.
   */
  hard_slope_limit_deg?: number;
}

export type SampleReason = "OUTSIDE_AOI" | "NO_DATA" | "HARD_HAZARD" | "SLOPE_OVER_LIMIT";

export interface SampleResult {
  type: "SAMPLE_RESULT";
  request_id: string;
  inside_aoi: boolean;
  passable: boolean;
  reason: SampleReason | null;
  /** null when outside AOI or NaN (02 §D.1, coordination map open point 20). */
  lat: number | null;
  lon_e: number | null;
  elevation_m: number | null;
  slope_p90_deg: number | null;
  /** tiu, or null when no TI coverage or outside AOI. */
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
