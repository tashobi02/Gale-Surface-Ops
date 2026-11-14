import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Command,
  CommandResult,
  LogEvent,
  LogEventData,
  Role,
  StopTask,
  Waypoint,
} from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { AcceptedCommands, handleCommand, type CommandContext } from "../src/commands";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
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

  // N-32 / FD-031 / BD-163: the cap is per selected crew; shared tasks count for both.
  it.each(["EV1", "EV2"] as const)("accepts a fourth task for %s despite the other crew's tasks, then rejects a fifth", (crew_id) => {
    const other = crew_id === "EV1" ? "EV2" : "EV1";
    const atStop = applyEvent(runningWithTasks, "ARRIVED_STOP", { crew_id, stop_id: "wp-1", stop_index: 1 });
    const tasks: StopTask[] = [
      ...[1, 2].map(i => ({ ...sampleTaskEV1, task_id: `own-${i}`, crew_id })),
      { ...sampleTaskEV1, task_id: "shared", crew_id: null },
      ...[1, 2, 3].map(i => ({ ...sampleTaskEV1, task_id: `other-${i}`, crew_id: other as typeof crew_id })),
    ];
    const state = { ...atStop, tasks };
    const fourth = handleCommand(state, cmd("ops", "ADD_STOP_TASK", { stop_id: "wp-1", text: "Fourth", crew_id }), ctx(state));
    expect(fourth.result.ok).toBe(true);
    const full = fourth.events.reduce((s, e) => reduce(s, logged(e, s.session.last_seq + 1)), state);
    const fifth = handleCommand(full, cmd("ops", "ADD_STOP_TASK", { stop_id: "wp-1", text: "Fifth", crew_id }), ctx(full));
    expect(fifth.result).toMatchObject({ ok: false, code: "INVALID", message: expect.stringMatching(new RegExp(`${crew_id}.*wp-1.*4`)) });
    expect(fifth.events.map(e => e.kind)).toEqual(["COMMAND_REJECTED"]);
  });

  it("rejects a shared addition if either crew is full, even when the other has room", () => {
    const atStop = applyEvent(runningWithTasks, "ARRIVED_STOP", { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 });
    for (const crew_id of ["EV1", "EV2"] as const) {
      const tasks: StopTask[] = [1, 2, 3, 4].map(i => ({ ...sampleTaskEV1, task_id: `full-${i}`, crew_id }));
      const s = { ...atStop, tasks };
      expect(handleCommand(s, cmd("ops", "ADD_STOP_TASK", { stop_id: "wp-1", text: "Shared", crew_id: null }), ctx(s)).result).toMatchObject({ ok: false, code: "INVALID", message: expect.stringContaining(crew_id) });
    }
  });

  it("a dropped task does not count towards the four of its stop", () => {
    const atStop1 = applyEvent(runningWithTasks, "ARRIVED_STOP", { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 });
    const four: StopTask[] = [1, 2, 3, 4].map((i) => ({ ...sampleTaskEV1, task_id: `t-c${i}`, stop_id: "wp-1", crew_id: null, state: i === 4 ? "DROPPED" : "TODO" }));
    const s = four.reduce<EngineState>((acc, t) => withTask(acc, t), { ...atStop1, tasks: [] });
    expect(handleCommand(s, cmd("ops", "ADD_STOP_TASK", { stop_id: "wp-1", text: "Fits" }), ctx(s)).result.ok).toBe(true);
  });

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

  // Decided (BD-05, orchestrator, 13 Nov 2026): U-46 is not adopted. Ops may add a task while a warning is latched: FR-50 limits
  // tasks by stop and count only, and a latched warning is when ops most needs to annotate the stop.
  it("adding while a warning is latched is accepted: the limit is the stop and the count, nothing else (BD-05)", () => {
    const atStop1 = applyEvent(runningWithTasks, "ARRIVED_STOP", { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 });
    const latched = applyEvent(atStop1, "ALERT_RAISED", { alert_id: "a-1", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "Shelter now — radiation surge" });
    expect(latched.alerts.some((a) => a.level === "warning" && a.cleared_seq === null)).toBe(true);
    const out = handleCommand(latched, cmd("ops", "ADD_STOP_TASK", { stop_id: "wp-1", crew_id: "EV1", kind: "other", text: "Note the hazard" }), ctx(latched));
    expect(out.result.ok).toBe(true);
  });
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

  // Decided (BD-59, orchestrator, 13 Nov 2026): U-56 — an abort or rendezvous drops only the open tasks of stops the revision
  // removes; the stop the crew stands at is kept in the plan, so its open tasks stay (the dropped-stop rule above, and the
  // "abort in the killer demo" case below, cover it).
  it("open tasks at the current stop stay open on a revision that keeps that stop (BD-59, U-56)", () => {
    const plan = runningWithTasks.plan!;
    const revised = { ...runningWithTasks };
    const event = { seq: 9, sim_time: T0, kind: "PLAN_REVISED" as const, actor: "ops" as const, data: { plan_revision: 2, option_id: "o-1", stops_dropped: [2], waypoints: plan.waypoints.filter((w) => w.id !== "wp-2"), legs: [] }, provenance: {}, command_ref: null };
    const drops = onPlanRevised(revised, event);
    expect(drops.map((d) => d.data.task_id)).toEqual(["t-s2-01"]);
    expect(drops.some((d) => d.data.stop_id === "wp-1")).toBe(false);
  });

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

  // U-52 / BD-109: an either-task (crew_id null) is completed by the simulated crew member at dwell end, like its own tasks.
  it("an either-task (crew_id null) at the stop is completed by the simulated crew member at dwell end (BD-109)", () => {
    const either: StopTask = { ...sampleTaskEV1, task_id: "t-either", stop_id: "wp-1", crew_id: null, state: "TODO" };
    const state: EngineState = { ...running, tasks: [either], motion: { EV2: { plan_revision: 1, phase: "walk", leg_index: 2, t_s: 0, last_wp_id: "wp-1" } } };
    const out = tasksTick(state, { scenario: fake, dt_s: 1, next_seq: 20 });
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ kind: "TASK_UPDATED", actor: "system", data: { task_id: "t-either", crew_id: null, state: "DONE" } });
  });

  it("a task assigned to EV1 is never auto-completed, even when EV1 is the one at the stop (BD-109)", () => {
    const own: StopTask = { ...sampleTaskEV1, task_id: "t-ev1-own", stop_id: "wp-1", crew_id: "EV1", state: "TODO" };
    const motion = (id: "EV1" | "EV2") => ({ [id]: { plan_revision: 1, phase: "walk" as const, leg_index: 2, t_s: 0, last_wp_id: "wp-1" } });
    for (const id of ["EV1", "EV2"] as const) {
      const out = tasksTick({ ...running, tasks: [own], motion: motion(id) }, { scenario: fake, dt_s: 1, next_seq: 20 });
      expect(out.events, id).toEqual([]);
      expect(out.state.tasks[0].state).toBe("TODO");
    }
  });

  it("an either-task at another stop than the one just left stays open", () => {
    const elsewhere: StopTask = { ...sampleTaskEV1, task_id: "t-elsewhere", stop_id: "wp-2", crew_id: null, state: "TODO" };
    const state: EngineState = { ...running, tasks: [elsewhere], motion: { EV2: { plan_revision: 1, phase: "walk", leg_index: 2, t_s: 0, last_wp_id: "wp-1" } } };
    expect(tasksTick(state, { scenario: fake, dt_s: 1, next_seq: 20 }).events).toEqual([]);
  });

  it("seedTasks is a pure function of the scenario: two calls give equal events", () => {
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

// ---------------------------------------------------------------------------------------------
// FR-50 transitions and undo (01 FR-50 "Undo"; 02 §E.6 "Stop-task undo"; 05 UPDATE_STOP_TASK args).
// Spec change #202, 11 Nov 2026. State is built by real commands reduced through the real reducer.
// ---------------------------------------------------------------------------------------------

const codeOf = (r: CommandResult): string => (r as Extract<CommandResult, { ok: false }>).code;

/** Apply a handled command's events through the real reducer, as the session does. */
function applyOut(state: EngineState, out: { events: PendingEvent[] }): EngineState {
  return out.events.reduce((s, e) => reduce(s, logged(e, s.session.last_seq + 1)), state);
}

/** Send a command and, if accepted, fold its events into the state. */
function send(state: EngineState, role: Role, args: Record<string, unknown>, kind: Command["kind"] = "UPDATE_STOP_TASK") {
  const out = handleCommand(state, cmd(role, kind, args), ctx(state));
  return { out, next: applyOut(state, out) };
}

/** A running session whose tasks came from TASK_ADDED events, so every field is the reducer's own. */
function seeded(): EngineState {
  let s = running;
  for (const t of fake.scenario.stop_tasks!) {
    s = applyEvent(s, "TASK_ADDED", { task_id: t.task_id, stop_id: t.stop_id, crew_id: t.crew_id ?? null, kind: t.kind, text: t.text, origin: "plan" });
  }
  return s;
}
const taskOf = (s: EngineState, id: string): StopTask => s.tasks.find((t) => t.task_id === id)!;

describe("UPDATE_STOP_TASK transitions (FR-50)", () => {
  const undoArgs = { task_id: "t-s1-01", state: "TODO", undo: true };

  it("DONE and SKIPPED are accepted only from TODO", () => {
    const base = seeded();
    const done = send(base, "ops", { task_id: "t-s1-01", state: "DONE" });
    expect(done.out.result.ok).toBe(true);
    expect(taskOf(done.next, "t-s1-01").state).toBe("DONE");
    for (const target of [{ state: "DONE" }, { state: "SKIPPED", reason: "time" }]) {
      const again = send(done.next, "ops", { task_id: "t-s1-01", ...target });
      expect(again.out.result.ok, JSON.stringify(target)).toBe(false);
      expect(codeOf(again.out.result)).toBe("INVALID");
      expect(again.out.events.map((e) => e.kind)).toEqual(["COMMAND_REJECTED"]);
      expect(taskOf(again.next, "t-s1-01").state).toBe("DONE");
    }
  });

  it("SKIPPED to DONE is INVALID; SKIPPED to SKIPPED is a reason revision (N-29, BD-153), tested below", () => {
    const skipped = send(seeded(), "ops", { task_id: "t-s1-01", state: "SKIPPED", reason: "terrain" }).next;
    expect(codeOf(send(skipped, "ops", { task_id: "t-s1-01", state: "DONE" }).out.result)).toBe("INVALID");
  });

  it("TODO without undo true is INVALID, even from DONE and even for a task already TODO", () => {
    const done = send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "DONE" }).next;
    for (const args of [{ task_id: "t-s1-01", state: "TODO" }, { task_id: "t-s1-01", state: "TODO", undo: false }]) {
      expect(codeOf(send(done, "eva:EV1", args).out.result)).toBe("INVALID");
    }
    expect(codeOf(send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "TODO" }).out.result)).toBe("INVALID");
  });

  it("undo true with a target other than TODO is INVALID (sent by the actor of the last change)", () => {
    // EV1 ticked and undid, so EV1 is the actor of the last change and passes the actor check; the rest is INVALID.
    const ev1 = send(send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "DONE" }).next, "eva:EV1", { task_id: "t-s1-01", state: "TODO", undo: true }).next;
    expect(codeOf(send(ev1, "eva:EV1", { task_id: "t-s1-01", state: "DONE", undo: true }).out.result)).toBe("INVALID");
    expect(codeOf(send(ev1, "eva:EV1", { task_id: "t-s1-01", state: "SKIPPED", reason: "time", undo: true }).out.result)).toBe("INVALID");
    expect(codeOf(send(ev1, "eva:EV1", { task_id: "t-s1-01", state: "DROPPED", undo: true }).out.result)).toBe("INVALID");
    const done = send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "DONE" }).next;
    expect(codeOf(send(done, "eva:EV1", { task_id: "t-s1-01", state: "SKIPPED", reason: "time", undo: true }).out.result)).toBe("INVALID");
    expect(taskOf(done, "t-s1-01").state).toBe("DONE");
  });

  it("undo true from anyone but the actor of the last change is FORBIDDEN_ROLE before the target is looked at", () => {
    const opsDone = send(seeded(), "ops", { task_id: "t-s1-01", state: "DONE" }).next;
    expect(codeOf(send(opsDone, "eva:EV1", { task_id: "t-s1-01", state: "DONE", undo: true }).out.result)).toBe("FORBIDDEN_ROLE");
  });

  it("an undo on a task nobody ever updated is INVALID for every role, not FORBIDDEN_ROLE", () => {
    for (const role of ["ops", "eva:EV1"] as const) expect(codeOf(send(seeded(), role, undoArgs).out.result), role).toBe("INVALID");
  });

  it("an undo on a dropped task is INVALID, whether it was ever updated or not", () => {
    const never = applyEvent(seeded(), "TASK_DROPPED", { task_id: "t-s1-01", stop_id: "wp-1", plan_revision: 2 });
    for (const role of ["ops", "eva:EV1"] as const) expect(codeOf(send(never, role, undoArgs).out.result), role).toBe("INVALID");
    const undone = send(send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "DONE" }).next, "eva:EV1", undoArgs).next;
    const dropped = applyEvent(undone, "TASK_DROPPED", { task_id: "t-s1-01", stop_id: "wp-1", plan_revision: 2 });
    for (const role of ["ops", "eva:EV1"] as const) expect(codeOf(send(dropped, role, undoArgs).out.result), role).toBe("INVALID");
  });

  it("a state outside TODO, DONE, SKIPPED is INVALID", () => {
    expect(codeOf(send(seeded(), "ops", { task_id: "t-s1-01", state: "DROPPED" }).out.result)).toBe("INVALID");
    expect(codeOf(send(seeded(), "ops", { task_id: "t-s1-01" }).out.result)).toBe("INVALID");
  });
});

