/**
 * Plan state store (Contract C11 v1; docs/specs/03 §E.3 sequence; §C.3 editing; §E.4 state machine).
 * (FR-05, FR-06, FR-54). Freeze M2. Implemented by T08.03; tested in tests/state/planStore.test.ts (T08.02).
 *
 * Holds scenario, waypoints, the stops' authored tasks, plan_revision, results, and active selection/hover.
 * Actions support adding/moving/deleting waypoints, reordering stops, editing a stop's tasks (FR-54),
 * scenario editing (debounced), single-level undo, reset defaults, and plan loading.
 *
 * Revisions and dispatch (03 §E.3): every route edit (add, move, delete, reorder, undo, set or load a plan, a scenario
 * edit, reset, retry) raises `plan_revision` by one and sends one COMPUTE_PLAN carrying it; a scenario edit is sent
 * 300 ms after the last one, every other edit at once. A result is applied only when its revision is still the
 * latest. Nothing is sent without a start, at least one stop and a start time (02 §E.3: 2-11 waypoints; FD-042 gives
 * the start time no default), and the status is then Empty. Field ranges (02 §E.3) are the inputs form's to check
 * before it calls `setScenario`; the worker and Hab Core check them again (`INVALID_INPUT`).
 *
 * Stop tasks (FR-54, FR-50; 03 SCR-04): each stop carries 1-4 authored tasks (kind + one line of text, 05 StopTask).
 * The store keeps only the authored fields (`StopTaskSeed`, the shape of 05 Scenario `stop_tasks`); task state
 * (TODO/DONE/...) is simulated and lives in the Hab Core event log, never here. Tasks are published beside the plan
 * (`PUBLISH_PLAN`), not inside it, so editing a task does not bump `plan_revision`, does not send COMPUTE_PLAN and
 * leaves `plan_hash` unchanged (05 Scenario `stop_tasks`, U-48). Deleting a stop removes its tasks; undo restores both.
 * The store checks at most 4 tasks per stop and 1-60 characters of text; the 1-task minimum is the publish check.
 * `StopTaskSeed` comes from runtime.ts (C18), which this file now imports besides schema.ts and worker.ts.
 * A POI's suggested tasks (05 TaskLibraryEntry) are applied by the caller through `addStopTask` after `addWaypoint`
 * (FD-089); the store stays library-agnostic. POI selection is outside C11 (FD-090, FD-074).
 */
import type {
  MissionScenario,
  PlanResult,
  StopTaskSeed,
  Waypoint,
} from "@marswalk/protocol";
import type {
  ComputePlanRequest,
  ManualLegInput,
  PlanResultMessage,
  WorkerError,
  WorkerErrorCode,
} from "@marswalk/protocol";
import { MAX_STOPS } from "@marswalk/compute";
import { exportPlan } from "../export/planExport";
import { restoreLastPlan, saveLastPlan } from "./persist";

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
 * Selection and hover shape shared across Map, Stops List, and Profile Chart (C11). Frozen as written (FD-090): linking
 * is by distance along the route, by coordinate, by waypoint id and by leg index, and POI selection lives outside C11
 * (FD-074). Consumers: T08.05 (stops list row <-> marker), T08.06 and T08.08 (marker hover ring, selected focus ring,
 * drag), T09.02 and T09.05 (profile scrub <-> map), T13.06 (Delete removes the selected stop).
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
  /** Currently selected waypoint ID in the UI, or null if none. */
  selected_waypoint_id: string | null;
  /** Ephemeral hover position shared across map, list and profile chart. */
  hover: PlanHoverPosition | null;
  /**
   * The hand-drawn legs to integrate into the next plan (N-160(c), FD-441). Each names the waypoint pair it replaces
   * and carries the polyline the user drew; the worker measures it on the grid and computes the totals from it.
   * Empty: every leg is routed.
   */
  manual_legs: ManualLegInput[];
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
  /** Add a task to a stop (FR-54; at most 4 per stop, text 1-60 characters). Does not recompute the route. */
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
  /**
   * Take a validated manual leg into the plan (N-160(c)). The polyline goes to the worker with the next COMPUTE_PLAN,
   * which measures it on the grid and computes the totals, the timeline, the conditions and the radiation from it. The
   * page computes no science: it only hands over what the user drew.
   */
  setManualLeg(leg: ManualLegInput): void;
  /** Drop every manual leg: the next plan routes all of its legs. */
  clearManualLegs(): void;
  /** Subscribe to state changes. Returns an unsubscribe callback. */
  subscribe(listener: (state: PlanState) => void): () => void;
}

