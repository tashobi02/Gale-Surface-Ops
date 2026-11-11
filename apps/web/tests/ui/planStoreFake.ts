/**
 * Test double for the C11 `PlanStore` (apps/web/src/state/planStore.ts; `createPlanStore` is T08.03 and still a stub).
 * It holds a PlanState, notifies subscribers on `emit`, and records the retry call the panel makes.
 */
import { vi } from "vitest";
import type { MissionScenario, PlanResult, Waypoint } from "@marswalk/protocol";
import type { PlanState, PlanStore } from "../../src/state/planStore";

/** Scenario with the 05 MissionScenario field names; values are the 05 defaults used by the fixtures. */
export const SCENARIO: MissionScenario = {
  eva_start_utc: "2026-11-14T08:00:00Z",
  max_eva_duration_h: 6,
  dwell_min_per_stop: 20,
  hard_slope_limit_deg: 15,
  caution_slope_deg: 10,
  walkback_limit_km: 5,
  suited_flat_speed_kmh: 3.3,
  solar_phase: "max",
  loop: false,
  max_haven_min: 30,
  crew_count: 2,
  vehicle_available: true,
  vehicle_param_set: "pr1-assumed",
};

export const WAYPOINTS: Waypoint[] = [
  { id: "wp-0", role: "start", x_m: 0, y_m: 0, label: "Hab" },
  { id: "wp-1", role: "stop", x_m: 100, y_m: 100, label: "Stop 1" },
];

export function stateOf(overrides: Partial<PlanState> = {}): PlanState {
  return {
    scenario: SCENARIO,
    waypoints: WAYPOINTS,
    stop_tasks: [],
    plan_revision: 1,
    status: "OK",
    result: null,
    last_error_code: null,
    can_undo: false,
    selected_waypoint_id: null,
    hover: null,
    ...overrides,
  };
}

export interface FakePlanStore {
  store: PlanStore;
  emit(next: Partial<PlanState>): void;
  retry: ReturnType<typeof vi.fn>;
  listenerCount(): number;
}

export function fakePlanStore(initial: Partial<PlanState> = {}): FakePlanStore {
  let state = stateOf(initial);
  const listeners = new Set<(s: PlanState) => void>();
  const retry = vi.fn();
  const noop = (): void => {};
  const store: PlanStore = {
    get: () => state,
    setScenario: noop,
    setWaypoints: noop,
    addWaypoint: noop,
    moveWaypoint: noop,
    deleteWaypoint: noop,
    reorderWaypoints: noop,
    addStopTask: noop,
    updateStopTask: noop,
    deleteStopTask: noop,
    undo: noop,
    resetDefaults: noop,
    loadPlan: noop,
    selectWaypoint: noop,
    setHover: noop,
    retry,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    store,
    emit(next) {
      state = { ...state, ...next };
      for (const l of [...listeners]) l(state);
    },
    retry,
    listenerCount: () => listeners.size,
  };
}

/** A PlanResult around the given legs; every other field is the empty or absent value 05 allows. */
export function resultOf(parts: Partial<PlanResult> & Pick<PlanResult, "legs">): PlanResult {
  return {
    status: "OK",
    totals: null,
    stops_timeline: [],
    warnings: [],
    computed_utc: "2026-11-14T08:00:00Z",
    timing_ms: {},
    ...parts,
  };
}
