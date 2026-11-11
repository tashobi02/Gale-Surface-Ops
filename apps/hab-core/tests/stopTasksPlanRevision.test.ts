/**
 * Stop tasks across plan revisions, through the REAL command handlers and a real session (docs/specs/01 FR-50
 * "Abort ... turns the remaining stops' open tasks into DROPPED on every device"; 05 PLAN_REVISED, TASK_DROPPED;
 * NFR-06). TASK-31 (T31.03, T31.04).
 *
 * stopTasks.test.ts feeds `onPlanRevised` a hand-made PLAN_REVISED. This file checks the wiring: APPROVE_OPTION,
 * ABORT and PUBLISH_PLAN go through `handleCommand`, whose events must contain the TASK_DROPPED events of the
 * stops the revision removed, computed from the PRE-revision plan (the revised plan no longer has the stop).
 * Compute is the real one; the grid is the synthetic F9 `havenFlat` fixture, as in contingencyOpsReal.test.ts.
 * Expected drops come from the proposed option's own `stops_dropped` (1-based stop numbers), not from the engine.
 * No module is mocked: the session below seeds the scenario's real stop tasks.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { Command, CommandResult, ContingencyOption, LogEvent, LogEventData, LogEventKind, PlanExport, Role, StopTask } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand, type CommandContext } from "../src/commands";
import { contingencyTick } from "../src/engine/contingencyOps";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import { seedTasks, tasksTick } from "../src/engine/tasks";
import { canonicalJson } from "../src/log";
import { buildReport } from "../src/report";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { loadSession, type SessionHandle } from "../src/session";
import { havenFlat } from "../../../packages/compute/tests/fixtures/v2grids";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const sc: LoadedScenario = { ...fake, grid: havenFlat(10).grid };
const plan = sc.scenario.plan;
const STOP1 = plan.waypoints.filter((w) => w.role === "stop")[0]!;
const STOPS = plan.waypoints.filter((w) => w.role === "stop");
const T_ALERT = new Date(Date.parse(sc.scenario.start_utc) + 3600_000).toISOString().replace(".000Z", "Z");

let n = 0;
const cmd = (role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command => ({ command_id: `rev-${++n}`, role, kind, args });
const cctx = (state: EngineState): CommandContext => ({ scenario: sc, client_id: "c-1", next_seq: state.session.last_seq + 1, accepted: new AcceptedCommands() });
const fold = (state: EngineState, events: PendingEvent[]): EngineState => events.reduce((s, e) => reduce(s, logged(e, s.session.last_seq + 1)), state);
const apply = (state: EngineState, kind: LogEventKind, data: LogEventData[LogEventKind], actor: Role | "system" = "system"): EngineState =>
  reduce(state, { seq: state.session.last_seq + 1, sim_time: state.session.clock.sim_time, kind, actor, data: data as Record<string, unknown>, provenance: {}, command_ref: null } as LogEvent);
const taskOf = (s: EngineState, id: string): StopTask => s.tasks.find((t) => t.task_id === id)!;
const fail = (r: CommandResult): string => (r as Extract<CommandResult, { ok: false }>).code;

/** The scenario's seeded tasks as reduced from real TASK_ADDED events: t-s1-01 at wp-1 (EV1), t-s2-01 at wp-2 (either). */
function withSeededTasks(state: EngineState): EngineState {
  return fold(state, seedTasks(sc));
}

/** EVA running, both crew AT_STOP at stop 1, a radiation warning, then its OPTIONS_PROPOSED. */
function proposedState(): EngineState {
  let s = withSeededTasks(initialState(sc, "s-0001"));
  s = apply(s, "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops");
  for (const id of ["EV1", "EV2"] as const) {
    s = apply(s, "ARRIVED_STOP", { crew_id: id, stop_id: STOP1.id, stop_index: 1 });
    s = { ...s, crew: s.crew.map((c) => (c.crew_id === id ? { ...c, x_m: STOP1.x_m, y_m: STOP1.y_m } : c)) };
  }
  s = { ...s, session: { ...s.session, clock: { ...s.session.clock, sim_time: T_ALERT } } };
  s = apply(s, "ALERT_RAISED", { alert_id: `a-${s.session.last_seq + 1}`, code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "Radiation surge — shelter now" });
  const r = contingencyTick(s, { scenario: sc, dt_s: 1, next_seq: s.session.last_seq + 1 });
  return fold(r.state, r.events);
}
const proposed = proposedState();
const option = (kind: ContingencyOption["kind"]): ContingencyOption => {
  const o = proposed.options.find((x) => x.kind === kind);
  if (!o) throw new Error(`set-up: no ${kind} option`);
  return o;
};
/** Tasks of the fixture at the stops an option drops (1-based stop numbers), from the data alone. */
const expectedDrops = (o: ContingencyOption): string[] => proposed.tasks.filter((t) => t.state === "TODO" && o.stops_dropped.some((no) => STOPS[no - 1]?.id === t.stop_id)).map((t) => t.task_id);
const kinds = (events: PendingEvent[]): string[] => events.map((e) => e.kind);
const dropEvents = (events: PendingEvent[]): PendingEvent[] => events.filter((e) => e.kind === "TASK_DROPPED");

