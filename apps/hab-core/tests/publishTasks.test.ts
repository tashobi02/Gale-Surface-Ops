/**
 * T32.24: `PUBLISH_PLAN {plan, stop_tasks?}` and the task library in the SNAPSHOT (docs/specs/01 FR-54, FR-50;
 * 05 StopTask, TaskLibraryEntry; 02 §E.6; NFR-06). One named test per rule; red before T32.25.
 *
 * Rules fixed here (decided by the orchestrator, 12 Nov 2026, BD-90, BD-91, BD-109, BD-120):
 * - `stop_tasks` (`StopTaskSeed[]`, the 05 Scenario field) is checked with the FR-50 rules against the plan being published:
 *   every `stop_id` is a stop Waypoint of that plan (U-61), a stop has at most 4 tasks, text is 1-60 characters, `task_id`
 *   is unique, has no "/" and names no task of the session, `kind` and `crew_id` are the 05 values. Any fault is `INVALID`
 *   and nothing but COMMAND_REJECTED is logged. Arguments are checked before state (`INVALID` over `BUSY`).
 * - An accepted publish logs PLAN_REVISED first (so `event_seq` and the plan are as without tasks), then one TASK_ADDED
 *   per task, actor `system`, origin `plan`, no `command_ref`, exactly as scenario `stop_tasks` are seeded at load.
 *   `plan_hash` covers `data_version`, `scenario` and `waypoints` only, so tasks never change it.
 * - A stop with no entry has no task, which is allowed (a plan without tasks publishes as before); the "1-4" of FR-50 is
 *   therefore checked as "at most 4" for the stops that have entries.
 * - The library is `Snapshot.task_library`, the same SNAPSHOT for every role; `[]` when the scenario has none.
 * Compute is the real one; the grid is the synthetic F9 `havenFlat` fixture where an ABORT is needed.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, Command, CommandResult, LogEvent, LogEventData, LogEventKind, PlanExport, Role, Scenario, ServerMessage, Snapshot, StopTaskSeed } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand, type CommandContext } from "../src/commands";
import { contingencyTick } from "../src/engine/contingencyOps";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import { seedTasks } from "../src/engine/tasks";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { startServer } from "../src/server";
import { loadSession, resumeSession } from "../src/session";
import { havenFlat } from "../../../packages/compute/tests/fixtures/v2grids";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures/fake-scenario");
const NO_SITE = { site_id: "mock_site", data_version: "mock_site-fixture", dir: null };

const dirs: string[] = [];
const tmp = (prefix: string): string => {
  const d = mkdtempSync(join(tmpdir(), `marswalk-${prefix}-`));
  dirs.push(d);
  return d;
};
const open: { close: (() => Promise<void>)[]; sockets: WebSocket[] } = { close: [], sockets: [] };
afterEach(async () => {
  for (const s of open.sockets.splice(0)) s.close();
  for (const c of open.close.splice(0)) await c();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** The plan-less variant of the fake scenario as a folder of its own (a live session before PUBLISH_PLAN), edited by `edit`. */
function planlessScenario(edit: (s: Scenario) => void = () => {}): LoadedScenario {
  const dir = tmp("publish-scenario");
  cpSync(fixtureDir, dir, { recursive: true });
  const scenario = JSON.parse(readFileSync(join(dir, "scenario.planless.json"), "utf8")) as Scenario;
  edit(scenario);
  writeFileSync(join(dir, "scenario.json"), `${JSON.stringify(scenario, null, 2)}\n`);
  return readScenario(dir, NO_SITE);
}

const reference = readScenario(fixtureDir, NO_SITE);
const plan: PlanExport = reference.scenario.plan!;
const STOPS = plan.waypoints.filter((w) => w.role === "stop");
const [STOP1, STOP2] = [STOPS[0]!, STOPS[1]!];

const seed = (task_id: string, stop_id: string, text = "Fixture task", extra: Partial<StopTaskSeed> = {}): StopTaskSeed => ({ task_id, stop_id, crew_id: null, kind: "other", text, ...extra });
const AUTHORED: StopTaskSeed[] = [
  { task_id: "pt-1", stop_id: STOP1.id, crew_id: "EV1", kind: "image", text: "Image the ridge crest" },
  { task_id: "pt-2", stop_id: STOP1.id, crew_id: null, kind: "observe", text: "Note the box-work texture" },
  { task_id: "pt-3", stop_id: STOP2.id, crew_id: "EV2", kind: "sample", text: "Brush and bag the contact" },
];

