/**
 * Plan state store contract (Contract C11 v1; docs/specs/03 §E.3 sequence; §C.3 editing; §E.4 state machine).
 * (FR-05, FR-06). Freeze M2.
 *
 * Holds scenario, waypoints, the stops' authored tasks, plan_revision, results, and active selection/hover.
 * Actions support adding/moving/deleting waypoints, reordering stops, editing a stop's tasks (FR-54),
 * scenario editing (debounced), single-level undo, reset defaults, and plan loading.
 *
 * Stub for T08.03.
 *
 * Stop tasks (FR-54, FR-50; 03 SCR-04): each stop carries 1-4 authored tasks (kind + one line of text, 05 StopTask).
 * The store keeps only the authored fields (`StopTaskSeed`, the shape of 05 Scenario `stop_tasks`); task state
 * (TODO/DONE/...) is simulated and lives in the Hab Core event log, never here. Tasks are published beside the plan
 * (`PUBLISH_PLAN`), not inside it, so editing a task does not bump `plan_revision`, does not send COMPUTE_PLAN and
 * leaves `plan_hash` unchanged (05 Scenario `stop_tasks`, U-48). Deleting a stop removes its tasks; undo restores both.
 * `StopTaskSeed` comes from runtime.ts (C18), which this file now imports besides schema.ts and worker.ts.
 * TODO(decision): where the suggested tasks of a POI (05 TaskLibraryEntry) are applied when a stop is added at a POI:
 * by the caller through `addStopTask`, or by `addWaypoint`. Follow-up on C11 once T08.03 starts (consumers: T08.04, T08.05, T10.01).
 */
import type {
  MissionScenario,
  PlanResult,
  StopTaskSeed,
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
 * The fields of a stop task a planner may edit (FR-54): `task_id` and `stop_id` are fixed once created.
 */
export type StopTaskPatch = Partial<Pick<StopTaskSeed, "crew_id" | "kind" | "text">>;

/**
 * Selection and hover shape shared across Map, Stops List, and Profile Chart (C11).
 * TODO(decision): C11 open point "selection and hover shape for map <-> list <-> profile linking" (coordination map
 * §d, C11 row): whether linking is by distance along the route, by coordinate or by waypoint id, and whether POI
 * selection lives here. Consumers waiting on it: T08.05 (stops list row <-> marker), T08.06 and T08.08 (marker hover
 * ring, selected focus ring, drag), T09.02 and T09.05 (profile scrub <-> map), T10.01 (POI selection opens SCR-06),
 * T13.06 (Delete removes the selected stop). The fields below are the proposal those consumers code against.
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
  /**
   * Authored tasks of the stops, 1-4 per stop (FR-50, FR-54). `stop_id` is the `id` of a stop Waypoint (05 StopTask).
   * Not part of the routing inputs: see the header.
   */
  stop_tasks: StopTaskSeed[];
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
  /** Currently selected waypoint ID in the UI, or null if none (TODO(decision): see PlanHoverPosition). */
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
  /** Add a task to a stop (FR-54; 1-4 per stop is checked by T08.03). Does not recompute the route. */
  addStopTask(task: StopTaskSeed): void;
  /** Edit a stop task's crew, kind or text (FR-54). Does not recompute the route. */
  updateStopTask(task_id: string, patch: StopTaskPatch): void;
  /** Delete a stop task (FR-54). Does not recompute the route. */
  deleteStopTask(task_id: string): void;
  /** Single-level undo of last waypoint edit (01 FR-06, 03 §C.3). */
  undo(): void;
  /** Reset scenario inputs to initial defaults. */
  resetDefaults(): void;
  /** Load an entire plan (e.g. demo plan or restored export); `stop_tasks` defaults to none. */
  loadPlan(scenario: MissionScenario, waypoints: Waypoint[], stop_tasks?: StopTaskSeed[]): void;
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