describe("UPDATE_STOP_TASK revises the reason of a SKIPPED task (N-29, BD-153; FR-50, FD-028)", () => {
  const revise = (reason: unknown) => ({ task_id: "t-s1-01", state: "SKIPPED", reason });
  const skippedBy = (role: Role, reason = "other"): EngineState => send(seeded(), role, revise(reason)).next;

  it("the actor of the SKIP changes the reason on the same task: one TASK_UPDATED with state SKIPPED and the new reason, no undo field", () => {
    const skipped = skippedBy("eva:EV1");
    const { out, next } = send(skipped, "eva:EV1", revise("terrain"));
    expect(out.result.ok).toBe(true);
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ kind: "TASK_UPDATED", actor: "eva:EV1" });
    expect(out.events[0].data).toEqual({ task_id: "t-s1-01", stop_id: "wp-1", crew_id: "EV1", state: "SKIPPED", reason: "terrain", old_reason: "other" });
    expect(out.events[0].provenance).toMatchObject({ "data.reason": "assumed", "data.old_reason": "assumed" });
    expect(taskOf(next, "t-s1-01")).toMatchObject({ state: "SKIPPED", reason: "terrain", updated_by: "eva:EV1" });
  });

  it("the reason can be cycled more than once (time, terrain, alert, other), each change is its own logged event", () => {
    let s = skippedBy("eva:EV1");
    for (const reason of ["time", "terrain", "alert"]) {
      const step = send(s, "eva:EV1", revise(reason));
      expect(step.out.result.ok, reason).toBe(true);
      s = step.next;
      expect(taskOf(s, "t-s1-01").reason).toBe(reason);
    }
  });

  it("a revision then an undo still returns the task to TODO", () => {
    const s = send(skippedBy("eva:EV1"), "eva:EV1", revise("time")).next;
    const undone = send(s, "eva:EV1", { task_id: "t-s1-01", state: "TODO", undo: true });
    expect(undone.out.result.ok).toBe(true);
    expect(taskOf(undone.next, "t-s1-01")).toMatchObject({ state: "TODO", reason: null });
  });

  it("another role may not revise: FORBIDDEN_ROLE, as for an undo (ops did not make the SKIP, the EVA role did)", () => {
    const skipped = skippedBy("eva:EV1");
    expect(codeOf(send(skipped, "ops", revise("time")).out.result)).toBe("FORBIDDEN_ROLE");
    expect(taskOf(skipped, "t-s1-01").reason).toBe("other");
  });

  it("ops may revise a SKIP that ops made", () => {
    expect(send(skippedBy("ops"), "ops", revise("alert")).out.result.ok).toBe(true);
  });

  it("a reason outside time, terrain, alert, other, or none at all, is INVALID", () => {
    const skipped = skippedBy("eva:EV1");
    for (const reason of ["boredom", undefined, 3, null]) expect(codeOf(send(skipped, "eva:EV1", revise(reason)).out.result), String(reason)).toBe("INVALID");
  });

  it("the same reason again is INVALID: nothing would change", () => {
    expect(codeOf(send(skippedBy("eva:EV1", "time"), "eva:EV1", revise("time")).out.result)).toBe("INVALID");
  });

  it("after a PLAN_REVISED since the SKIP the reason is final (INVALID), as for an undo", () => {
    const skipped = skippedBy("eva:EV1");
    const plan = skipped.plan!;
    const revised = applyEvent(skipped, "PLAN_REVISED", { plan_revision: 2, option_id: null, stops_dropped: [], waypoints: plan.waypoints, legs: plan.result.legs });
    expect(codeOf(send(revised, "eva:EV1", revise("terrain")).out.result)).toBe("INVALID");
  });

  it("a SKIP that the system made cannot be revised, and a DONE or TODO task has no reason to revise (SKIPPED stays allowed from TODO only)", () => {
    const done = send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "DONE" }).next;
    expect(codeOf(send(done, "eva:EV1", revise("time")).out.result)).toBe("INVALID");
    expect(send(seeded(), "eva:EV1", revise("time")).out.result.ok).toBe(true); // from TODO: the ordinary skip
  });
});