/**
 * Worker dispatch helper signature (C6 message types only).
 */
export type WorkerComputeDispatcher = (
  req: ComputePlanRequest
) => Promise<PlanResultMessage | WorkerError>;

/** 300 ms between the last scenario edit and its COMPUTE_PLAN (03 SCR-04, §C.3). */
export const SCENARIO_DEBOUNCE_MS = 300;

/** Tasks a stop may carry (FR-54). */
export const MAX_TASKS_PER_STOP = 4;

/** Characters of a task's one line (05 StopTask `text`, 04 §D.2). */
export const STOP_TASK_TEXT_MAX = 60;

/**
 * Scenario inputs a new plan starts from: the defaults of 01 FR-05 and 02 §E.3 (`assumed`, editable), the loop of FR-06
 * and the v2 defaults of 05 MissionScenario. The start time has no default (FD-042): empty until the planner or the
 * Hab Core's scenario supplies it.
 *
 * `hab_ingress_min` is 5 min: the suit ParamSet's `hab_ingress_min` of
 * `scenarios/storm-sol4190/param_sets/suit-assumed.json`, which is 02 §D.8's `t_ingress` (`assumed`, source "02 §D.8").
 * It is quoted in the plan so the worker can compute the planning haven time (02 §D.8, T09.09) without the ParamSet:
 * the plan's MissionScenario wins over the suit ParamSet for the crew's parameters (BD-57). It is not an editable
 * input; the panel does not offer it.
 */
export const DEFAULT_SCENARIO: MissionScenario = {
  eva_start_utc: "",
  max_eva_duration_h: 6,
  dwell_min_per_stop: 20,
  hard_slope_limit_deg: 15,
  caution_slope_deg: 10,
  walkback_limit_km: 5,
  suited_flat_speed_kmh: 3.3,
  solar_phase: "max",
  loop: true,
  max_haven_min: 30,
  crew_count: 2,
  vehicle_available: true,
  vehicle_param_set: "pr1-assumed",
  hab_ingress_min: 5,
};

/** What the store needs from the worker client (a subset of the C10 `WorkerClient`). */
export interface PlanStoreWorker {
  computePlan(req: Omit<ComputePlanRequest, "type">): Promise<PlanResultMessage>;
  retry(): void;
  isCrashed(): boolean;
}

export interface PlanStoreDeps {
  workerClient: PlanStoreWorker;
  /** `site_id` of every COMPUTE_PLAN (02 §E.2). */
  siteId: string;
  /** `data_version` of every COMPUTE_PLAN. */
  dataVersion: string;
  /**
   * Receives an exception thrown by a subscriber. Default: rethrown asynchronously, so it reaches the window's error
   * handling without stopping the other subscribers or the store.
   */
  onListenerError?: (error: unknown) => void;
  /** When false, skips restoring the last persisted plan on creation. Default true. */
  autoRestore?: boolean;
}

interface Snapshot {
  waypoints: Waypoint[];
  stop_tasks: StopTaskSeed[];
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The worker's error code behind a rejected request, or "SUPERSEDED"/"TERMINATED" for the two that are not failures. */
function failureCode(error: unknown): WorkerErrorCode | "SUPERSEDED" | "TERMINATED" {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code: unknown }).code : undefined;
  switch (code) {
    case "SUPERSEDED":
    case "CANCELLED":
      return "SUPERSEDED";
    case "TERMINATED":
      return "TERMINATED";
    case "GRID_NOT_LOADED":
    case "INVALID_INPUT":
    case "TIMEOUT":
    case "INTERNAL":
      return code;
    default:
      // CRASH (the worker died) and anything unrecognised: an internal failure (03 §E.4 Error).
      return "INTERNAL";
  }
}

