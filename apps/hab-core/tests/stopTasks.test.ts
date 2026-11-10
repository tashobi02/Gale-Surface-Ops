import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Command,
  CommandResult,
  LogEvent,
  LogEventData,
  Role,
  StopTask,
} from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { AcceptedCommands, handleCommand, type CommandContext } from "../src/commands";
import { initialState, reduce, type EngineState } from "../src/engine/reducer";
import { onPlanRevised, seedTasks, tasksTick } from "../src/engine/tasks";
import { buildReport } from "../src/report";
import { readScenario } from "../src/scenario";

// Stop task list (FR-50): commands, events and engine behaviour. TASK-31 (T31.03).

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), {
  site_id: "mock_site",
  data_version: "mock_site-fixture",
  dir: null,
});
const T0 = fake.scenario.start_utc;

let n = 0;
function cmd(
  role: Role,
  kind: Command["kind"],
  args: Record<string, unknown> = {},
  command_id = `k-${++n}`,
): Command {
  return { command_id, role, kind, args };
}

function ctx(
  state: EngineState,
  accepted = new AcceptedCommands(),
  client_id = "c-1",
): CommandContext {
  return { scenario: fake, client_id, next_seq: state.session.last_seq + 1, accepted };
}

function applyEvent<K extends LogEvent["kind"]>(
  state: EngineState,
  kind: K,
  data: LogEventData[K],
  actor: Role | "system" = "system",
): EngineState {
  const event: LogEvent = {
    seq: state.session.last_seq + 1,
    sim_time: T0,
    kind,
    actor,
    data: data as Record<string, unknown>,
    provenance: {},
    command_ref: null,
  };
  return reduce(state, event);
}

function withTask(state: EngineState, task: StopTask): EngineState {
  return {
    ...state,
    tasks: [...state.tasks.filter((t) => t.task_id !== task.task_id), task],
  };
}

const loaded = initialState(fake, "s-0001");
const running = applyEvent(
  loaded,
  "EVA_STARTED",
  { crew_ids: ["EV1", "EV2"], plan_revision: 1 },
  "ops",
);

const sampleTaskEV1: StopTask = {
  task_id: "t-s1-01",
  stop_id: "wp-1",
  crew_id: "EV1",
  kind: "image",
  text: "Image the ridge crest",
  state: "TODO",
  reason: null,
  origin: "plan",
  updated_sim_time: T0,
  updated_by: "system",
  provenance: { "data.state": "simulated", "data.text": "assumed" },
};

const sampleTaskEV2: StopTask = {
  task_id: "t-s1-02",
  stop_id: "wp-1",
  crew_id: "EV2",
  kind: "observe",
  text: "Observe rock unit",
  state: "TODO",
  reason: null,
  origin: "plan",
  updated_sim_time: T0,
  updated_by: "system",
  provenance: { "data.state": "simulated", "data.text": "assumed" },
};

const sampleTaskNull: StopTask = {
  task_id: "t-s2-01",
  stop_id: "wp-2",
  crew_id: null,
  kind: "other",
  text: "Fixture task",
  state: "TODO",
  reason: null,
  origin: "plan",
  updated_sim_time: T0,
  updated_by: "system",
  provenance: { "data.state": "simulated", "data.text": "assumed" },
};

const runningWithTasks = withTask(
  withTask(withTask(running, sampleTaskEV1), sampleTaskEV2),
  sampleTaskNull,
);

