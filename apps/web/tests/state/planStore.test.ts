/**
 * T08.02 — plan store: revisions, 300 ms debounce, stale results, single-level undo, stop-task limits, the 03 §E.4 state
 * machine and retry (docs/specs/03 §C.3, §E.3, §E.4, SCR-04; 02 §E.2, §E.3; 01 FR-05, FR-06, FR-54).
 *
 * The worker is a fake client: it records every COMPUTE_PLAN and lets a test answer or reject each one by revision, so
 * ordering ("an older result arrives after a newer edit") is under the test's control. Timers are fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionScenario, PlanResultMessage, StopTaskSeed, Waypoint } from "@marswalk/protocol";
import type { ComputePlanRequest } from "@marswalk/protocol";
import {
  DEFAULT_SCENARIO,
  MAX_TASKS_PER_STOP,
  SCENARIO_DEBOUNCE_MS,
  createPlanStore,
  type PlanState,
  type PlanStore,
} from "../../src/state/planStore";
import okFixture from "../fixtures/plan-results/ok.json";
import partialFixture from "../fixtures/plan-results/partial.json";
import overLimitsFixture from "../fixtures/plan-results/over-limits.json";

type Request = Omit<ComputePlanRequest, "type">;

interface Call {
  req: Request;
  resolve(message: PlanResultMessage): void;
  reject(error: unknown): void;
}

function fakeClient(options: { crashed?: boolean } = {}) {
  const calls: Call[] = [];
  const retry = vi.fn();
  let crashed = options.crashed ?? false;
  const client = {
    computePlan(req: Request): Promise<PlanResultMessage> {
      return new Promise((resolve, reject) => calls.push({ req, resolve, reject }));
    },
    retry,
    isCrashed: () => crashed,
  };
  return {
    client,
    calls,
    retry,
    setCrashed(value: boolean) {
      crashed = value;
    },
    /** The recorded call that carried `plan_revision`. */
    call(revision: number): Call {
      const found = calls.find((c) => c.req.plan_revision === revision);
      if (!found) throw new Error(`no COMPUTE_PLAN for revision ${revision}; sent: ${calls.map((c) => c.req.plan_revision).join(",")}`);
      return found;
    },
  };
}

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

const reply = (fixture: unknown, revision: number): PlanResultMessage => ({ ...(fixture as PlanResultMessage), plan_revision: revision });

const START: Waypoint = { id: "wp-0", role: "start", x_m: 0, y_m: 0, label: "Hab" };
const STOP_1: Waypoint = { id: "wp-1", role: "stop", x_m: 100, y_m: 100 };
const STOP_2: Waypoint = { id: "wp-2", role: "stop", x_m: 200, y_m: 50 };
const SCENARIO: MissionScenario = { ...DEFAULT_SCENARIO, eva_start_utc: "2026-11-14T08:00:00Z" };
const SITE = { siteId: "mock_site", dataVersion: "mock_site-2026.11.05" };

function task(id: string, stop: string, text = "Photograph the ridge"): StopTaskSeed {
  return { task_id: id, stop_id: stop, crew_id: null, kind: "observe", text };
}

function setup(initial: Partial<PlanState> = {}, options: { crashed?: boolean } = {}) {
  const fake = fakeClient(options);
  const store = createPlanStore({ scenario: SCENARIO, waypoints: [START], ...initial }, { workerClient: fake.client, ...SITE });
  const states: PlanState[] = [];
  store.subscribe((s) => states.push(s));
  return { ...fake, store, states };
}

/** A store with the start and one stop whose revision-1 computation is still in flight. */
const withOneStop = (extra: Partial<PlanState> = {}) => {
  const s = setup(extra);
  s.store.addWaypoint(STOP_1);
  return s;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createPlanStore start state", () => {
  it("starts Empty at revision 0 with the scenario it was given and nothing selected", () => {
    const { store, calls } = setup();
    const s = store.get();
    expect(s.status).toBe("Empty");
    expect(s.plan_revision).toBe(0);
    expect(s.scenario).toEqual(SCENARIO);
    expect(s.waypoints).toEqual([START]);
    expect(s).toMatchObject({ result: null, last_error_code: null, can_undo: false, selected_waypoint_id: null, hover: null, stop_tasks: [] });
    expect(calls).toHaveLength(0);
  });

  it("has defaults only from 01 FR-05 and 02 §E.3, and no invented start time (FD-042)", () => {
    expect(DEFAULT_SCENARIO).toMatchObject({
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
    });
    expect(DEFAULT_SCENARIO.eva_start_utc).toBe("");
  });

  it("returns the same snapshot object until something changes (a stable external store)", () => {
    const { store } = setup();
    expect(store.get()).toBe(store.get());
    store.selectWaypoint("wp-0");
    expect(store.get()).toBe(store.get());
  });
});