describe("UPDATE_STOP_TASK undo (FR-50, spec change #202)", () => {
  const undoArgs = { task_id: "t-s1-01", state: "TODO", undo: true };

  it("the sender that made the change reverses DONE to TODO; the event is TASK_UPDATED with undo true", () => {
    const done = send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "DONE" }).next;
    const { out, next } = send(done, "eva:EV1", undoArgs);
    expect(out.result.ok).toBe(true);
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ kind: "TASK_UPDATED", actor: "eva:EV1" });
    expect(out.events[0].data).toEqual({ task_id: "t-s1-01", stop_id: "wp-1", crew_id: "EV1", state: "TODO", reason: null, undo: true });
    expect(taskOf(next, "t-s1-01")).toMatchObject({ state: "TODO", reason: null, updated_by: "eva:EV1" });
  });

  it("a normal tick or skip carries no undo field", () => {
    const out = send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "SKIPPED", reason: "time" }).out;
    expect(out.events[0].data).toEqual({ task_id: "t-s1-01", stop_id: "wp-1", crew_id: "EV1", state: "SKIPPED", reason: "time" });
  });

  it("SKIPPED to TODO clears the reason", () => {
    const skipped = send(seeded(), "ops", { task_id: "t-s1-01", state: "SKIPPED", reason: "alert" }).next;
    const { out, next } = send(skipped, "ops", undoArgs);
    expect(out.result.ok).toBe(true);
    expect(taskOf(next, "t-s1-01")).toMatchObject({ state: "TODO", reason: null });
  });

  it("ops may undo its own change, but not a change made by the EVA role", () => {
    const opsDone = send(seeded(), "ops", { task_id: "t-s1-01", state: "DONE" }).next;
    expect(send(opsDone, "ops", undoArgs).out.result.ok).toBe(true);
    const evaDone = send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "DONE" }).next;
    const out = send(evaDone, "ops", undoArgs).out;
    expect(codeOf(out.result)).toBe("FORBIDDEN_ROLE");
    expect(taskOf(applyOut(evaDone, out), "t-s1-01").state).toBe("DONE");
  });

  it("the EVA role may not undo a change made by ops, and the other EVA role may not undo it either", () => {
    const opsDone = send(seeded(), "ops", { task_id: "t-s2-01", state: "DONE" }).next; // crew_id null: either EVA role
    expect(codeOf(send(opsDone, "eva:EV1", { ...undoArgs, task_id: "t-s2-01" }).out.result)).toBe("FORBIDDEN_ROLE");
    const ev1Done = send(seeded(), "eva:EV1", { task_id: "t-s2-01", state: "DONE" }).next;
    expect(codeOf(send(ev1Done, "eva:EV2", { ...undoArgs, task_id: "t-s2-01" }).out.result)).toBe("FORBIDDEN_ROLE");
  });

  it("a change by system (auto-complete) cannot be undone by anyone: FORBIDDEN_ROLE", () => {
    const auto = applyEvent(seeded(), "TASK_UPDATED", { task_id: "t-s1-01", stop_id: "wp-1", crew_id: "EV1", state: "DONE", reason: null }, "system");
    for (const role of ["ops", "eva:EV1"] as const) {
      expect(codeOf(send(auto, role, undoArgs).out.result), role).toBe("FORBIDDEN_ROLE");
    }
  });

  it("planner and earth are FORBIDDEN_ROLE for undo, as for every UPDATE_STOP_TASK", () => {
    const done = send(seeded(), "ops", { task_id: "t-s1-01", state: "DONE" }).next;
    for (const role of ["planner", "earth"] as const) expect(codeOf(send(done, role, undoArgs).out.result)).toBe("FORBIDDEN_ROLE");
  });

  it("the checks run NO_LINK, then FORBIDDEN_ROLE, then INVALID", () => {
    const opsDone = send(seeded(), "ops", { task_id: "t-s1-01", state: "DONE" }).next;
    const unlinked = applyEvent(opsDone, "LINK_LOST", { node_id: "EV1" });
    // EV1 is not the actor of the change AND has no link: NO_LINK wins.
    expect(codeOf(send(unlinked, "eva:EV1", undoArgs).out.result)).toBe("NO_LINK");
    // Linked, not the actor, and the task is also not undoable for another reason (none here): FORBIDDEN_ROLE.
    expect(codeOf(send(opsDone, "eva:EV1", undoArgs).out.result)).toBe("FORBIDDEN_ROLE");
    // A task nobody ever updated has no actor to compare with: INVALID, not FORBIDDEN_ROLE (#202).
    expect(codeOf(send(seeded(), "eva:EV1", undoArgs).out.result)).toBe("INVALID");
  });

  it("an undo of a task that is TODO, or DROPPED, by the actor of its last event is INVALID", () => {
    const done = send(seeded(), "ops", { task_id: "t-s1-01", state: "DONE" }).next;
    const undone = send(done, "ops", undoArgs).next;
    expect(codeOf(send(undone, "ops", undoArgs).out.result)).toBe("INVALID"); // already TODO
    const dropped = withTask(seeded(), { ...taskOf(seeded(), "t-s1-01"), state: "DROPPED", updated_by: "ops" });
    expect(codeOf(send(dropped, "ops", undoArgs).out.result)).toBe("INVALID");
  });

  it("only the last change can be undone: after ops re-ticks the undone task, EV1 cannot undo", () => {
    let s = send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "DONE" }).next;
    s = send(s, "eva:EV1", undoArgs).next;
    s = send(s, "ops", { task_id: "t-s1-01", state: "DONE" }).next;
    expect(codeOf(send(s, "eva:EV1", undoArgs).out.result)).toBe("FORBIDDEN_ROLE");
    expect(send(s, "ops", undoArgs).out.result.ok).toBe(true);
  });

  it("an undo after a PLAN_REVISED since the change is INVALID, even when the stop is still in the plan", () => {
    const done = send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "DONE" }).next;
    const plan = done.plan!;
    const revised = applyEvent(done, "PLAN_REVISED", { plan_revision: 2, option_id: null, stops_dropped: [], waypoints: plan.waypoints, legs: plan.result.legs });
    expect(revised.plan!.waypoints.some((w) => w.id === "wp-1")).toBe(true);
    const out = send(revised, "eva:EV1", undoArgs).out;
    expect(codeOf(out.result)).toBe("INVALID");
    expect(taskOf(applyOut(revised, out), "t-s1-01").state).toBe("DONE");
  });

  it("a revision before the change does not stale it: tick after the revision, then undo", () => {
    const base = seeded();
    const plan = base.plan!;
    const revised = applyEvent(base, "PLAN_REVISED", { plan_revision: 2, option_id: null, stops_dropped: [], waypoints: plan.waypoints, legs: plan.result.legs });
    const done = send(revised, "eva:EV1", { task_id: "t-s1-01", state: "DONE" }).next;
    expect(send(done, "eva:EV1", undoArgs).out.result.ok).toBe(true);
  });

  it("an undo for a task whose stop left the current plan is INVALID (never revives a dropped stop's task)", () => {
    const done = send(seeded(), "ops", { task_id: "t-s2-01", state: "DONE" }).next;
    const plan = done.plan!;
    const revised = applyEvent(done, "PLAN_REVISED", {
      plan_revision: 2,
      option_id: "o-1",
      stops_dropped: [2],
      waypoints: plan.waypoints.filter((w) => w.id !== "wp-2"),
      legs: [],
    });
    expect(codeOf(send(revised, "ops", { ...undoArgs, task_id: "t-s2-01" }).out.result)).toBe("INVALID");
  });

  it("staleness survives a snapshot: the plan revision of the change is plain JSON in the state", () => {
    const done = send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "DONE" }).next;
    const restored = JSON.parse(JSON.stringify(done)) as EngineState;
    expect(send(restored, "eva:EV1", undoArgs).out.result.ok).toBe(true);
    const plan = restored.plan!;
    const revised = applyEvent(restored, "PLAN_REVISED", { plan_revision: 2, option_id: null, stops_dropped: [], waypoints: plan.waypoints, legs: plan.result.legs });
    expect(codeOf(send(revised, "eva:EV1", undoArgs).out.result)).toBe("INVALID");
  });

  it("the undo uses the log alone: no wall-clock input, the same state gives the same event", () => {
    const done = send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "DONE" }).next;
    const command = cmd("eva:EV1", "UPDATE_STOP_TASK", undoArgs);
    const a = handleCommand(done, command, ctx(done)).events;
    const b = handleCommand(done, command, ctx(done)).events;
    expect(a).toEqual(b);
  });
});