// docs/specs/01 FR-50; 02 §E.4, §E.6; 05 StopTask. TASK-31.
describe("UPDATE_STOP_TASK", () => {
  it("eva:EV1 updating a task with crew_id EV2 gets FORBIDDEN_ROLE", () => {
    const out = handleCommand(
      runningWithTasks,
      cmd("eva:EV1", "UPDATE_STOP_TASK", { task_id: "t-s1-02", state: "DONE" }),
      ctx(runningWithTasks),
    );
    expect(out.result.ok).toBe(false);
    expect((out.result as Extract<CommandResult, { ok: false }>).code).toBe("FORBIDDEN_ROLE");
  });

  it("either EVA role may update a task with crew_id null", () => {
    const out1 = handleCommand(
      runningWithTasks,
      cmd("eva:EV1", "UPDATE_STOP_TASK", { task_id: "t-s2-01", state: "DONE" }),
      ctx(runningWithTasks),
    );
    expect(out1.result.ok).toBe(true);

    const out2 = handleCommand(
      runningWithTasks,
      cmd("eva:EV2", "UPDATE_STOP_TASK", { task_id: "t-s2-01", state: "DONE" }),
      ctx(runningWithTasks),
    );
    expect(out2.result.ok).toBe(true);
  });

  it("ops may update any crew member's task", () => {
    const outEV1 = handleCommand(
      runningWithTasks,
      cmd("ops", "UPDATE_STOP_TASK", { task_id: "t-s1-01", state: "DONE" }),
      ctx(runningWithTasks),
    );
    expect(outEV1.result.ok).toBe(true);

    const outEV2 = handleCommand(
      runningWithTasks,
      cmd("ops", "UPDATE_STOP_TASK", { task_id: "t-s1-02", state: "DONE" }),
      ctx(runningWithTasks),
    );
    expect(outEV2.result.ok).toBe(true);
  });

  it("planner and earth get FORBIDDEN_ROLE", () => {
    const outPlanner = handleCommand(
      runningWithTasks,
      cmd("planner", "UPDATE_STOP_TASK", { task_id: "t-s1-01", state: "DONE" }),
      ctx(runningWithTasks),
    );
    expect(outPlanner.result.ok).toBe(false);
    expect((outPlanner.result as Extract<CommandResult, { ok: false }>).code).toBe("FORBIDDEN_ROLE");

    const outEarth = handleCommand(
      runningWithTasks,
      cmd("earth", "UPDATE_STOP_TASK", { task_id: "t-s1-01", state: "DONE" }),
      ctx(runningWithTasks),
    );
    expect(outEarth.result.ok).toBe(false);
    expect((outEarth.result as Extract<CommandResult, { ok: false }>).code).toBe("FORBIDDEN_ROLE");
  });

  it("an unknown task_id is INVALID", () => {
    const out = handleCommand(
      runningWithTasks,
      cmd("ops", "UPDATE_STOP_TASK", { task_id: "t-unknown", state: "DONE" }),
      ctx(runningWithTasks),
    );
    expect(out.result.ok).toBe(false);
    expect((out.result as Extract<CommandResult, { ok: false }>).code).toBe("INVALID");
  });

  it("SKIPPED without a reason (time, terrain, alert, other) is INVALID", () => {
    const noReason = handleCommand(
      runningWithTasks,
      cmd("ops", "UPDATE_STOP_TASK", { task_id: "t-s1-01", state: "SKIPPED" }),
      ctx(runningWithTasks),
    );
    expect(noReason.result.ok).toBe(false);
    expect((noReason.result as Extract<CommandResult, { ok: false }>).code).toBe("INVALID");

    const withReason = handleCommand(
      runningWithTasks,
      cmd("ops", "UPDATE_STOP_TASK", { task_id: "t-s1-01", state: "SKIPPED", reason: "terrain" }),
      ctx(runningWithTasks),
    );
    expect(withReason.result.ok).toBe(true);
  });

  it("a DROPPED task cannot be updated (INVALID)", () => {
    const droppedTask: StopTask = { ...sampleTaskEV1, state: "DROPPED" };
    const stateWithDropped = withTask(running, droppedTask);
    const out = handleCommand(
      stateWithDropped,
      cmd("ops", "UPDATE_STOP_TASK", { task_id: "t-s1-01", state: "DONE" }),
      ctx(stateWithDropped),
    );
    expect(out.result.ok).toBe(false);
    expect((out.result as Extract<CommandResult, { ok: false }>).code).toBe("INVALID");
  });

  it("an unlinked suit gets NO_LINK and the client keeps the command queued", () => {
    const unlinkedState = applyEvent(runningWithTasks, "LINK_LOST", { node_id: "EV1" });
    const out = handleCommand(
      unlinkedState,
      cmd("eva:EV1", "UPDATE_STOP_TASK", { task_id: "t-s1-01", state: "DONE" }),
      ctx(unlinkedState),
    );
    expect(out.result.ok).toBe(false);
    expect((out.result as Extract<CommandResult, { ok: false }>).code).toBe("NO_LINK");
  });

  it("a valid update emits TASK_UPDATED with {task_id, stop_id, crew_id, state, reason} and the issuing role as actor", () => {
    const out = handleCommand(
      runningWithTasks,
      cmd("eva:EV1", "UPDATE_STOP_TASK", { task_id: "t-s1-01", state: "DONE" }),
      ctx(runningWithTasks),
    );
    expect(out.result.ok).toBe(true);
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({
      kind: "TASK_UPDATED",
      actor: "eva:EV1",
      data: {
        task_id: "t-s1-01",
        stop_id: "wp-1",
        crew_id: "EV1",
        state: "DONE",
        reason: null,
      },
    });
  });

  // TODO(decision): FR-50's 5-s undo — a TODO target state from the client, or client-side only.
  it.todo("undo within 5 s returns a DONE or SKIPPED task to TODO");
});