describe("revisions bump on route edits only (03 §E.3)", () => {
  it("adding a stop raises plan_revision by one and sends one COMPUTE_PLAN that carries it, site and data version", () => {
    const { store, calls } = setup();
    store.addWaypoint(STOP_1);
    expect(store.get().plan_revision).toBe(1);
    expect(store.get().status).toBe("Computing");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.req).toMatchObject({
      plan_revision: 1,
      site_id: "mock_site",
      data_version: "mock_site-2026.11.05",
      scenario: SCENARIO,
      waypoints: [START, STOP_1],
    });
  });

  it("move, reorder, delete and undo each raise it once and recompute at once", () => {
    const { store, calls } = setup({ waypoints: [START, STOP_1, STOP_2] });
    store.moveWaypoint("wp-1", 150, 160);
    expect(store.get().plan_revision).toBe(1);
    store.reorderWaypoints(["wp-2", "wp-1"]);
    expect(store.get().plan_revision).toBe(2);
    store.deleteWaypoint("wp-2");
    expect(store.get().plan_revision).toBe(3);
    store.undo();
    expect(store.get().plan_revision).toBe(4);
    expect(calls.map((c) => c.req.plan_revision)).toEqual([1, 2, 3, 4]);
  });

  it("selection, hover and every stop-task edit change no revision and send nothing", () => {
    const { store, calls, states } = withOneStop();
    const rev = store.get().plan_revision;
    const sent = calls.length;
    store.selectWaypoint("wp-1");
    store.setHover({ waypoint_id: "wp-1" });
    store.addStopTask(task("t-1", "wp-1"));
    store.updateStopTask("t-1", { text: "Sample the ridge" });
    store.deleteStopTask("t-1");
    expect(store.get().plan_revision).toBe(rev);
    expect(calls).toHaveLength(sent);
    expect(states.length).toBeGreaterThan(1); // they did notify
  });

  it("tasks never bump the revision: an in-flight result is still applied after a task edit", async () => {
    const { store, call } = withOneStop();
    store.addStopTask(task("t-1", "wp-1"));
    call(1).resolve(reply(okFixture, 1));
    await flush();
    expect(store.get().status).toBe("OK");
  });

  it("a refused edit changes nothing: no revision, no request, no notification", () => {
    const { store, calls, states } = setup();
    store.moveWaypoint("wp-9", 1, 1);
    store.deleteWaypoint("wp-9");
    store.deleteWaypoint("wp-0"); // the start cannot be deleted
    store.moveWaypoint("wp-0", Number.NaN, 1);
    expect(store.get().plan_revision).toBe(0);
    expect(calls).toHaveLength(0);
    expect(states).toHaveLength(0);
  });
});