describe("ABORT drops the open tasks of the stops it removes (FR-50 acceptance; real handleCommand)", () => {
  it("set-up: the fixture really drops stop 2 and keeps stop 1", () => {
    expect(option("ABORT_TO_HAB").stops_dropped).toEqual([2]);
    expect(expectedDrops(option("ABORT_TO_HAB"))).toEqual(["t-s2-01"]);
  });

  it("ABORT logs PLAN_REVISED, then a TASK_DROPPED for each open task at a dropped stop, actor system", () => {
    const out = handleCommand(proposed, cmd("ops", "ABORT", { crew: ["EV1", "EV2"] }), cctx(proposed));
    expect(out.result.ok).toBe(true);
    expect(kinds(out.events)).toEqual(["PLAN_REVISED", "TASK_DROPPED"]);
    expect(out.events[1]).toMatchObject({ actor: "system", sim_time: proposed.session.clock.sim_time, data: { task_id: "t-s2-01", stop_id: "wp-2", plan_revision: proposed.session.plan_revision + 1 } });
    expect(out.result).toMatchObject({ ok: true, event_seq: proposed.session.last_seq + 1 });
  });

  it("the drops come from the plan BEFORE the revision: after the events are folded the task is DROPPED and the current stop's task stays TODO", () => {
    const out = handleCommand(proposed, cmd("eva:EV1", "ABORT", { crew: ["EV1"] }), cctx(proposed));
    const after = fold(proposed, out.events);
    expect(after.plan!.waypoints.some((w) => w.id === "wp-2")).toBe(false);
    expect(taskOf(after, "t-s2-01").state).toBe("DROPPED");
    expect(taskOf(after, "t-s1-01").state).toBe("TODO");
  });

  it("DONE and SKIPPED tasks at the dropped stop stay as they are", () => {
    const done = fold(proposed, handleCommand(proposed, cmd("ops", "UPDATE_STOP_TASK", { task_id: "t-s2-01", state: "DONE" }), cctx(proposed)).events);
    const out = handleCommand(done, cmd("ops", "ABORT", { crew: ["EV1", "EV2"] }), cctx(done));
    expect(kinds(out.events)).toEqual(["PLAN_REVISED"]);
    expect(taskOf(fold(done, out.events), "t-s2-01").state).toBe("DONE");
  });

  it("a rejected ABORT drops nothing", () => {
    const out = handleCommand(proposed, cmd("eva:EV2", "ABORT", { crew: ["EV1"] }), cctx(proposed));
    expect(out.result.ok).toBe(false);
    expect(kinds(out.events)).toEqual(["COMMAND_REJECTED"]);
  });

  it("every drop event carries the command's command_ref", () => {
    const out = handleCommand(proposed, cmd("ops", "ABORT", { crew: ["EV1", "EV2"] }), cctx(proposed));
    expect(out.events.every((e) => e.command_ref?.client_id === "c-1")).toBe(true);
  });

  it("the report counts the dropped task from the log (FR-46)", () => {
    const out = handleCommand(proposed, cmd("ops", "ABORT", { crew: ["EV1", "EV2"] }), cctx(proposed));
    const events = out.events.map((e, i) => logged(e, 100 + i));
    const added = seedTasks(sc).map((e, i) => logged(e, 10 + i));
    const report = buildReport([...added, ...events], "h");
    expect(report.tasks.dropped).toBe(1);
    expect(report.tasks.per_stop["wp-2"]).toMatchObject({ dropped: 1 });
  });
});

