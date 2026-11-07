/**
 * Plan state store contract (Contract C11 v1; docs/specs/03 §E.3 sequence; §C.3 editing; §E.4 state machine).
 * (FR-05, FR-06). Freeze M2.
 *
 * Holds scenario, waypoints, plan_revision, results, and active selection/hover.
 * Actions support adding/moving/deleting waypoints, reordering stops, scenario editing (debounced),
 * single-level undo, reset defaults, and plan loading.
 *
 * Stub for T08.03.
 */
import type {
  MissionScenario,
  PlanResult,
  Waypoint,
} from "@marswalk/protocol";
import type {
  ComputePlanRequest,
  PlanResultMessage,
  WorkerError,
  WorkerErrorCode,
} from "@marswalk/protocol";

/**
 * Plan computation lifecycle state per 03 §E.4.
 * - Empty: no stops placed yet (or all stops removed).
 * - Computing: worker currently solving route legs for the latest revision.
 * - OK: all legs routed successfully and within scenario constraints.
 * - OverLimits: route found but duration, walkback, or daylight exceeded.
 * - Partial: at least one leg has NO_ROUTE.
 * - Error: worker error (e.g. TIMEOUT or INTERNAL).
 */
export type PlanStatus =
  | "Empty"
  | "Computing"
  | "OK"
  | "OverLimits"
  | "Partial"
  | "Error";

/**
 * Selection and hover shape shared across Map, Stops List, and Profile Chart (C11).
 * TODO(decision): open point on exact coordinate vs distance linking resolution.
 */
export interface PlanHoverPosition {
  /** Distance along current traverse route in metres (profile chart scrub). */
  distance_m?: number;
  /** Working-projection metres [x_m, y_m]. */
  coord?: [number, number];
  /** Waypoint ID if hovering directly over a stop marker or list row. */
  waypoint_id?: string;
  /** Leg index (0-based) if hovering over a specific route segment. */
  leg_index?: number;
}

/**
 * Immutable plan store state snapshot (03 §E.4, 05 §C).
 */
export interface PlanState {
  /** Mission input constraints and parameters. */
  scenario: MissionScenario;
  /** Ordered list of waypoints (start at index 0, followed by stops). */
  waypoints: Waypoint[];
  /** Monotonically increasing revision number, bumped on each edit (03 §E.3). */
  plan_revision: number;
  /** Current computation lifecycle status (03 §E.4). */
  status: PlanStatus;
  /** Latest computed plan result from the worker, or null if Empty or Error. */
  result: PlanResult | null;
  /** Worker error code if status is "Error", null otherwise. */
  last_error_code: WorkerErrorCode | null;
  /** True when a previous waypoint state is available to restore via undo() (01 FR-06). */
  can_undo: boolean;
  /** Currently selected waypoint ID in the UI, or null if none. */
  selected_waypoint_id: string | null;
  /** Ephemeral hover position shared across map, list and profile chart. */
  hover: PlanHoverPosition | null;
}

/**
 * Plan store action dispatch interface (03 §C.3).
 */
export interface PlanStore {
  /** Get current snapshot. */
  get(): PlanState;
  /** Partial update of mission scenario inputs (debounced 300 ms before recompute, 03 SCR-04). */
  setScenario(patch: Partial<MissionScenario>): void;
  /** Replace full waypoint list. */
  setWaypoints(waypoints: Waypoint[]): void;
  /** Add a new waypoint (stop or POI). */
  addWaypoint(waypoint: Waypoint): void;
  /** Update coordinates of an existing waypoint on drag drop (03 §C.3). */
  moveWaypoint(id: string, x_m: number, y_m: number): void;
  /** Delete a stop waypoint by ID (immediate recompute, 03 §C.3). */
  deleteWaypoint(id: string): void;
  /** Reorder stop waypoints (immediate recompute, 03 §C.3). */
  reorderWaypoints(waypoint_ids: string[]): void;
  /** Single-level undo of last waypoint edit (01 FR-06, 03 §C.3). */
  undo(): void;
  /** Reset scenario inputs to initial defaults. */
  resetDefaults(): void;
  /** Load an entire plan (e.g. demo plan or restored export). */
  loadPlan(scenario: MissionScenario, waypoints: Waypoint[]): void;
  /** Set selected waypoint. */
  selectWaypoint(id: string | null): void;
  /** Set shared hover state. */
  setHover(hover: PlanHoverPosition | null): void;
  /** Retry plan computation after an Error state (03 §E.4). */
  retry(): void;
  /** Subscribe to state changes. Returns an unsubscribe callback. */
  subscribe(listener: (state: PlanState) => void): () => void;
}

/**
 * Worker dispatch helper signature (C6 message types only).
 */
export type WorkerComputeDispatcher = (
  req: ComputePlanRequest
) => Promise<PlanResultMessage | WorkerError>;

/**
 * Create the plan store with the given initial state or defaults.
 * Stub for T08.03.
 */
export function createPlanStore(initial?: Partial<PlanState>): PlanStore {
  throw new Error("TODO(T08.03): not implemented");
}