describe("scenario edits debounce 300 ms (03 SCR-04)", () => {
  it("two edits inside the window send exactly one COMPUTE_PLAN, carrying both and the latest revision", async () => {
    const { store, calls } = withOneStop();
    await flush();
    store.setScenario({ max_eva_duration_h: 5 });
    await vi.advanceTimersByTimeAsync(200);
    store.setScenario({ dwell_min_per_stop: 30 });
    await vi.advanceTimersByTimeAsync(SCENARIO_DEBOUNCE_MS - 1);
    expect(calls).toHaveLength(1); // only the stop's request so far
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.req.plan_revision).toBe(store.get().plan_revision);
    expect(calls[1]!.req.scenario).toMatchObject({ max_eva_duration_h: 5, dwell_min_per_stop: 30 });
  });

  it("is 300 ms", () => {
    expect(SCENARIO_DEBOUNCE_MS).toBe(300);
  });

  it("marks the plan Computing at once, so the result of the previous inputs is not shown as current", async () => {
    const { store, call } = withOneStop();
    call(1).resolve(reply(okFixture, 1));
    await flush();
    expect(store.get().status).toBe("OK");
    store.setScenario({ walkback_limit_km: 4 });
    expect(store.get().status).toBe("Computing");
    expect(store.get().scenario.walkback_limit_km).toBe(4);
  });

  it("an immediate edit inside the window sends at once and cancels the pending debounced send", async () => {
    const { store, calls } = withOneStop();
    store.setScenario({ dwell_min_per_stop: 30 });
    store.addWaypoint(STOP_2);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(SCENARIO_DEBOUNCE_MS * 2);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.req.scenario.dwell_min_per_stop).toBe(30);
  });

  it("sends nothing for a scenario edit while there is no stop; the status stays Empty", async () => {
    const { store, calls } = setup();
    store.setScenario({ dwell_min_per_stop: 30 });
    await vi.advanceTimersByTimeAsync(SCENARIO_DEBOUNCE_MS * 2);
    expect(calls).toHaveLength(0);
    expect(store.get().status).toBe("Empty");
    expect(store.get().scenario.dwell_min_per_stop).toBe(30);
  });

  it("reset defaults restores the scenario the store was created with and recomputes at once", () => {
    const { store, calls } = withOneStop();
    store.setScenario({ dwell_min_per_stop: 90, loop: false });
    store.resetDefaults();
    expect(store.get().scenario).toEqual(SCENARIO);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.req.scenario).toEqual(SCENARIO);
  });
});

describe("stale results are dropped by revision (02 §E.2, 03 §C.3)", () => {
  it("a result for an older revision, arriving after a newer edit, leaves the state unchanged", async () => {
    const { store, call } = withOneStop();
    store.addWaypoint(STOP_2); // revision 2 supersedes revision 1
    const before = store.get();
    call(1).resolve(reply(okFixture, 1));
    await flush();
    expect(store.get()).toBe(before);
    expect(store.get()).toMatchObject({ status: "Computing", result: null });
    call(2).resolve(reply(okFixture, 2));
    await flush();
    expect(store.get().status).toBe("OK");
  });

  it("a SUPERSEDED or CANCELLED rejection is not an error", async () => {
    const { store, call } = withOneStop();
    store.addWaypoint(STOP_2);
    call(1).reject({ name: "WorkerClientError", code: "SUPERSEDED", message: "superseded" });
    await flush();
    expect(store.get().status).toBe("Computing");
    call(2).reject({ name: "WorkerClientError", code: "CANCELLED", message: "cancelled" });
    await flush();
    expect(store.get().status).toBe("Computing"); // the newest is not marked failed by a cancel
    expect(store.get().last_error_code).toBeNull();
  });

  it("an error for an older revision does not fail the newest", async () => {
    const { store, call } = withOneStop();
    store.addWaypoint(STOP_2);
    call(1).reject({ name: "WorkerClientError", code: "TIMEOUT", message: "late" });
    await flush();
    expect(store.get()).toMatchObject({ status: "Computing", last_error_code: null });
  });

  it("a result whose own plan_revision differs from the request's is dropped", async () => {
    const { store, call } = withOneStop();
    call(1).resolve(reply(okFixture, 7));
    await flush();
    expect(store.get().status).toBe("Computing");
  });
});