describe("stop task provenance (05 StopTask, NFR-05)", () => {
  it("TASK_DROPPED provenance is not empty and names a field of its data", () => {
    const [e] = onPlanRevised(
      withTask(running, { ...sampleTaskEV1, stop_id: "wp-2" }),
      { seq: 9, sim_time: T0, kind: "PLAN_REVISED", actor: "ops", data: { plan_revision: 2, option_id: null, stops_dropped: [2], waypoints: [], legs: [] } as never, provenance: {}, command_ref: null },
    );
    expect(e.provenance).toEqual({ "data.plan_revision": "simulated" });
    expect(Object.keys(e.data)).toContain("plan_revision");
  });

  const fieldsOf = (e: PendingEvent): string[] => Object.keys(e.provenance).map((k) => k.replace(/^data\./, ""));

  it("TASK_ADDED provenance keys are fields of its data (seeded and ops-added)", () => {
    const atStop1 = applyEvent(seeded(), "ARRIVED_STOP", { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 });
    const added = send(atStop1, "ops", { stop_id: "wp-1", crew_id: "EV1", kind: "measure", text: "Measure dose" }, "ADD_STOP_TASK").out.events;
    const events = [...seedTasks(fake), ...added];
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(Object.keys(e.provenance).every((k) => k.startsWith("data."))).toBe(true);
      for (const f of fieldsOf(e)) expect(Object.keys(e.data), `${e.kind} provenance names ${f}`).toContain(f);
      expect(e.provenance["data.text"]).toBe("assumed");
    }
  });

  it("TASK_UPDATED provenance is not empty and names a field of its data (state is simulated)", () => {
    const done = send(seeded(), "eva:EV1", { task_id: "t-s1-01", state: "DONE" });
    const undone = send(done.next, "eva:EV1", { task_id: "t-s1-01", state: "TODO", undo: true });
    for (const e of [...done.out.events, ...undone.out.events]) {
      expect(e.kind).toBe("TASK_UPDATED");
      expect(e.provenance).toEqual({ "data.state": "simulated" });
    }
  });

  it("auto-completed TASK_UPDATED events carry the same provenance", () => {
    const stateDwellEnd: EngineState = { ...seeded(), motion: { EV2: { plan_revision: 1, phase: "walk", leg_index: 2, t_s: 0, last_wp_id: "wp-2" } } };
    const events = tasksTick(stateDwellEnd, { scenario: fake, dt_s: 1, next_seq: 20 }).events;
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.provenance).toEqual({ "data.state": "simulated" });
  });
});