describe("ADD_STOP_TASK", () => {
  it("eva:EV1, eva:EV2, planner and earth get FORBIDDEN_ROLE", () => {
    for (const role of ["eva:EV1", "eva:EV2", "planner", "earth"] as const) {
      const out = handleCommand(
        runningWithTasks,
        cmd(role, "ADD_STOP_TASK", { stop_id: "wp-1", text: "New task" }),
        ctx(runningWithTasks),
      );
      expect(out.result.ok).toBe(false);
      expect((out.result as Extract<CommandResult, { ok: false }>).code).toBe("FORBIDDEN_ROLE");
    }
  });

  it("ops adding to the crew member's current or next stop emits TASK_ADDED with origin ops", () => {
    const atStop1 = applyEvent(runningWithTasks, "ARRIVED_STOP", {
      crew_id: "EV1",
      stop_id: "wp-1",
      stop_index: 1,
    });
    const out = handleCommand(
      atStop1,
      cmd("ops", "ADD_STOP_TASK", {
        stop_id: "wp-1",
        crew_id: "EV1",
        kind: "measure",
        text: "Measure radiation level",
      }),
      ctx(atStop1),
    );
    expect(out.result.ok).toBe(true);
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({
      kind: "TASK_ADDED",
      actor: "ops",
      data: {
        stop_id: "wp-1",
        crew_id: "EV1",
        kind: "measure",
        text: "Measure radiation level",
        origin: "ops",
      },
    });
  });

  it("a stop other than the current or next one is INVALID", () => {
    const atStop1 = applyEvent(runningWithTasks, "ARRIVED_STOP", {
      crew_id: "EV1",
      stop_id: "wp-1",
      stop_index: 1,
    });
    const out = handleCommand(
      atStop1,
      cmd("ops", "ADD_STOP_TASK", { stop_id: "wp-99", text: "Invalid stop" }),
      ctx(atStop1),
    );
    expect(out.result.ok).toBe(false);
    expect((out.result as Extract<CommandResult, { ok: false }>).code).toBe("INVALID");
  });

  // TODO(decision): U-52 — the 1–4 limit per stop or per crew member at a stop (the prototype counts per crew).
  it.todo("a fifth task on a stop is INVALID (1–4 per stop)");

  it("empty text or text over 60 characters is INVALID", () => {
    const atStop1 = applyEvent(runningWithTasks, "ARRIVED_STOP", {
      crew_id: "EV1",
      stop_id: "wp-1",
      stop_index: 1,
    });
    const emptyOut = handleCommand(
      atStop1,
      cmd("ops", "ADD_STOP_TASK", { stop_id: "wp-1", text: "   " }),
      ctx(atStop1),
    );
    expect(emptyOut.result.ok).toBe(false);
    expect((emptyOut.result as Extract<CommandResult, { ok: false }>).code).toBe("INVALID");

    const tooLongOut = handleCommand(
      atStop1,
      cmd("ops", "ADD_STOP_TASK", { stop_id: "wp-1", text: "a".repeat(61) }),
      ctx(atStop1),
    );
    expect(tooLongOut.result.ok).toBe(false);
    expect((tooLongOut.result as Extract<CommandResult, { ok: false }>).code).toBe("INVALID");

    const valid60 = handleCommand(
      atStop1,
      cmd("ops", "ADD_STOP_TASK", { stop_id: "wp-1", text: "a".repeat(60) }),
      ctx(atStop1),
    );
    expect(valid60.result.ok).toBe(true);
  });

  // TODO(decision): U-46 proposes "ops adds tasks only when no warning is latched"; reject code not chosen.
  it.todo("adding while a warning is latched is rejected");
});