describe("single-level undo (01 FR-06, 03 §C.3)", () => {
  it("restores the previous waypoint list and the stops' tasks, and recomputes", () => {
    const { store, calls } = setup({ waypoints: [START, STOP_1, STOP_2], stop_tasks: [task("t-1", "wp-1"), task("t-2", "wp-2")] });
    expect(store.get().can_undo).toBe(false);
    store.deleteWaypoint("wp-2");
    expect(store.get().stop_tasks.map((t) => t.task_id)).toEqual(["t-1"]); // deleting a stop deletes its tasks
    expect(store.get().can_undo).toBe(true);
    store.undo();
    expect(store.get().waypoints.map((w) => w.id)).toEqual(["wp-0", "wp-1", "wp-2"]);
    expect(store.get().stop_tasks.map((t) => t.task_id)).toEqual(["t-1", "t-2"]);
    expect(calls.at(-1)!.req.waypoints.map((w) => w.id)).toEqual(["wp-0", "wp-1", "wp-2"]);
  });

  it("is one level: a second undo does nothing and sends nothing", () => {
    const { store, calls } = setup({ waypoints: [START, STOP_1, STOP_2] });
    store.deleteWaypoint("wp-2");
    store.deleteWaypoint("wp-1");
    store.undo();
    expect(store.get().waypoints.map((w) => w.id)).toEqual(["wp-0", "wp-1"]); // only the last edit is undone
    expect(store.get().can_undo).toBe(false);
    const sent = calls.length;
    const rev = store.get().plan_revision;
    store.undo();
    expect(calls).toHaveLength(sent);
    expect(store.get().plan_revision).toBe(rev);
  });

  it("covers move, reorder and add; a scenario edit is not an undo point", () => {
    const { store } = setup({ waypoints: [START, STOP_1, STOP_2] });
    store.moveWaypoint("wp-1", 5, 5);
    store.undo();
    expect(store.get().waypoints.find((w) => w.id === "wp-1")).toMatchObject({ x_m: 100, y_m: 100 });
    store.reorderWaypoints(["wp-2", "wp-1"]);
    store.undo();
    expect(store.get().waypoints.map((w) => w.id)).toEqual(["wp-0", "wp-1", "wp-2"]);
    store.setScenario({ loop: false });
    expect(store.get().can_undo).toBe(false);
  });

  it("clears the selection when the restored list no longer has the selected stop", () => {
    const { store } = setup({ waypoints: [START, STOP_1] });
    store.addWaypoint(STOP_2);
    store.selectWaypoint("wp-2");
    store.undo();
    expect(store.get().selected_waypoint_id).toBeNull();
  });
});

describe("stop tasks: 1-4 per stop, at most 60 characters (FR-54, 05 StopTask)", () => {
  it("allows at most four tasks on a stop and refuses the fifth", () => {
    const { store } = setup({ waypoints: [START, STOP_1] });
    for (let i = 1; i <= MAX_TASKS_PER_STOP; i++) store.addStopTask(task(`t-${i}`, "wp-1"));
    store.addStopTask(task("t-5", "wp-1"));
    expect(store.get().stop_tasks.map((t) => t.task_id)).toEqual(["t-1", "t-2", "t-3", "t-4"]);
  });

  it("refuses text over 60 characters or empty, on add and on edit; 60 is allowed", () => {
    const { store } = setup({ waypoints: [START, STOP_1] });
    store.addStopTask(task("t-1", "wp-1", "x".repeat(61)));
    store.addStopTask(task("t-2", "wp-1", "   "));
    expect(store.get().stop_tasks).toHaveLength(0);
    store.addStopTask(task("t-3", "wp-1", "x".repeat(60)));
    expect(store.get().stop_tasks).toHaveLength(1);
    store.updateStopTask("t-3", { text: "y".repeat(61) });
    store.updateStopTask("t-3", { text: "" });
    expect(store.get().stop_tasks[0]!.text).toBe("x".repeat(60));
    store.updateStopTask("t-3", { text: "Collect a sample", kind: "sample" });
    expect(store.get().stop_tasks[0]).toMatchObject({ text: "Collect a sample", kind: "sample", task_id: "t-3", stop_id: "wp-1" });
  });

  it("refuses a task for a stop that does not exist, for the start, and a repeated task id", () => {
    const { store } = setup({ waypoints: [START, STOP_1] });
    store.addStopTask(task("t-1", "wp-9"));
    store.addStopTask(task("t-2", "wp-0"));
    store.addStopTask(task("t-3", "wp-1"));
    store.addStopTask(task("t-3", "wp-1"));
    expect(store.get().stop_tasks.map((t) => t.task_id)).toEqual(["t-3"]);
  });

  it("delete removes one task; deleting an unknown task is a no-op", () => {
    const { store, states } = setup({ waypoints: [START, STOP_1], stop_tasks: [task("t-1", "wp-1")] });
    store.deleteStopTask("t-9");
    expect(states).toHaveLength(0);
    store.deleteStopTask("t-1");
    expect(store.get().stop_tasks).toEqual([]);
  });

  it("loadPlan carries tasks for the stops it loads and drops a task whose stop is not in the plan", () => {
    const { store } = setup();
    store.loadPlan(SCENARIO, [START, STOP_1], [task("t-1", "wp-1"), task("t-2", "wp-9")]);
    expect(store.get().stop_tasks.map((t) => t.task_id)).toEqual(["t-1"]);
  });
});