describe("APPROVE_OPTION drops the open tasks of the stops the option removes", () => {
  for (const kind of ["ABORT_TO_HAB", "VEHICLE_RENDEZVOUS", "CONTINUE_SKIP"] as const) {
    it(`${kind}: the TASK_DROPPED events are those of the option's stops_dropped, after PLAN_REVISED`, () => {
      const o = option(kind);
      const out = handleCommand(proposed, cmd("ops", "APPROVE_OPTION", { option_id: o.option_id }), cctx(proposed));
      expect(out.result.ok).toBe(true);
      const order = kinds(out.events);
      const planAt = order.indexOf("PLAN_REVISED");
      expect(planAt).toBeGreaterThanOrEqual(0);
      expect(order.slice(planAt + 1)).toEqual(expectedDrops(o).map(() => "TASK_DROPPED"));
      expect(dropEvents(out.events).map((e) => e.data.task_id)).toEqual(expectedDrops(o));
    });
  }

  it("a VEHICLE_RENDEZVOUS approval keeps VEHICLE_DISPATCHED first and event_seq on it", () => {
    const out = handleCommand(proposed, cmd("ops", "APPROVE_OPTION", { option_id: option("VEHICLE_RENDEZVOUS").option_id }), cctx(proposed));
    expect(kinds(out.events)[0]).toBe("VEHICLE_DISPATCHED");
    expect(out.result).toMatchObject({ ok: true, event_seq: proposed.session.last_seq + 1 });
  });
});

describe("PUBLISH_PLAN drops the open tasks of stops the new plan no longer has", () => {
  const loaded = withSeededTasks(initialState(sc, "s-0002"));
  function planWithout(stopId: string): PlanExport {
    const p = structuredClone(plan);
    p.waypoints = p.waypoints.filter((w) => w.id !== stopId);
    p.result = { ...p.result, legs: p.result.legs.slice(0, p.waypoints.length - 1) };
    p.plan_hash = createHash("sha256").update(canonicalJson({ data_version: p.data_version, scenario: p.scenario, waypoints: p.waypoints }), "utf8").digest("hex").slice(0, 12);
    return p;
  }

  it("publishing a plan without wp-2 logs PLAN_REVISED, then TASK_DROPPED for t-s2-01 only", () => {
    const out = handleCommand(loaded, cmd("planner", "PUBLISH_PLAN", { plan: planWithout("wp-2") }), cctx(loaded));
    expect(out.result.ok, JSON.stringify(out.result)).toBe(true);
    expect(kinds(out.events)).toEqual(["PLAN_REVISED", "TASK_DROPPED"]);
    expect(out.events[1].data).toEqual({ task_id: "t-s2-01", stop_id: "wp-2", plan_revision: 2 });
    expect(taskOf(fold(loaded, out.events), "t-s1-01").state).toBe("TODO");
  });

  it("republishing the same plan drops nothing", () => {
    const out = handleCommand(loaded, cmd("planner", "PUBLISH_PLAN", { plan: structuredClone(plan) }), cctx(loaded));
    expect(out.result.ok).toBe(true);
    expect(kinds(out.events)).toEqual(["PLAN_REVISED"]);
  });
});

