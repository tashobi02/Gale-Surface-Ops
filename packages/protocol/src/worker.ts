/**
 * Worker message contract from docs/specs/02 §E.2 (FR-03, FR-06, FR-07).
 * Every request carries request_id; the worker processes only the latest plan_revision and
 * a newer request cancels an older one.
 * PLAN_RESULT reuses the 05 PlanResult type: 02 §E says 05 owns field definitions
 * (the 02 §E.2 example's `path_cells` / `geometry_ref` differ from 05's Leg fields).
 *
 * Protocol v0 — freeze date 2026-11-07 (M1; T05.01, contract C6).
 *
 * Protocol v0.2 (2026-11-12, T32.01, C6 v1): decided in docs/plan/backend/decisions.md and written into 02 §E.2
 * (Proposed 2026-11-12). Grid delivery: `LOAD_GRID` (BD-40), answered `GRID_LOADED` or `ERROR`; until then requests
 * get `GRID_NOT_LOADED`. Cancellation: a cooperative yield every `CANCEL_CHECK_EVERY_EXPANSIONS` expansions, and a
 * `COMPUTE_PLAN` with a higher `plan_revision` cancels the running one, which is answered `ERROR` `CANCELLED` (BD-41).
 * SAMPLE_POINT keeps the optional `hard_slope_limit_deg` (BD-42). `VALIDATE_MANUAL_LEG` is the manual-leg fallback (T05.30).
 */
import type { FlagName, Leg, MissionScenario, PlanResult, RoutingGrid, Waypoint, Warning } from "./schema";

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

/**
 * The routing-grid metadata the worker needs: the 05 RoutingGrid record (the compute `LoadedGrid.meta`) plus the
 * working-projection `proj4` string, byte-identical to the manifest's (05 §E.3; BD-45). No other new field.
 */
export type LoadedGridMeta = RoutingGrid & { proj4: string };

/**
 * Main thread -> worker: deliver the grid (BD-40). The arrays are transferred, not copied. Key names follow
 * `LoadedGrid` / `loadGrid` in packages/compute/src/grid.ts (`slopeP90`, `slopeMax`, `commHab`); `ti` is null when the
 * TI layer is unavailable (05 §E.6).
 */
export interface LoadGridRequest {
  type: "LOAD_GRID";
  request_id: string;
  site_id: string;
  data_version: string;
  meta: LoadedGridMeta;
  arrays: {
    elevation: ArrayBuffer;
    slopeP90: ArrayBuffer;
    slopeMax: ArrayBuffer;
    flags: ArrayBuffer;
    ti: ArrayBuffer | null;
    commHab: ArrayBuffer;
  };
}

export interface GridLoaded {
  type: "GRID_LOADED";
  request_id: string;
  site_id: string;
  data_version: string;
}

/** Manual-leg fallback (T05.30, N-25): validate a hand-drawn leg against the grid and the scenario limits. */
export interface ValidateManualLegRequest {
  type: "VALIDATE_MANUAL_LEG";
  request_id: string;
  plan_revision: number;
  scenario: MissionScenario;
  /** Waypoint ids. */
  from: string;
  to: string;
  /** Working-projection metres. */
  vertices: [number, number][];
}

export interface ManualLegResult {
  type: "MANUAL_LEG_RESULT";
  request_id: string;
  plan_revision: number;
  leg: Leg;
  warnings: Warning[];
}

export type WorkerRequest = LoadGridRequest | SamplePointRequest | ComputePlanRequest | ValidateManualLegRequest;
export type WorkerResponse = GridLoaded | SampleResult | PlanResultMessage | ManualLegResult | WorkerError;

/** Cooperative cancellation check interval, node expansions (02 §E.2). */
export const CANCEL_CHECK_EVERY_EXPANSIONS = 50_000;