describe("waypoint rules (05 Waypoint, 01 FR-06)", () => {
  it("refuses an 11th stop and a second start", () => {
    const { store, calls } = setup();
    for (let i = 1; i <= 10; i++) store.addWaypoint({ id: `wp-${i}`, role: "stop", x_m: i, y_m: i });
    expect(store.get().waypoints).toHaveLength(11);
    const rev = store.get().plan_revision;
    const sent = calls.length;
    store.addWaypoint({ id: "wp-11", role: "stop", x_m: 11, y_m: 11 });
    store.addWaypoint({ id: "wp-12", role: "start", x_m: 1, y_m: 1 });
    expect(store.get().waypoints).toHaveLength(11);
    expect(store.get().plan_revision).toBe(rev);
    expect(calls).toHaveLength(sent);
  });

  it("gives a new stop the next wp-<n> id when the caller's id is missing or already used", () => {
    const { store } = setup({ waypoints: [START, STOP_1] });
    store.addWaypoint({ id: "wp-1", role: "stop", x_m: 1, y_m: 1 });
    store.addWaypoint({ id: "", role: "stop", x_m: 2, y_m: 2 });
    expect(store.get().waypoints.map((w) => w.id)).toEqual(["wp-0", "wp-1", "wp-2", "wp-3"]);
  });

  it("keeps the start first and reorders only a permutation of the stops", () => {
    const { store } = setup({ waypoints: [START, STOP_1, STOP_2] });
    store.reorderWaypoints(["wp-2", "wp-1"]);
    expect(store.get().waypoints.map((w) => w.id)).toEqual(["wp-0", "wp-2", "wp-1"]);
    const rev = store.get().plan_revision;
    store.reorderWaypoints(["wp-2"]); // not a permutation
    store.reorderWaypoints(["wp-2", "wp-9"]);
    store.reorderWaypoints(["wp-2", "wp-1"]); // unchanged order
    expect(store.get().plan_revision).toBe(rev);
  });

  it("a moved stop is no longer shown as snapped from its old position", () => {
    const { store } = setup({ waypoints: [START, { ...STOP_1, snapped_from: { x_m: 1, y_m: 1 } }] });
    store.moveWaypoint("wp-1", 120, 130);
    expect(store.get().waypoints[1]).toEqual({ id: "wp-1", role: "stop", x_m: 120, y_m: 130 });
  });

  it("deleting the selected stop clears the selection and the hover on it", () => {
    const { store } = setup({ waypoints: [START, STOP_1] });
    store.selectWaypoint("wp-1");
    store.setHover({ waypoint_id: "wp-1", distance_m: 12 });
    store.deleteWaypoint("wp-1");
    expect(store.get()).toMatchObject({ selected_waypoint_id: null, hover: null });
  });

  it("selects only a waypoint that exists", () => {
    const { store } = setup({ waypoints: [START, STOP_1] });
    store.selectWaypoint("wp-1");
    expect(store.get().selected_waypoint_id).toBe("wp-1");
    store.selectWaypoint("wp-9");
    expect(store.get().selected_waypoint_id).toBeNull();
  });

  it("sends no request with fewer than two waypoints, or without a start time; the status stays Empty (02 §E.3, FD-042)", () => {
    const noStart = setup({ scenario: { ...SCENARIO, eva_start_utc: "" } });
    noStart.store.addWaypoint(STOP_1);
    expect(noStart.calls).toHaveLength(0);
    expect(noStart.store.get().status).toBe("Empty");
    noStart.store.setScenario({ eva_start_utc: "2026-11-14T08:00:00Z" });
    // The scenario edit is debounced; the stop that was added earlier is now computable.
    vi.advanceTimersByTime(SCENARIO_DEBOUNCE_MS);
    expect(noStart.calls).toHaveLength(1);
    expect(noStart.store.get().status).toBe("Computing");

    const onlyStart = setup();
    onlyStart.store.setWaypoints([START]);
    expect(onlyStart.calls).toHaveLength(0);
  });

  it("setWaypoints refuses a list without exactly one start or with more than ten stops", () => {
    const { store } = setup();
    store.setWaypoints([STOP_1, STOP_2]);
    store.setWaypoints([START, { ...START, id: "wp-5" }]);
    store.setWaypoints([START, ...Array.from({ length: 11 }, (_, i) => ({ id: `wp-${i + 1}`, role: "stop" as const, x_m: i, y_m: i }))]);
    expect(store.get().waypoints).toEqual([START]);
    store.setWaypoints([START, STOP_1]);
    expect(store.get().waypoints).toEqual([START, STOP_1]);
  });
});