// ---------------------------------------------------------------------------------------------
// ADD_STOP_TASK: server ids, validation, 1-based stop numbers (Crew.stop_index, stops_dropped).
// ---------------------------------------------------------------------------------------------

/**
 * The fake plan with a non-stop waypoint before every stop, so a stop's 1-based number differs from its index in
 * `waypoints`. 05 Waypoint has only `start | stop` today; `via` is a test-only role standing for "any non-stop
 * waypoint", which the engine must skip (it filters on `role === "stop"`).
 */
function threeStopsWithVia(base: EngineState): EngineState {
  const wp = (id: string, role: string, x_m: number) => ({ id, role, x_m, y_m: 0 }) as unknown as Waypoint;
  const waypoints = [wp("wp-0", "start", 0), wp("v-1", "via", 500), wp("s-1", "stop", 1000), wp("v-2", "via", 1500), wp("s-2", "stop", 2000), wp("v-3", "via", 2500), wp("s-3", "stop", 3000)];
  return { ...base, plan: { ...base.plan!, waypoints } };
}
const addTo = (state: EngineState, args: Record<string, unknown>) => send(state, "ops", args, "ADD_STOP_TASK");
const stopOk = (state: EngineState, stop_id: string, crew_id?: string): boolean => addTo(state, { stop_id, text: "Check", ...(crew_id ? { crew_id } : {}) }).out.result.ok;