// docs/specs/01 FR-50 (acceptance criteria); 05 StopTask, Scenario stop_tasks. TASK-31.
describe("stop tasks in the engine", () => {
  it("scenario stop_tasks become TASK_ADDED events with origin plan, state TODO, actor system", () => {
    const events = seedTasks(fake);
    expect(events.length).toBe(fake.scenario.stop_tasks!.length);
    for (const ev of events) {
      expect(ev.kind).toBe("TASK_ADDED");
      expect(ev.actor).toBe("system");
      expect(ev.data.origin).toBe("plan");
    }
  });

  it("TASK_ADDED / TASK_UPDATED / TASK_DROPPED reduce to the tasks in SNAPSHOT", () => {
    const eAdded: LogEvent = {
      seq: 1,
      sim_time: T0,
      kind: "TASK_ADDED",
      actor: "system",
      data: {
        task_id: "t-test",
        stop_id: "wp-1",
        crew_id: "EV1",
        kind: "image",
        text: "Test",
        origin: "plan",
      },
      provenance: {},
      command_ref: null,
    };
    const s1 = reduce(running, eAdded);
    expect(s1.tasks).toHaveLength(1);
    expect(s1.tasks[0]).toMatchObject({ task_id: "t-test", state: "TODO", origin: "plan" });

    const eUpdated: LogEvent = {
      seq: 2,
      sim_time: T0,
      kind: "TASK_UPDATED",
      actor: "eva:EV1",
      data: { task_id: "t-test", stop_id: "wp-1", crew_id: "EV1", state: "DONE", reason: null },
      provenance: {},
      command_ref: null,
    };
    const s2 = reduce(s1, eUpdated);
    expect(s2.tasks[0].state).toBe("DONE");

    const eDropped: LogEvent = {
      seq: 3,
      sim_time: T0,
      kind: "TASK_DROPPED",
      actor: "system",
      data: { task_id: "t-test", stop_id: "wp-1", plan_revision: 2 },
      provenance: {},
      command_ref: null,
    };
    const s3 = reduce(s2, eDropped);
    expect(s3.tasks[0].state).toBe("DROPPED");
  });

  it("a plan revision that drops stops turns their TODO tasks into DROPPED (actor system); DONE and SKIPPED stay", () => {
    const t1: StopTask = { ...sampleTaskEV1, task_id: "t-1", stop_id: "wp-2", state: "TODO" };
    const t2: StopTask = { ...sampleTaskEV1, task_id: "t-2", stop_id: "wp-2", state: "DONE" };
    const t3: StopTask = {
      ...sampleTaskEV1,
      task_id: "t-3",
      stop_id: "wp-2",
      state: "SKIPPED",
      reason: "time",
    };
    const state3 = withTask(withTask(withTask(running, t1), t2), t3);

    const revisionEvent: LogEvent = {
      seq: 10,
      sim_time: T0,
      kind: "PLAN_REVISED",
      actor: "ops",
      data: {
        plan_revision: 2,
        option_id: "abort-1",
        stops_dropped: [2],
        waypoints: [
          { id: "wp-0", role: "start", x_m: 0, y_m: 0 },
          { id: "wp-1", role: "stop", x_m: 100, y_m: 100 },
        ],
        legs: [],
      },
      provenance: {},
      command_ref: null,
    };

    const dropped = onPlanRevised(state3, revisionEvent);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({
      kind: "TASK_DROPPED",
      actor: "system",
      data: { task_id: "t-1", stop_id: "wp-2", plan_revision: 2 },
    });
  });

  it("a plan revision keeps the surviving stops' Waypoint ids, so tasks keep their stop (U-61)", () => {
    const tSurviving: StopTask = {
      ...sampleTaskEV1,
      task_id: "t-surv",
      stop_id: "wp-1",
      state: "TODO",
    };
    const stateSurv = withTask(running, tSurviving);
    const revisionDroppingWp2: LogEvent = {
      seq: 10,
      sim_time: T0,
      kind: "PLAN_REVISED",
      actor: "ops",
      data: {
        plan_revision: 2,
        option_id: "abort-1",
        stops_dropped: [2],
        waypoints: [
          { id: "wp-0", role: "start", x_m: 0, y_m: 0 },
          { id: "wp-1", role: "stop", x_m: 100, y_m: 100 },
        ],
        legs: [],
      },
      provenance: {},
      command_ref: null,
    };
    const dropped = onPlanRevised(stateSurv, revisionDroppingWp2);
    expect(dropped).toHaveLength(0);
  });

  it("abort in the killer demo turns the remaining stops' open tasks into DROPPED", () => {
    const tWp2: StopTask = { ...sampleTaskEV1, task_id: "t-wp2", stop_id: "wp-2", state: "TODO" };
    const stateAbort = withTask(running, tWp2);
    const abortEvent: LogEvent = {
      seq: 15,
      sim_time: T0,
      kind: "PLAN_REVISED",
      actor: "system",
      data: {
        plan_revision: 3,
        option_id: "ABORT_TO_HAB",
        stops_dropped: [2],
        waypoints: [{ id: "wp-0", role: "start", x_m: 0, y_m: 0 }],
        legs: [],
      },
      provenance: {},
      command_ref: null,
    };
    const dropped = onPlanRevised(stateAbort, abortEvent);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].data.task_id).toBe("t-wp2");
  });

  // TODO(decision): U-56 — open tasks at the current stop on abort or rendezvous.
  it.todo("open tasks at the current stop on abort follow the U-56 decision");

  it("the simulated crew member (EV2 in the demo) completes its open tasks at the end of each dwell", () => {
    const ev2OpenTask: StopTask = {
      task_id: "t-ev2-1",
      stop_id: "wp-1",
      crew_id: "EV2",
      kind: "observe",
      text: "EV2 task",
      state: "TODO",
      reason: null,
      origin: "plan",
      updated_sim_time: T0,
      updated_by: "system",
      provenance: {},
    };
    const stateDwellEnd: EngineState = {
      ...running,
      tasks: [ev2OpenTask],
      motion: {
        EV2: {
          plan_revision: 1,
          phase: "walk",
          leg_index: 2,
          t_s: 0,
          last_wp_id: "wp-1",
        },
      },
    };
    const tickResult = tasksTick(stateDwellEnd, { scenario: fake, dt_s: 1, next_seq: 20 });
    expect(tickResult.events).toHaveLength(1);
    expect(tickResult.events[0]).toMatchObject({
      kind: "TASK_UPDATED",
      actor: "system",
      data: { task_id: "t-ev2-1", state: "DONE" },
    });
    expect(tickResult.state.tasks[0].state).toBe("DONE");
  });

  it("two headless runs give the same TASK_* events (NFR-06)", () => {
    const run1 = seedTasks(fake);
    const run2 = seedTasks(fake);
    expect(run1).toEqual(run2);
  });

  it("post-EVA report task counts per stop equal the counts reduced from the event log", () => {
    const events: LogEvent[] = [
      {
        seq: 1,
        sim_time: T0,
        kind: "SESSION_LOADED",
        actor: "system",
        data: {
          session_id: "s-1",
          scenario_id: "test",
          data_version: "v1",
          seed: 1,
          plan_hash: "hash",
        },
        provenance: {},
        command_ref: null,
      },
      {
        seq: 2,
        sim_time: T0,
        kind: "EVA_STARTED",
        actor: "ops",
        data: { crew_ids: ["EV1", "EV2"], plan_revision: 1 },
        provenance: {},
        command_ref: null,
      },
      {
        seq: 3,
        sim_time: T0,
        kind: "TASK_ADDED",
        actor: "system",
        data: {
          task_id: "t1",
          stop_id: "wp-1",
          crew_id: "EV1",
          kind: "image",
          text: "T1",
          origin: "plan",
        },
        provenance: {},
        command_ref: null,
      },
      {
        seq: 4,
        sim_time: T0,
        kind: "TASK_ADDED",
        actor: "system",
        data: {
          task_id: "t2",
          stop_id: "wp-1",
          crew_id: "EV2",
          kind: "observe",
          text: "T2",
          origin: "plan",
        },
        provenance: {},
        command_ref: null,
      },
      {
        seq: 5,
        sim_time: T0,
        kind: "TASK_ADDED",
        actor: "system",
        data: {
          task_id: "t3",
          stop_id: "wp-2",
          crew_id: null,
          kind: "measure",
          text: "T3",
          origin: "plan",
        },
        provenance: {},
        command_ref: null,
      },
      {
        seq: 6,
        sim_time: T0,
        kind: "TASK_UPDATED",
        actor: "eva:EV1",
        data: { task_id: "t1", stop_id: "wp-1", crew_id: "EV1", state: "DONE", reason: null },
        provenance: {},
        command_ref: null,
      },
      {
        seq: 7,
        sim_time: T0,
        kind: "TASK_UPDATED",
        actor: "eva:EV2",
        data: {
          task_id: "t2",
          stop_id: "wp-1",
          crew_id: "EV2",
          state: "SKIPPED",
          reason: "time",
        },
        provenance: {},
        command_ref: null,
      },
      {
        seq: 8,
        sim_time: T0,
        kind: "TASK_DROPPED",
        actor: "system",
        data: { task_id: "t3", stop_id: "wp-2", plan_revision: 2 },
        provenance: {},
        command_ref: null,
      },
    ];
    const report = buildReport(events, "dummy_hash");
    expect(report.tasks.total).toBe(3);
    expect(report.tasks.done).toBe(1);
    expect(report.tasks.skipped).toBe(1);
    expect(report.tasks.dropped).toBe(1);
    expect(report.tasks.per_stop["wp-1"]).toEqual({ total: 2, done: 1, skipped: 1, dropped: 0 });
    expect(report.tasks.per_stop["wp-2"]).toEqual({ total: 1, done: 0, skipped: 0, dropped: 1 });
  });
});