describe("plan state machine (03 §E.4)", () => {
  it("Empty -> Computing on the first stop -> OK, OverLimits or Partial by the result", async () => {
    const cases: [unknown, PlanState["status"]][] = [
      [okFixture, "OK"],
      [overLimitsFixture, "OverLimits"],
      [partialFixture, "Partial"],
    ];
    for (const [fixture, expected] of cases) {
      const { store, call } = setup();
      expect(store.get().status).toBe("Empty");
      store.addWaypoint(STOP_1);
      expect(store.get().status).toBe("Computing");
      call(1).resolve(reply(fixture, 1));
      await flush();
      expect(store.get().status).toBe(expected);
      expect(store.get().result?.status).toBe((fixture as PlanResultMessage).status);
      expect(store.get().result).not.toHaveProperty("request_id"); // the message envelope is not part of the result
    }
  });

  it("OK -> Computing on an edit (the earlier result stays visible until the new one lands)", async () => {
    const { store, call } = withOneStop();
    call(1).resolve(reply(okFixture, 1));
    await flush();
    store.addWaypoint(STOP_2);
    expect(store.get().status).toBe("Computing");
    expect(store.get().result).not.toBeNull();
  });

  it("Computing -> Computing on a newer revision", () => {
    const { store } = withOneStop();
    store.addWaypoint(STOP_2);
    expect(store.get()).toMatchObject({ status: "Computing", plan_revision: 2 });
  });

  it("any state -> Empty when all stops are removed, with the result cleared and nothing sent", async () => {
    const { store, calls, call } = withOneStop();
    call(1).resolve(reply(partialFixture, 1));
    await flush();
    store.deleteWaypoint("wp-1");
    expect(store.get()).toMatchObject({ status: "Empty", result: null });
    expect(calls).toHaveLength(1);
  });

  it("a result that was in flight when the last stop was removed is dropped", async () => {
    const { store, call } = withOneStop();
    store.deleteWaypoint("wp-1");
    call(1).resolve(reply(okFixture, 1));
    await flush();
    expect(store.get()).toMatchObject({ status: "Empty", result: null });
  });

  it("Computing -> Error on TIMEOUT or INTERNAL, keeping the code", async () => {
    for (const code of ["TIMEOUT", "INTERNAL"] as const) {
      const { store, call } = withOneStop();
      call(1).reject({ name: "WorkerClientError", code, message: code });
      await flush();
      expect(store.get()).toMatchObject({ status: "Error", last_error_code: code });
    }
  });

  it("a worker crash is reported as INTERNAL; an unrecognised failure too", async () => {
    const crash = withOneStop();
    crash.call(1).reject({ name: "WorkerClientError", code: "CRASH", message: "worker crashed" });
    await flush();
    expect(crash.store.get()).toMatchObject({ status: "Error", last_error_code: "INTERNAL" });

    const odd = withOneStop();
    odd.call(1).reject(new Error("boom"));
    await flush();
    expect(odd.store.get()).toMatchObject({ status: "Error", last_error_code: "INTERNAL" });
  });

  it("a result with status ERROR is the Error state", async () => {
    const { store, call } = withOneStop();
    call(1).resolve({ ...reply(okFixture, 1), status: "ERROR" } as PlanResultMessage);
    await flush();
    expect(store.get()).toMatchObject({ status: "Error", last_error_code: "INTERNAL" });
  });

  it("after terminate() a rejected request leaves the state alone", async () => {
    const { store, call } = withOneStop();
    call(1).reject({ name: "WorkerClientError", code: "TERMINATED", message: "terminated" });
    await flush();
    expect(store.get().status).toBe("Computing");
  });
});