let n = 0;
const cmd = (role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command => ({ command_id: `pt-${++n}`, role, kind, args });
const ctxOf = (state: EngineState, scenario: LoadedScenario): CommandContext => ({ scenario, client_id: "c-1", next_seq: state.session.last_seq + 1, accepted: new AcceptedCommands() });
const fold = (state: EngineState, events: PendingEvent[]): EngineState => events.reduce((s, e) => reduce(s, logged(e, s.session.last_seq + 1)), state);
const codeOf = (r: CommandResult): string => (r.ok ? "ok" : r.code);
const kinds = (events: { kind: string }[]): string[] => events.map((e) => e.kind);

const planless = planlessScenario();
const fresh = (): EngineState => initialState(planless, "s-0001");
const publish = (state: EngineState, args: Record<string, unknown>, role: Role = "planner", scenario: LoadedScenario = planless) => handleCommand(state, cmd(role, "PUBLISH_PLAN", args), ctxOf(state, scenario));

describe("PUBLISH_PLAN with stop_tasks seeds TASK_ADDED (FR-54, FR-50, BD-91)", () => {
  it("logs PLAN_REVISED first, then one TASK_ADDED per task, so event_seq is the plan's own", () => {
    const state = fresh();
    const out = publish(state, { plan, stop_tasks: AUTHORED });
    expect(out.result).toMatchObject({ ok: true, event_seq: state.session.last_seq + 1 });
    expect(kinds(out.events)).toEqual(["PLAN_REVISED", "TASK_ADDED", "TASK_ADDED", "TASK_ADDED"]);
  });

  it("the tasks keep their authored fields and take origin plan, actor system and no command_ref, as scenario stop_tasks do at load", () => {
    const out = publish(fresh(), { plan, stop_tasks: AUTHORED });
    const added = out.events.filter((e) => e.kind === "TASK_ADDED");
    expect(added.map((e) => e.data)).toEqual(AUTHORED.map((t) => ({ task_id: t.task_id, stop_id: t.stop_id, crew_id: t.crew_id, kind: t.kind, text: t.text, origin: "plan" })));
    for (const e of added) expect(e).toMatchObject({ actor: "system", command_ref: null });
    // Same event shape as the load path (seedTasks), apart from the sim time.
    const loadPath = seedTasks({ ...reference, scenario: { ...reference.scenario, stop_tasks: AUTHORED } });
    expect(added.map(({ sim_time: _t, ...rest }) => rest)).toEqual(loadPath.map(({ sim_time: _t, ...rest }) => ({ ...rest, command_ref: null })));
  });

  it("reduces to TODO tasks on the published stops, with the text labelled assumed", () => {
    const state = fresh();
    const out = publish(state, { plan, stop_tasks: AUTHORED });
    const after = fold(state, out.events);
    expect(after.tasks.map((t) => [t.task_id, t.stop_id, t.state, t.origin])).toEqual(AUTHORED.map((t) => [t.task_id, t.stop_id, "TODO", "plan"]));
    expect(after.tasks[0].provenance).toMatchObject({ text: "assumed", state: "simulated" });
  });

  it("plan_hash is unchanged by the tasks: the published plan is the PlanExport as sent", () => {
    const withTasks = fold(fresh(), publish(fresh(), { plan, stop_tasks: AUTHORED }).events);
    const without = fold(fresh(), publish(fresh(), { plan }).events);
    expect(withTasks.plan!.plan_hash).toBe(plan.plan_hash);
    expect(withTasks.plan).toEqual(without.plan);
  });

  it("a plan without tasks, or with an empty list, publishes as before: one PLAN_REVISED", () => {
    expect(kinds(publish(fresh(), { plan }).events)).toEqual(["PLAN_REVISED"]);
    expect(kinds(publish(fresh(), { plan, stop_tasks: [] }).events)).toEqual(["PLAN_REVISED"]);
  });

  it("ops may publish with tasks as well; an EVA role may not (FORBIDDEN_ROLE) and nothing is seeded", () => {
    expect(kinds(publish(fresh(), { plan, stop_tasks: AUTHORED }, "ops").events)).toContain("TASK_ADDED");
    const eva = publish(fresh(), { plan, stop_tasks: AUTHORED }, "eva:EV1");
    expect(codeOf(eva.result)).toBe("FORBIDDEN_ROLE");
    expect(kinds(eva.events)).toEqual(["COMMAND_REJECTED"]);
  });

  it("four tasks on a stop are accepted", () => {
    const four = [1, 2, 3, 4].map((i) => seed(`pt-f${i}`, STOP1.id));
    expect(kinds(publish(fresh(), { plan, stop_tasks: four }).events)).toEqual(["PLAN_REVISED", "TASK_ADDED", "TASK_ADDED", "TASK_ADDED", "TASK_ADDED"]);
  });
});

describe("PUBLISH_PLAN rejects bad stop_tasks with INVALID and logs only COMMAND_REJECTED (FR-50)", () => {
  const bad: [string, unknown][] = [
    ["a stop_id that is not a Waypoint of the plan", [seed("pt-x", "wp-99")]],
    ["a stop_id that is the start Waypoint, not a stop", [seed("pt-x", "wp-0")]],
    ["more than four tasks for one stop", [1, 2, 3, 4, 5].map((i) => seed(`pt-m${i}`, STOP1.id))],
    ["text over 60 characters", [seed("pt-x", STOP1.id, "a".repeat(61))]],
    ["empty text", [seed("pt-x", STOP1.id, "   ")]],
    ["a duplicate task_id in the list", [seed("pt-x", STOP1.id), seed("pt-x", STOP2.id)]],
    ["a task_id with a slash (it is part of a STATE_DELTA path)", [seed("pt/x", STOP1.id)]],
    ["a crew_id that is neither EV1, EV2 nor null", [seed("pt-x", STOP1.id, "Fixture task", { crew_id: "EV3" as never })]],
    ["a kind outside the 05 StopTaskKind values", [seed("pt-x", STOP1.id, "Fixture task", { kind: "paint" as never })]],
    ["stop_tasks that is not an array", { task_id: "pt-x" }],
    ["an entry that is not an object", ["pt-x"]],
  ];
  for (const [what, stop_tasks] of bad) {
    it(`rejects ${what}`, () => {
      const state = fresh();
      const out = publish(state, { plan, stop_tasks });
      expect(codeOf(out.result)).toBe("INVALID");
      expect(kinds(out.events)).toEqual(["COMMAND_REJECTED"]);
      expect(fold(state, out.events).plan).toBeNull();
      expect(fold(state, out.events).tasks).toEqual([]);
    });
  }

  it("rejects a task_id that names a task the session already has", () => {
    const state = fold(initialState(reference, "s-0001"), seedTasks(reference));
    const out = handleCommand(state, cmd("planner", "PUBLISH_PLAN", { plan, stop_tasks: [seed("t-s1-01", STOP1.id)] }), ctxOf(state, reference));
    expect(codeOf(out.result)).toBe("INVALID");
    expect(kinds(out.events)).toEqual(["COMMAND_REJECTED"]);
  });

  it("checks the tasks before the state: bad tasks are INVALID, good tasks with a running EVA are BUSY", () => {
    const running = reduce(fresh(), { seq: 2, sim_time: planless.scenario.start_utc, kind: "EVA_STARTED", actor: "ops", data: { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, provenance: {}, command_ref: null });
    expect(codeOf(publish(running, { plan, stop_tasks: [seed("pt-x", "wp-99")] }).result)).toBe("INVALID");
    // a plan-less state cannot START_EVA, but the status gate is the same for any state that is no longer LOADED
    expect(codeOf(publish(running, { plan, stop_tasks: AUTHORED }).result)).toBe("BUSY");
  });
});

describe("ADD_STOP_TASK and ABORT on a plan published with tasks (FR-50)", () => {
  const sc: LoadedScenario = { ...planlessScenario(), grid: havenFlat(10).grid };
  const apply = (state: EngineState, kind: LogEventKind, data: LogEventData[LogEventKind], actor: Role | "system" = "system"): EngineState =>
    reduce(state, { seq: state.session.last_seq + 1, sim_time: state.session.clock.sim_time, kind, actor, data: data as Record<string, unknown>, provenance: {}, command_ref: null } as LogEvent);

  /** Published with tasks, EVA running, both crew AT_STOP at stop 1. */
  function atStop1(): EngineState {
    let s = initialState(sc, "s-0001");
    s = fold(s, publish(s, { plan, stop_tasks: AUTHORED }, "planner", sc).events);
    s = apply(s, "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: s.session.plan_revision }, "ops");
    for (const id of ["EV1", "EV2"] as const) {
      s = apply(s, "ARRIVED_STOP", { crew_id: id, stop_id: STOP1.id, stop_index: 1 });
      s = { ...s, crew: s.crew.map((c) => (c.crew_id === id ? { ...c, x_m: STOP1.x_m, y_m: STOP1.y_m } : c)) };
    }
    return s;
  }

  it("a free-placed stop (no POI) can still get a task by hand with ADD_STOP_TASK", () => {
    const state = atStop1();
    const out = handleCommand(state, cmd("ops", "ADD_STOP_TASK", { stop_id: STOP2.id, text: "Extra photo", kind: "image" }), ctxOf(state, sc));
    expect(out.result.ok).toBe(true);
    expect(out.events[0]).toMatchObject({ kind: "TASK_ADDED", data: { stop_id: STOP2.id, origin: "ops" } });
  });

  it("an abort drops the open tasks of the published plan at the stops it removes, and keeps the others", () => {
    let s = atStop1();
    s = apply(s, "ALERT_RAISED", { alert_id: `a-${s.session.last_seq + 1}`, code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "Radiation surge — shelter now" });
    const r = contingencyTick(s, { scenario: sc, dt_s: 1, next_seq: s.session.last_seq + 1 });
    const proposed = fold(r.state, r.events);
    expect(proposed.options.find((o) => o.kind === "ABORT_TO_HAB")?.stops_dropped).toEqual([2]);
    const out = handleCommand(proposed, cmd("ops", "ABORT", { crew: ["EV1", "EV2"] }), ctxOf(proposed, sc));
    expect(out.result.ok).toBe(true);
    const dropped = out.events.filter((e) => e.kind === "TASK_DROPPED");
    expect(dropped.map((e) => e.data.task_id)).toEqual(["pt-3"]);
    expect(dropped[0]).toMatchObject({ actor: "system", command_ref: null });
    const after = fold(proposed, out.events);
    expect(after.tasks.map((t) => [t.task_id, t.state])).toEqual([["pt-1", "TODO"], ["pt-2", "TODO"], ["pt-3", "DROPPED"]]);
  });
});

describe("a real session: published tasks reach the task list and survive a restart (NFR-10)", () => {
  it("PUBLISH_PLAN from the planner puts the tasks in the SNAPSHOT, and resume rebuilds them from the log", () => {
    const varDir = tmp("publish-var");
    const session = loadSession(planless, varDir);
    const r = session.apply(cmd("planner", "PUBLISH_PLAN", { plan, stop_tasks: AUTHORED }), "c-plan");
    expect(r.result.ok).toBe(true);
    expect(kinds(r.events)).toEqual(["PLAN_REVISED", "TASK_ADDED", "TASK_ADDED", "TASK_ADDED"]);
    const snap = session.snapshot([]);
    expect(snap.tasks.map((t) => t.task_id)).toEqual(["pt-1", "pt-2", "pt-3"]);
    expect(snap.plan!.plan_hash).toBe(plan.plan_hash);
    const resumed = resumeSession(join(varDir, "sessions", "s-0001"), planless).snapshot([]);
    expect(resumed.tasks.map((t) => t.task_id)).toEqual(["pt-1", "pt-2", "pt-3"]);
    expect(resumed.session.log_hash).toBe(snap.session.log_hash);
  });

  it("a resent command id is answered from the log: the tasks are not seeded twice", () => {
    const session = loadSession(planless, tmp("publish-var"));
    const command = cmd("planner", "PUBLISH_PLAN", { plan, stop_tasks: AUTHORED });
    const first = session.apply(command, "c-plan");
    const again = session.apply(command, "c-plan");
    expect(again.result).toEqual(first.result);
    expect(again.events).toEqual([]);
    expect(session.snapshot([]).tasks).toHaveLength(3);
  });
});

describe("the task library is in every SNAPSHOT (FR-54, BD-90)", () => {
  const ROLES: Role[] = ["presenter", "planner", "eva:EV1", "eva:EV2", "hud:EV1", "hud:EV2", "ops", "earth"];

  async function snapshotFor(url: string, role: Role, client_id: string): Promise<Snapshot> {
    const ws = new WebSocket(`${url.replace(/^http/, "ws")}/ws`);
    open.sockets.push(ws);
    const got = new Promise<Snapshot>((resolve, reject) => {
      ws.on("message", (raw) => {
        const m = JSON.parse(raw.toString()) as ServerMessage;
        if (m.type === "SNAPSHOT") resolve(m);
      });
      ws.once("error", reject);
    });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    const hello: ClientMessage = { v: 1, type: "HELLO", role, client_id, display_name: "", last_seq: 0 };
    ws.send(JSON.stringify(hello));
    return got;
  }

  async function serve(scenario: LoadedScenario): Promise<string> {
    const varDir = tmp("library-var");
    const server = await startServer({ site: "mock_site", port: 0, host: "127.0.0.1", session: loadSession(scenario, varDir) } as Parameters<typeof startServer>[0]);
    open.close.push(() => server.close());
    return server.url;
  }

  it("every role receives the scenario's task_library unchanged", async () => {
    const url = await serve(planless);
    expect(planless.taskLibrary.length).toBeGreaterThan(0);
    for (const [i, role] of ROLES.entries()) {
      const snap = await snapshotFor(url, role, `c-lib-${i}`);
      expect(snap.task_library, role).toEqual(planless.taskLibrary);
    }
  });

  it("a scenario with no task_library gives []", async () => {
    const none = planlessScenario((s) => {
      delete s.task_library;
    });
    const snap = await snapshotFor(await serve(none), "planner", "c-lib-none");
    expect(snap.task_library).toEqual([]);
  });

  it("the library does not change when a plan with tasks is published (it is static scenario data)", () => {
    const session = loadSession(planless, tmp("library-var"));
    const before = session.snapshot([]).task_library;
    session.apply(cmd("planner", "PUBLISH_PLAN", { plan, stop_tasks: AUTHORED }), "c-plan");
    expect(session.snapshot([]).task_library).toEqual(before);
  });
});