describe("ADD_STOP_TASK server-side rules (FR-50)", () => {
  const atStop1 = applyEvent(seeded(), "ARRIVED_STOP", { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 });

  it("the server generates the task id, t-ops-<seq>, and ignores one the client sends", () => {
    const { out, next } = addTo(atStop1, { stop_id: "wp-1", crew_id: "EV1", task_id: "t-s1-01", text: "Take a photo" });
    expect(out.result.ok).toBe(true);
    expect(out.events[0].data.task_id).toBe(`t-ops-${atStop1.session.last_seq + 1}`);
    expect(taskOf(next, "t-s1-01")).toEqual(taskOf(atStop1, "t-s1-01")); // not overwritten
    expect(next.tasks).toHaveLength(atStop1.tasks.length + 1);
  });

  it("never overwrites an existing task, even one that already holds the generated id", () => {
    const clash = `t-ops-${atStop1.session.last_seq + 1}`;
    // A task that already has the id the server would pick (added without a log event, so last_seq does not move).
    const taken = withTask(atStop1, { ...taskOf(atStop1, "t-s1-01"), task_id: clash, text: "Seeded" });
    const { out, next } = addTo(taken, { stop_id: "wp-1", text: "New" });
    expect(out.result.ok).toBe(true);
    expect(out.events[0].data.task_id).not.toBe(clash);
    const ids = next.tasks.map((t) => t.task_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(next.tasks).toHaveLength(taken.tasks.length + 1);
    expect(taskOf(next, clash).text).toBe("Seeded");
  });

  it("two ops additions in a row get two different ids", () => {
    const first = addTo(atStop1, { stop_id: "wp-1", text: "One" });
    const second = addTo(first.next, { stop_id: "wp-1", text: "Two" });
    expect(second.next.tasks.map((t) => t.task_id)).toContain(first.out.events[0].data.task_id);
    expect(second.out.events[0].data.task_id).not.toBe(first.out.events[0].data.task_id);
  });

  it("a kind outside the enum is INVALID; a missing kind is other", () => {
    expect(codeOf(addTo(atStop1, { stop_id: "wp-1", text: "x", kind: "teleport" }).out.result)).toBe("INVALID");
    expect(codeOf(addTo(atStop1, { stop_id: "wp-1", text: "x", kind: 7 }).out.result)).toBe("INVALID");
    for (const kind of ["observe", "image", "sample", "measure", "deploy", "other"]) expect(addTo(atStop1, { stop_id: "wp-1", text: "x", kind }).out.result.ok, kind).toBe(true);
    expect(addTo(atStop1, { stop_id: "wp-1", text: "x" }).out.events[0].data.kind).toBe("other");
  });

  it("a crew_id outside EV1, EV2 or null is INVALID; a missing one means either (null)", () => {
    expect(codeOf(addTo(atStop1, { stop_id: "wp-1", text: "x", crew_id: "EV3" }).out.result)).toBe("INVALID");
    expect(codeOf(addTo(atStop1, { stop_id: "wp-1", text: "x", crew_id: 1 }).out.result)).toBe("INVALID");
    expect(codeOf(addTo(atStop1, { stop_id: "wp-1", text: "x", crew_id: "" }).out.result)).toBe("INVALID");
    expect(addTo(atStop1, { stop_id: "wp-1", text: "x" }).out.events[0].data.crew_id).toBeNull();
    expect(addTo(atStop1, { stop_id: "wp-1", text: "x", crew_id: null }).out.events[0].data.crew_id).toBeNull();
    expect(addTo(atStop1, { stop_id: "wp-1", text: "x", crew_id: "EV1" }).out.events[0].data.crew_id).toBe("EV1");
  });

  it("an id containing / is INVALID (it would break STATE_DELTA paths)", () => {
    expect(codeOf(addTo(atStop1, { stop_id: "wp/1", text: "x" }).out.result)).toBe("INVALID");
    expect(codeOf(addTo(atStop1, { stop_id: "wp-1", text: "x", task_id: "a/b" }).out.result)).toBe("INVALID");
  });

  it("a non-string stop_id or text is INVALID", () => {
    expect(codeOf(addTo(atStop1, { stop_id: 1, text: "x" }).out.result)).toBe("INVALID");
    expect(codeOf(addTo(atStop1, { stop_id: "wp-1", text: 5 }).out.result)).toBe("INVALID");
    expect(codeOf(addTo(atStop1, { stop_id: "wp-1" }).out.result)).toBe("INVALID");
  });

  it("an EVA role is FORBIDDEN_ROLE for ADD_STOP_TASK", () => {
    expect(codeOf(send(atStop1, "eva:EV1", { stop_id: "wp-1", text: "x" }, "ADD_STOP_TASK").out.result)).toBe("FORBIDDEN_ROLE");
  });
});

describe("ADD_STOP_TASK current or next stop uses 1-based stop numbers over the stops only", () => {
  const base = threeStopsWithVia(seeded());
  const at = (crew_id: "EV1" | "EV2", stop_id: string, n: number): EngineState => applyEvent(base, "ARRIVED_STOP", { crew_id, stop_id, stop_index: n });

  it("at stop 1 (stop_index 1) the current stop s-1 and the next stop s-2 are allowed, the third is not", () => {
    const s = at("EV1", "s-1", 1);
    expect(stopOk(s, "s-1", "EV1")).toBe(true);
    expect(stopOk(s, "s-2", "EV1")).toBe(true);
    expect(stopOk(s, "s-3", "EV1")).toBe(false);
  });

  it("at stop 2 (stop_index 2) s-2 and s-3 are allowed, s-1 is not", () => {
    const s = at("EV1", "s-2", 2);
    expect(stopOk(s, "s-1", "EV1")).toBe(false);
    expect(stopOk(s, "s-2", "EV1")).toBe(true);
    expect(stopOk(s, "s-3", "EV1")).toBe(true);
  });

  it("at the last stop only that stop is allowed", () => {
    const s = at("EV2", "s-3", 3);
    expect(stopOk(s, "s-3", "EV2")).toBe(true);
    expect(stopOk(s, "s-2", "EV2")).toBe(false);
  });

  it("a via waypoint id is never a valid stop", () => {
    expect(stopOk(at("EV1", "s-1", 1), "v-2", "EV1")).toBe(false);
  });

  it("a crew member walking to the first stop has that stop as next, and no other", () => {
    const walking = base; // EVA running, EV1 WALKING with stop_index null
    expect(stopOk(walking, "s-1", "EV1")).toBe(true);
    expect(stopOk(walking, "s-2", "EV1")).toBe(false);
  });

  it("a crew member who has left stop 1 and walks on has stop 2 as next, not stop 1", () => {
    const left = applyEvent(base, "LEFT_STOP", { crew_id: "EV1", stop_id: "s-1", stop_index: 1 });
    expect(stopOk(left, "s-2", "EV1")).toBe(true);
    expect(stopOk(left, "s-1", "EV1")).toBe(false);
    expect(stopOk(left, "s-3", "EV1")).toBe(false);
  });

  it("with no crew_id the stop must be current or next for some crew member", () => {
    const s = applyEvent(at("EV1", "s-1", 1), "ARRIVED_STOP", { crew_id: "EV2", stop_id: "s-2", stop_index: 2 });
    expect(stopOk(s, "s-3")).toBe(true); // next stop of EV2
    expect(stopOk(s, "s-1")).toBe(true); // current stop of EV1
    expect(stopOk(threeStopsWithVia(running), "s-3")).toBe(false);
  });

  it("a crew member who is sheltered or in the hab has no current or next stop", () => {
    const sheltered = applyEvent(at("EV1", "s-1", 1), "CREW_SHELTERED", { crew_id: "EV1", haven_kind: "hab", dose_event_ugy: 0, dose_event_unsheltered_ugy: 0 });
    expect(stopOk(sheltered, "s-2", "EV1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// onPlanRevised with via waypoints: stops_dropped are 1-based stop numbers, not waypoint indexes.
// ---------------------------------------------------------------------------------------------

describe("onPlanRevised stop numbers (05 PLAN_REVISED stops_dropped)", () => {
  const task = (id: string, stop_id: string): StopTask => ({ ...sampleTaskEV1, task_id: id, stop_id, crew_id: null });
  const withStopTasks = (): EngineState => {
    const base = threeStopsWithVia(running);
    return ["s-1", "s-2", "s-3"].reduce((s, id) => withTask(s, task(`t-${id}`, id)), base);
  };
  const revision = (stops_dropped: number[], waypoints: Waypoint[]): LogEvent => ({
    seq: 30,
    sim_time: T0,
    kind: "PLAN_REVISED",
    actor: "ops",
    data: { plan_revision: 2, option_id: "o-1", stops_dropped, waypoints, legs: [] } as unknown as Record<string, unknown>,
    provenance: {},
    command_ref: null,
  });
  const allWaypoints = threeStopsWithVia(running).plan!.waypoints;

  it("stops_dropped [3] drops stop 3 (s-3) whatever the revised waypoints say, with via points before every stop", () => {
    const dropped = onPlanRevised(withStopTasks(), revision([3], allWaypoints));
    expect(dropped.map((e) => e.data.task_id)).toEqual(["t-s-3"]);
  });

  it("stops_dropped [2, 3] drops stops 2 and 3 and keeps stop 1", () => {
    const dropped = onPlanRevised(withStopTasks(), revision([2, 3], allWaypoints));
    expect(dropped.map((e) => e.data.task_id).sort()).toEqual(["t-s-2", "t-s-3"]);
  });

  it("revised waypoints without s-3 drop s-3 even when stops_dropped is empty (a published plan)", () => {
    const without = allWaypoints.filter((w) => w.id !== "s-3");
    expect(onPlanRevised(withStopTasks(), revision([], without)).map((e) => e.data.task_id)).toEqual(["t-s-3"]);
  });

  it("a stop number beyond the stops, zero, or a non-integer drops nothing and does not throw", () => {
    for (const bad of [[9], [0], [-1], [1.5]]) expect(onPlanRevised(withStopTasks(), revision(bad, allWaypoints)), JSON.stringify(bad)).toEqual([]);
  });

  it("the events carry the revision's plan_revision and sim_time, actor system", () => {
    const [e] = onPlanRevised(withStopTasks(), revision([3], allWaypoints));
    expect(e).toMatchObject({ kind: "TASK_DROPPED", actor: "system", sim_time: T0, data: { task_id: "t-s-3", stop_id: "s-3", plan_revision: 2 } });
  });

  it("DONE, SKIPPED and already DROPPED tasks at a dropped stop are left alone", () => {
    const s = ["TODO", "DONE", "SKIPPED", "DROPPED"].reduce((acc, st, i) => withTask(acc, { ...task(`t-x${i}`, "s-3"), state: st as StopTask["state"] }), threeStopsWithVia(running));
    expect(onPlanRevised(s, revision([3], allWaypoints)).map((e) => e.data.task_id)).toEqual(["t-x0"]);
  });
});