describe("retry after Error (03 §E.4)", () => {
  async function failed(options: { crashed?: boolean } = {}) {
    const s = setup({}, options);
    s.store.addWaypoint(STOP_1);
    s.call(1).reject({ name: "WorkerClientError", code: "TIMEOUT", message: "timed out" });
    await flush();
    expect(s.store.get().status).toBe("Error");
    return s;
  }

  it("Error -> Computing: a new revision, one new COMPUTE_PLAN, the error cleared", async () => {
    const { store, calls, retry } = await failed();
    store.retry();
    expect(store.get()).toMatchObject({ status: "Computing", plan_revision: 2, last_error_code: null });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.req.plan_revision).toBe(2);
    expect(retry).not.toHaveBeenCalled(); // the worker did not crash: no restart
  });

  it("restarts a crashed worker first", async () => {
    const { store, retry } = await failed({ crashed: true });
    store.retry();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(store.get().status).toBe("Computing");
  });

  it("the retried request can succeed, and the failed one's late rejection does not undo it", async () => {
    const { store, call } = await failed();
    store.retry();
    call(2).resolve(reply(okFixture, 2));
    await flush();
    expect(store.get().status).toBe("OK");
  });

  it("is a no-op unless the status is Error", async () => {
    const { store, calls } = withOneStop();
    store.retry();
    expect(calls).toHaveLength(1);
    expect(store.get().plan_revision).toBe(1);
  });
});