describe("a real session: drops, undo and determinism (NFR-06)", () => {
  const dirs: string[] = [];
  const varDir = (): string => {
    const d = mkdtempSync(join(tmpdir(), "marswalk-stoptasks-"));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });
  const send = (s: SessionHandle, role: Role, kind: Command["kind"], args: Record<string, unknown> = {}, client = role as string) => s.apply(cmd(role, kind, args), client);
  const tasksOf = (s: SessionHandle): StopTask[] => s.snapshot([]).tasks;

  it("the seeded tasks are in the snapshot of a fresh session (no mock hides them)", () => {
    const s = loadSession(fake, varDir());
    expect(tasksOf(s).map((t) => t.task_id)).toEqual(["t-s1-01", "t-s2-01"]);
    expect(s.eventsAfter(0).map((e) => e.kind)).toEqual(["SESSION_LOADED", "TASK_ADDED", "TASK_ADDED"]);
  });

  it("PUBLISH_PLAN through the session logs the drops and the snapshot shows DROPPED", () => {
    const s = loadSession(fake, varDir());
    const p = structuredClone(plan);
    p.waypoints = p.waypoints.filter((w) => w.id !== "wp-2");
    p.result = { ...p.result, legs: p.result.legs.slice(0, 1) };
    p.plan_hash = createHash("sha256").update(canonicalJson({ data_version: p.data_version, scenario: p.scenario, waypoints: p.waypoints }), "utf8").digest("hex").slice(0, 12);
    const out = send(s, "planner", "PUBLISH_PLAN", { plan: p });
    expect(out.result.ok).toBe(true);
    expect(out.events.map((e) => e.kind)).toEqual(["PLAN_REVISED", "TASK_DROPPED"]);
    expect(out.events.map((e) => e.seq)).toEqual([4, 5]);
    expect(tasksOf(s).find((t) => t.task_id === "t-s2-01")).toMatchObject({ state: "DROPPED", updated_by: "system" });
    expect(tasksOf(s).find((t) => t.task_id === "t-s1-01")?.state).toBe("TODO");
  });

  it("tick, then undo: EV1 ticks, undoes, and the log, snapshot and report agree", () => {
    const s = loadSession(fake, varDir());
    send(s, "ops", "START_EVA");
    const done = send(s, "eva:EV1", "UPDATE_STOP_TASK", { task_id: "t-s1-01", state: "DONE" });
    expect(done.result.ok).toBe(true);
    expect(tasksOf(s).find((t) => t.task_id === "t-s1-01")?.state).toBe("DONE");
    const undone = send(s, "eva:EV1", "UPDATE_STOP_TASK", { task_id: "t-s1-01", state: "TODO", undo: true });
    expect(undone.result.ok).toBe(true);
    expect(undone.events[0].data).toMatchObject({ state: "TODO", undo: true });
    expect(tasksOf(s).find((t) => t.task_id === "t-s1-01")).toMatchObject({ state: "TODO", reason: null });
    const log = s.eventsAfter(0);
    expect(log.filter((e) => e.kind === "TASK_UPDATED")).toHaveLength(2);
    const report = buildReport(log, "h");
    expect(report.tasks).toMatchObject({ total: 2, done: 0 });
    const refused = send(s, "ops", "UPDATE_STOP_TASK", { task_id: "t-s1-01", state: "TODO", undo: true });
    expect(refused.result.ok).toBe(false);
    expect(fail(refused.result)).toBe("FORBIDDEN_ROLE");
  });

  /** Two independent sessions given the same commands and the same number of steps. */
  function run(): { hash: string; log: LogEvent[]; tasks: StopTask[] } {
    const s = loadSession(fake, varDir());
    // Fixed command ids: the log holds each command_ref, so a counter shared with other tests would differ per run.
    const go = (role: Role, kind: Command["kind"], args: Record<string, unknown>, id: string) => s.apply({ command_id: id, role, kind, args }, role);
    go("ops", "START_EVA", {}, "r-1");
    s.advance(40);
    go("eva:EV1", "UPDATE_STOP_TASK", { task_id: "t-s1-01", state: "DONE" }, "r-2");
    // Legs of 1000 m take 1091 s each and the dwell is 1200 s, so EV2 leaves wp-2 (its last stop) after about 4580 s.
    for (let k = 0; k < 10; k++) s.advance(500);
    const snap = s.snapshot([]);
    return { hash: snap.session.log_hash, log: s.eventsAfter(0), tasks: snap.tasks };
  }

  it("two runs of the same script give the same event-log hash, with the simulated crew member's auto-completion in it", () => {
    const a = run();
    const b = run();
    expect(a.log).toEqual(b.log);
    expect(a.hash).toBe(b.hash);
    const auto = a.log.filter((e) => e.kind === "TASK_UPDATED" && e.actor === "system");
    expect(auto.map((e) => e.data.task_id)).toContain("t-s2-01");
    expect(auto.every((e) => e.data.state === "DONE")).toBe(true);
  });

  it("tasksTick is a pure function of its inputs: the same state and context give identical events and state", () => {
    const base: EngineState = { ...withSeededTasks(initialState(sc, "s-0003")), motion: { EV2: { plan_revision: 1, phase: "walk", leg_index: 1, t_s: 0, last_wp_id: "wp-2" } } };
    const a = tasksTick(base, { scenario: sc, dt_s: 1, next_seq: 40 });
    const b = tasksTick(base, { scenario: sc, dt_s: 1, next_seq: 40 });
    expect(a).toEqual(b);
    expect(a.events.map((e) => e.data.task_id)).toEqual(["t-s2-01"]);
  });
});