function resultStatus(status: PlanResultMessage["status"]): PlanStatus {
  switch (status) {
    case "OK":
      return "OK";
    case "OVER_LIMITS":
      return "OverLimits";
    case "PARTIAL":
      return "Partial";
    default:
      return "Error";
  }
}

/** The PlanResult inside a PLAN_RESULT message (without the envelope fields). */
function resultOf(message: PlanResultMessage): PlanResult {
  const { type: _type, request_id: _requestId, plan_revision: _revision, ...result } = message;
  return result;
}

function nextWaypointId(waypoints: readonly Waypoint[], wanted: string): string {
  if (wanted && !waypoints.some((w) => w.id === wanted)) return wanted;
  let max = -1;
  for (const w of waypoints) {
    const match = /^wp-(\d+)$/.exec(w.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `wp-${max + 1}`;
}

/** Exactly one start and at most `MAX_STOPS` stops, all with finite coordinates (05 Waypoint, 01 FR-06). */
function isValidWaypointList(waypoints: readonly Waypoint[]): boolean {
  const starts = waypoints.filter((w) => w.role === "start").length;
  const stops = waypoints.length - starts;
  return starts === 1 && stops <= MAX_STOPS && waypoints.every((w) => isFiniteNumber(w.x_m) && isFiniteNumber(w.y_m));
}

/**
 * The manual legs a waypoint list still has a pair for (N-160(c)). A leg for a pair the list no longer has is dropped:
 * the plan has no such leg, so the polyline cannot enter it.
 */
function manualLegsFor(legs: readonly ManualLegInput[], waypoints: readonly Waypoint[], loop: boolean): ManualLegInput[] {
  if (legs.length === 0) return [];
  const pairs = new Set<string>();
  for (let i = 0; i < waypoints.length - 1; i++) pairs.add(`${waypoints[i]!.id}\u0000${waypoints[i + 1]!.id}`);
  if (loop && waypoints.length >= 2) pairs.add(`${waypoints[waypoints.length - 1]!.id}\u0000${waypoints[0]!.id}`);
  return legs.filter((l) => pairs.has(`${l.from}\u0000${l.to}`));
}

/**
 * The endpoints a drawn leg was measured against (N-160(c)). The polyline is a path between two waypoints, so it only
 * describes the plan while those waypoints still sit where the drawing put them: a moved waypoint makes the drawn leg
 * point at the old position, and the plan would then route to where the waypoint used to be.
 */
export function manualLegEndpoints(leg: ManualLegInput): { from: [number, number]; to: [number, number] } {
  const first = leg.vertices[0];
  const last = leg.vertices[leg.vertices.length - 1];
  return { from: [first![0], first![1]], to: [last![0], last![1]] };
}

/**
 * Whether a drawn leg still describes the current waypoint list (N-160(c)): the pair must still exist and both of its
 * waypoints must still sit where the drawing put them.
 */
export function manualLegStillMatches(leg: ManualLegInput, waypoints: readonly Waypoint[], loop: boolean): boolean {
  const pairs = new Map<string, [Waypoint, Waypoint]>();
  for (let i = 0; i < waypoints.length - 1; i++) pairs.set(`${waypoints[i]!.id}\u0000${waypoints[i + 1]!.id}`, [waypoints[i]!, waypoints[i + 1]!]);
  if (loop && waypoints.length >= 2) pairs.set(`${waypoints[waypoints.length - 1]!.id}\u0000${waypoints[0]!.id}`, [waypoints[waypoints.length - 1]!, waypoints[0]!]);
  const pair = pairs.get(`${leg.from}\u0000${leg.to}`);
  if (!pair) return false;
  const ends = manualLegEndpoints(leg);
  const [fromWp, toWp] = pair;
  return ends.from[0] === fromWp.x_m && ends.from[1] === fromWp.y_m && ends.to[0] === toWp.x_m && ends.to[1] === toWp.y_m;
}

/**
 * Create the plan store. `initial` gives the starting scenario, waypoints and tasks; `resetDefaults` returns to its
 * scenario. A store made with stops does not compute until the first edit or `loadPlan`.
 */
export function createPlanStore(initial: Partial<PlanState> | undefined, deps: PlanStoreDeps): PlanStore {
  const { workerClient } = deps;
  const defaults: MissionScenario = initial?.scenario ?? { ...DEFAULT_SCENARIO };
  let state: PlanState = {
    scenario: defaults,
    waypoints: [],
    stop_tasks: [],
    plan_revision: 0,
    status: "Empty",
    result: null,
    last_error_code: null,
    can_undo: false,
    selected_waypoint_id: null,
    hover: null,
    manual_legs: [],
    ...initial,
  };
  const listeners = new Set<(state: PlanState) => void>();
  let undoSnapshot: Snapshot | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let requestSeq = 0;

  const reportListenerError =
    deps.onListenerError ??
    ((error: unknown): void => {
      setTimeout(() => {
        throw error;
      }, 0);
    });

  function commit(patch: Partial<PlanState>): void {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        reportListenerError(error);
      }
    }
  }

  function cancelDebounce(): void {
    if (debounce !== null) clearTimeout(debounce);
    debounce = null;
  }

  /** A plan can be computed: a start, at least one stop and a start time (02 §E.3; FD-042). */
  function computable(s: Pick<PlanState, "scenario" | "waypoints">): boolean {
    const hasStart = s.waypoints.some((w) => w.role === "start");
    const hasStop = s.waypoints.some((w) => w.role === "stop");
    return hasStart && hasStop && typeof s.scenario.eva_start_utc === "string" && s.scenario.eva_start_utc.length > 0;
  }


  function send(revision: number): void {
    const request: Omit<ComputePlanRequest, "type"> = {
      request_id: `r-${String(++requestSeq).padStart(4, "0")}`,
      plan_revision: revision,
      site_id: deps.siteId,
      data_version: deps.dataVersion,
      scenario: state.scenario,
      waypoints: state.waypoints,
      // The hand-drawn legs travel with the plan (N-160(c)); the worker measures them and computes the totals from them.
      ...(state.manual_legs.length > 0 ? { manual_legs: state.manual_legs } : {}),
    };
    let pending: Promise<PlanResultMessage>;
    try {
      pending = workerClient.computePlan(request);
    } catch (error) {
      onFailure(revision, error);
      return;
    }
    pending.then(
      (message) => onResult(revision, message),
      (error: unknown) => onFailure(revision, error),
    );
  }

  function onResult(revision: number, message: PlanResultMessage): void {
    // Only the latest revision is applied (02 §E.2): a result for an older edit is dropped, unchanged state.
    if (revision !== state.plan_revision || message.plan_revision !== state.plan_revision) return;
    const status = resultStatus(message.status);
    commit({
      status,
      result: resultOf(message),
      last_error_code: status === "Error" ? "INTERNAL" : null,
    });
    if (status === "OK" || status === "OverLimits" || status === "Partial") {
      try {
        const site = { site_id: deps.siteId, data_version: deps.dataVersion };
        const exported = exportPlan(site, state);
        saveLastPlan(exported);
      } catch {
        // Storage or export failures are silently ignored (01 FR-20, 03 §C.5)
      }
    }
  }

  function onFailure(revision: number, error: unknown): void {
    if (revision !== state.plan_revision) return;
    const code = failureCode(error);
    if (code === "SUPERSEDED" || code === "TERMINATED") return;
    commit({ status: "Error", last_error_code: code });
  }

  /**
   * Apply a route edit: raise the revision, merge `patch`, and either send COMPUTE_PLAN (`now`), arm the debounce, or
   * fall back to Empty when nothing can be computed. Older in-flight results are dropped by the revision.
   */
  function routeEdit(patch: Partial<PlanState>, mode: "now" | "debounced"): void {
    cancelDebounce();
    const revision = state.plan_revision + 1;
    const next = { scenario: state.scenario, waypoints: state.waypoints, ...patch };
    if (!computable(next)) {
      commit({ ...patch, plan_revision: revision, status: "Empty", result: null, last_error_code: null });
      return;
    }
    commit({ ...patch, plan_revision: revision, status: "Computing", last_error_code: null });
    if (mode === "now") {
      send(revision);
    } else {
      debounce = setTimeout(() => {
        debounce = null;
        send(state.plan_revision);
      }, SCENARIO_DEBOUNCE_MS);
    }
  }

  /** An edit of the waypoint list: keeps one undo level (waypoints and tasks), drops tasks of removed stops. */
  function waypointEdit(waypoints: Waypoint[], tasks: StopTaskSeed[] = state.stop_tasks): void {
    undoSnapshot = { waypoints: state.waypoints, stop_tasks: state.stop_tasks };
    const stopIds = new Set(waypoints.filter((w) => w.role === "stop").map((w) => w.id));
    const ids = new Set(waypoints.map((w) => w.id));
    // A manual leg the new waypoint list no longer describes is dropped (N-160(c)): its pair may be gone, or one of its
    // waypoints may have moved, and the drawn polyline no longer joins the two.
    const manual_legs = manualLegsFor(state.manual_legs, waypoints, state.scenario.loop)
      .filter((l) => manualLegStillMatches(l, waypoints, state.scenario.loop));
    routeEdit(
      {
        waypoints,
        stop_tasks: tasks.filter((t) => stopIds.has(t.stop_id)),
        can_undo: true,
        selected_waypoint_id: state.selected_waypoint_id && ids.has(state.selected_waypoint_id) ? state.selected_waypoint_id : null,
        hover: state.hover?.waypoint_id && !ids.has(state.hover.waypoint_id) ? null : state.hover,
        ...(manual_legs.length !== state.manual_legs.length ? { manual_legs } : {}),
      },
      "now",
    );
  }

  function isTaskTextValid(text: string): boolean {
    return text.trim().length > 0 && text.length <= STOP_TASK_TEXT_MAX;
  }

  const store: PlanStore = {
    get: () => state,

    setScenario(patch) {
      routeEdit({ scenario: { ...state.scenario, ...patch } }, "debounced");
    },

    setWaypoints(waypoints) {
      if (!isValidWaypointList(waypoints)) return;
      waypointEdit([...waypoints]);
    },

    addWaypoint(waypoint) {
      if (!isFiniteNumber(waypoint.x_m) || !isFiniteNumber(waypoint.y_m)) return;
      const hasStart = state.waypoints.some((w) => w.role === "start");
      const stopCount = state.waypoints.filter((w) => w.role === "stop").length;
      if (waypoint.role === "start" ? hasStart : stopCount >= MAX_STOPS) return;
      const added: Waypoint = { ...waypoint, id: nextWaypointId(state.waypoints, waypoint.id) };
      waypointEdit(waypoint.role === "start" ? [added, ...state.waypoints] : [...state.waypoints, added]);
    },

    moveWaypoint(id, x_m, y_m) {
      if (!isFiniteNumber(x_m) || !isFiniteNumber(y_m)) return;
      if (!state.waypoints.some((w) => w.id === id)) return;
      waypointEdit(
        state.waypoints.map((w) => {
          if (w.id !== id) return w;
          const { snapped_from: _snappedFrom, ...rest } = w;
          return { ...rest, x_m, y_m };
        }),
      );
    },

    deleteWaypoint(id) {
      const target = state.waypoints.find((w) => w.id === id);
      if (!target || target.role !== "stop") return;
      waypointEdit(state.waypoints.filter((w) => w.id !== id));
    },

    reorderWaypoints(waypoint_ids) {
      const start = state.waypoints.find((w) => w.role === "start");
      const stops = state.waypoints.filter((w) => w.role === "stop");
      // Accept the stops' ids, or every id with the start first.
      const wanted = start && waypoint_ids[0] === start.id ? waypoint_ids.slice(1) : waypoint_ids;
      const byId = new Map(stops.map((w) => [w.id, w]));
      if (wanted.length !== stops.length || new Set(wanted).size !== wanted.length || !wanted.every((wid) => byId.has(wid))) return;
      if (wanted.every((wid, i) => stops[i]!.id === wid)) return;
      waypointEdit([...(start ? [start] : []), ...wanted.map((wid) => byId.get(wid)!)]);
    },

    addStopTask(task) {
      const stop = state.waypoints.find((w) => w.id === task.stop_id);
      if (!stop || stop.role !== "stop") return;
      if (!isTaskTextValid(task.text)) return;
      if (state.stop_tasks.some((t) => t.task_id === task.task_id)) return;
      if (state.stop_tasks.filter((t) => t.stop_id === task.stop_id).length >= MAX_TASKS_PER_STOP) return;
      commit({ stop_tasks: [...state.stop_tasks, { ...task }] });
    },

    updateStopTask(task_id, patch) {
      const current = state.stop_tasks.find((t) => t.task_id === task_id);
      if (!current) return;
      if (patch.text !== undefined && !isTaskTextValid(patch.text)) return;
      commit({ stop_tasks: state.stop_tasks.map((t) => (t.task_id === task_id ? { ...t, ...patch } : t)) });
    },

    deleteStopTask(task_id) {
      if (!state.stop_tasks.some((t) => t.task_id === task_id)) return;
      commit({ stop_tasks: state.stop_tasks.filter((t) => t.task_id !== task_id) });
    },

    undo() {
      if (!undoSnapshot) return;
      const snapshot = undoSnapshot;
      undoSnapshot = null;
      const ids = new Set(snapshot.waypoints.map((w) => w.id));
      routeEdit(
        {
          waypoints: snapshot.waypoints,
          stop_tasks: snapshot.stop_tasks,
          can_undo: false,
          selected_waypoint_id: state.selected_waypoint_id && ids.has(state.selected_waypoint_id) ? state.selected_waypoint_id : null,
          manual_legs: manualLegsFor(state.manual_legs, snapshot.waypoints, state.scenario.loop)
            .filter((l) => manualLegStillMatches(l, snapshot.waypoints, state.scenario.loop)),
        },
        "now",
      );
    },

    resetDefaults() {
      routeEdit({ scenario: defaults }, "now");
    },

    loadPlan(scenario, waypoints, stop_tasks = []) {
      if (!isValidWaypointList(waypoints)) return;
      undoSnapshot = null;
      const stopIds = new Set(waypoints.filter((w) => w.role === "stop").map((w) => w.id));
      routeEdit(
        {
          scenario,
          waypoints: [...waypoints],
          stop_tasks: stop_tasks.filter((t) => stopIds.has(t.stop_id)),
          can_undo: false,
          selected_waypoint_id: null,
          hover: null,
          manual_legs: [],
        },
        "now",
      );
    },

    selectWaypoint(id) {
      commit({ selected_waypoint_id: id !== null && state.waypoints.some((w) => w.id === id) ? id : null });
    },

    setHover(hover) {
      const previous = state.hover;
      if (previous === hover || (previous && hover &&
        previous.distance_m === hover.distance_m && previous.leg_index === hover.leg_index &&
        previous.waypoint_id === hover.waypoint_id &&
        (previous.coord === hover.coord || (previous.coord && hover.coord && previous.coord[0] === hover.coord[0] && previous.coord[1] === hover.coord[1])))) return;
      commit({ hover });
    },

    retry() {
      if (state.status !== "Error") return;
      if (workerClient.isCrashed()) workerClient.retry();
      routeEdit({}, "now");
    },

    setManualLeg(leg) {
      // One leg per pair: a second drawing of the same pair replaces the first.
      const kept = state.manual_legs.filter((l) => !(l.from === leg.from && l.to === leg.to));
      routeEdit({ manual_legs: [...kept, leg] }, "now");
    },

    clearManualLegs() {
      if (state.manual_legs.length === 0) return;
      routeEdit({ manual_legs: [] }, "now");
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  if (deps.autoRestore !== false && (!initial?.waypoints || initial.waypoints.filter((w) => w.role === "stop").length === 0)) {
    const restored = restoreLastPlan({ site_id: deps.siteId, data_version: deps.dataVersion });
    if (restored) {
      store.setScenario(restored.scenario);
      store.setWaypoints(restored.waypoints);
    }
  }

  return store;
}