describe("loadPlan, subscribe, request ids", () => {
  it("loadPlan replaces scenario, waypoints and tasks, clears undo and selection, and computes the plan at once", () => {
    const { store, calls } = setup({ waypoints: [START, STOP_1] });
    store.deleteWaypoint("wp-1");
    store.selectWaypoint("wp-0");
    const loaded: MissionScenario = { ...SCENARIO, max_eva_duration_h: 4 };
    store.loadPlan(loaded, [START, STOP_1, STOP_2], [task("t-1", "wp-2")]);
    expect(store.get()).toMatchObject({ scenario: loaded, can_undo: false, selected_waypoint_id: null, status: "Computing" });
    expect(store.get().stop_tasks).toHaveLength(1);
    expect(calls.at(-1)!.req.scenario).toEqual(loaded);
    expect(calls.at(-1)!.req.waypoints).toHaveLength(3);
  });

  it("loadPlan refuses a plan without exactly one start or with more than ten stops", () => {
    const { store } = setup();
    store.loadPlan(SCENARIO, [STOP_1], []);
    expect(store.get().waypoints).toEqual([START]);
  });

  it("subscribers hear each change and stop hearing after unsubscribe", () => {
    const { store } = setup();
    const heard: number[] = [];
    const off = store.subscribe((s) => heard.push(s.plan_revision));
    store.addWaypoint(STOP_1);
    store.addWaypoint(STOP_2);
    off();
    store.moveWaypoint("wp-1", 1, 1);
    expect(heard).toEqual([1, 2]);
  });

  it("gives every request its own request_id", () => {
    const { store, calls } = setup();
    store.addWaypoint(STOP_1);
    store.addWaypoint(STOP_2);
    store.moveWaypoint("wp-1", 1, 1);
    const ids = calls.map((c) => c.req.request_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a listener that throws is reported through onListenerError and does not stop the others or break the store", () => {
    const fake = fakeClient();
    const reported: unknown[] = [];
    const store = createPlanStore({ scenario: SCENARIO, waypoints: [START] }, { workerClient: fake.client, ...SITE, onListenerError: (e) => void reported.push(e) });
    const heard = vi.fn();
    store.subscribe(() => {
      throw new Error("listener failed");
    });
    store.subscribe(heard);
    store.addWaypoint(STOP_1);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(reported).toHaveLength(1);
    expect(store.get().plan_revision).toBe(1);
  });
});

// Type-level: the factory returns the C11 interface unchanged.
it("unchanged hover preserves the snapshot and does not notify subscribers", () => {
  const { store, states } = setup();
  const empty = store.get();
  store.setHover(null);
  expect(store.get()).toBe(empty);
  const hover = { coord: [3, 4] as [number, number], distance_m: 5, waypoint_id: "wp-1", leg_index: 0 };
  store.setHover(hover);
  const set = store.get();
  store.setHover({ ...hover, coord: [3, 4] });
  expect(store.get()).toBe(set);
  expect(states).toHaveLength(1);
  store.setHover({ ...hover, leg_index: 1 });
  store.setHover(null);
  const cleared = store.get();
  store.setHover(null);
  expect(store.get()).toBe(cleared);
  expect(states).toHaveLength(3);
});

const _typeCheck: (s: PlanStore) => PlanState = (s) => s.get();
void _typeCheck;

/**
 * The manual leg in the plan (N-160(c), FD-441): a validated leg travels with the COMPUTE_PLAN as a polyline, so the
 * worker measures it and the plan's totals come from it. The page sends a polyline, never a number.
 */
describe("a manual leg joins the plan (N-160(c))", () => {
  const leg = { from: "wp-0", to: "wp-1", vertices: [[0, 0] as [number, number], [100, 100] as [number, number]] };

  it("the COMPUTE_PLAN carries the polyline of the manual leg", () => {
    const { store, calls } = setup();
    store.addWaypoint(STOP_1);
    store.setManualLeg(leg);
    const last = calls[calls.length - 1]!;
    expect(last.req.manual_legs).toEqual([leg]);
    expect(last.req.plan_revision).toBe(store.get().plan_revision);
  });

  it("a plan without a manual leg carries none: the field is absent, not empty", () => {
    const { store, calls } = setup();
    store.addWaypoint(STOP_1);
    expect(calls[calls.length - 1]!.req.manual_legs).toBeUndefined();
  });

  it("a second drawing of the same pair replaces the first", () => {
    const { store } = setup();
    store.addWaypoint(STOP_1);
    store.setManualLeg(leg);
    store.setManualLeg({ ...leg, vertices: [[0, 0] as [number, number], [120, 90] as [number, number]] });
    expect(store.get().manual_legs).toHaveLength(1);
    expect(store.get().manual_legs[0]!.vertices).toEqual([[0, 0], [120, 90]]);
  });

  it("clearManualLegs drops them and the next plan carries none", () => {
    const { store, calls } = setup();
    store.addWaypoint(STOP_1);
    store.setManualLeg(leg);
    store.clearManualLegs();
    expect(store.get().manual_legs).toEqual([]);
    expect(calls[calls.length - 1]!.req.manual_legs).toBeUndefined();
  });

  it("a waypoint edit that removes the pair drops the manual leg with it", () => {
    const { store } = setup();
    store.addWaypoint(STOP_1);
    store.setManualLeg(leg);
    store.deleteWaypoint("wp-1");
    expect(store.get().manual_legs).toEqual([]);
  });

  it("moving a waypoint drops the manual leg: the drawn polyline no longer joins the two", () => {
    // The polyline was drawn from the start to where the stop used to be. The stop moved, so the plan's leg would end
    // at the old position while the marker is somewhere else: the leg no longer describes the plan and must go.
    const { store, calls } = setup();
    store.addWaypoint(STOP_1);
    store.setManualLeg(leg);
    store.moveWaypoint("wp-1", 500, 500);
    expect(store.get().manual_legs).toEqual([]);
    expect(calls[calls.length - 1]!.req.manual_legs, "the next plan is routed, not measured").toBeUndefined();
  });

  it("moving a waypoint the manual leg does not touch keeps the leg", () => {
    const { store } = setup();
    store.addWaypoint(STOP_1);
    store.addWaypoint({ id: "wp-2", role: "stop", x_m: 200, y_m: 200 });
    store.setManualLeg(leg);
    store.moveWaypoint("wp-2", 250, 250);
    expect(store.get().manual_legs).toEqual([leg]);
  });

  it("loadPlan drops the manual legs: the loaded plan has none of its own", () => {
    const { store } = setup();
    store.addWaypoint(STOP_1);
    store.setManualLeg(leg);
    store.loadPlan(SCENARIO, [START, STOP_1]);
    expect(store.get().manual_legs).toEqual([]);
  });
});
