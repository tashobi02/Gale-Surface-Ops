/**
 * T08.01 — C11 plan-store contract: stop tasks beside the plan (FR-54, FR-50; 03 SCR-04; 05 Scenario `stop_tasks`).
 * The store is T08.03 (tested in planStore.test.ts); these tests pin the shapes consumers (T08.04, T08.05, T11.02, T21.12) code against.
 */
import { describe, expect, it, vi } from "vitest";
import type { MissionScenario, StopTaskSeed, Waypoint } from "@marswalk/protocol";
import { createPlanStore, type PlanState, type PlanStore, type StopTaskPatch } from "../../src/state/planStore";

const seed: StopTaskSeed = { task_id: "t-wp-2-01", stop_id: "wp-2", crew_id: null, kind: "observe", text: "Photograph the boxwork ridge" };

function recordingStore() {
  const calls: string[] = [];
  const state = {
    scenario: {} as MissionScenario,
    waypoints: [] as Waypoint[],
    stop_tasks: [seed],
    plan_revision: 0,
    status: "Empty",
    result: null,
    last_error_code: null,
    can_undo: false,
    selected_waypoint_id: null,
    hover: null,
    manual_legs: [],
  } satisfies PlanState;
  const store: PlanStore = {
    get: () => state,
    setScenario: () => {},
    setWaypoints: () => {},
    addWaypoint: () => {},
    moveWaypoint: () => {},
    deleteWaypoint: () => {},
    reorderWaypoints: () => {},
    addStopTask: (task) => void calls.push(`add ${task.task_id}`),
    updateStopTask: (id, patch) => void calls.push(`update ${id} ${Object.keys(patch).sort().join(",")}`),
    deleteStopTask: (id) => void calls.push(`delete ${id}`),
    undo: () => {},
    resetDefaults: () => {},
    loadPlan: (_scenario, _waypoints, tasks) => void calls.push(`load ${tasks?.length ?? "none"}`),
    selectWaypoint: () => {},
    setHover: () => {},
    retry: () => {},
    setManualLeg: () => {},
    clearManualLegs: () => {},
    subscribe: () => () => {},
  };
  return { store, calls };
}

describe("C11 stop tasks (FR-54, FR-50)", () => {
  it("PlanState carries the planner's authored stop tasks as StopTaskSeed[], beside the plan", () => {
    const { store } = recordingStore();
    const tasks: StopTaskSeed[] = store.get().stop_tasks;
    expect(tasks).toEqual([seed]);
  });

  it("offers add, edit (crew, kind, text only) and delete for a stop's tasks, and loadPlan can carry them", () => {
    const { store, calls } = recordingStore();
    const patch: StopTaskPatch = { text: "Photograph the ridge", kind: "image" };
    store.addStopTask(seed);
    store.updateStopTask(seed.task_id, patch);
    store.deleteStopTask(seed.task_id);
    store.loadPlan({} as MissionScenario, [], [seed]);
    expect(calls).toEqual(["add t-wp-2-01", "update t-wp-2-01 kind,text", "delete t-wp-2-01", "load 1"]);
  });

  it("forbids editing task_id or stop_id through a patch (compile-time)", () => {
    // @ts-expect-error task_id is not editable
    const noId: StopTaskPatch = { task_id: "x" };
    // @ts-expect-error stop_id is not editable: a task moves with its stop only by being re-created
    const noStop: StopTaskPatch = { stop_id: "wp-3" };
    expect([noId, noStop]).toHaveLength(2);
  });

  it("createPlanStore returns the same C11 interface the contract tests describe", () => {
    const store: PlanStore = createPlanStore(
      { scenario: {} as MissionScenario },
      { workerClient: { computePlan: vi.fn(), retry: vi.fn(), isCrashed: () => false }, siteId: "mock_site", dataVersion: "v" },
    );
    expect(Object.keys(store).sort()).toEqual(Object.keys(recordingStore().store).sort());
    expect(store.get().stop_tasks).toEqual([]);
});
});
