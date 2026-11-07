/**
 * T23.01: command validation and rejections (docs/specs/02 §E.4, §E.6; 05 Command; FR-31).
 * FR-50 command cases live in stopTasks.test.ts (T31.03); summon cases in T23.04.
 *
 * Rules fixed here for T23.02 (proposed 2026-11-07 by the owner where 02 is silent):
 * - Checks run in the order role → link → args → state; the first failure is the result. An
 *   unknown command kind is malformed and INVALID before any other check.
 * - "self" (02 §E.4) for an EVA role: SUMMON_VEHICLE `args.crew` must include its own crew id;
 *   ACK_ALERT needs its crew id among the alert's `subjects`.
 * - NO_LINK applies to EVA roles only, when their suit is unlinked (02 §E.6).
 * - A rejection logs one COMMAND_REJECTED {code, message} with the issuing role as actor and the
 *   command's `command_ref`; the state is unchanged.
 * - An accepted command's events carry its `command_ref`; `event_seq` is the first of them.
 */
import { describe, expect, it } from "vitest";
import type { Command, CommandResult, LogEvent, LogEventData, LogEventKind, Role } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand, type CommandContext } from "../src/commands";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import { readScenario } from "../src/scenario";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const T0 = fake.scenario.start_utc;

let n = 0;
function cmd(role: Role, kind: Command["kind"], args: Record<string, unknown> = {}, command_id = `k-${++n}`): Command {
  return { command_id, role, kind, args };
}

function ctx(state: EngineState, accepted = new AcceptedCommands(), client_id = "c-1"): CommandContext {
  return { scenario: fake, client_id, next_seq: state.session.last_seq + 1, accepted };
}

function apply(state: EngineState, kind: LogEventKind, data: LogEventData[LogEventKind], actor: Role | "system" = "system"): EngineState {
  const event: LogEvent = { seq: state.session.last_seq + 1, sim_time: T0, kind, actor, data: data as Record<string, unknown>, provenance: {}, command_ref: null };
  return reduce(state, event);
}

const loaded = initialState(fake, "s-0001");
const running = apply(loaded, "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops");
const withAlert = apply(running, "ALERT_RAISED", { alert_id: "a-2", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "Radiation surge — shelter now" });
const ev2Only = apply(running, "ALERT_RAISED", { alert_id: "a-2", code: "BUDDY_SEPARATION", level: "caution", subjects: ["EV2"], message: "Buddy too far — close up" });
const ev1Unlinked = apply(withAlert, "LINK_LOST", { node_id: "EV1" });
const ended = apply(running, "EVA_ENDED", { crew_ids: ["EV1", "EV2"] }, "ops");

function rejected(result: CommandResult): Extract<CommandResult, { ok: false }>["code"] {
  expect(result.ok, JSON.stringify(result)).toBe(false);
  return (result as Extract<CommandResult, { ok: false }>).code;
}

describe("handleCommand: role check (02 §E.4)", () => {
  it("rejects a command from a role without permission with FORBIDDEN_ROLE", () => {
    expect(rejected(handleCommand(running, cmd("planner", "SET_CLOCK", { paused: true }), ctx(running)).result)).toBe("FORBIDDEN_ROLE");
    expect(rejected(handleCommand(loaded, cmd("eva:EV1", "START_EVA"), ctx(loaded)).result)).toBe("FORBIDDEN_ROLE");
    expect(rejected(handleCommand(withAlert, cmd("earth", "ACK_ALERT", { alert_id: "a-2" }), ctx(withAlert)).result)).toBe("FORBIDDEN_ROLE");
  });

  it("an EVA role may acknowledge only alerts about itself (self)", () => {
    expect(rejected(handleCommand(ev2Only, cmd("eva:EV1", "ACK_ALERT", { alert_id: "a-2" }), ctx(ev2Only)).result)).toBe("FORBIDDEN_ROLE");
    expect(handleCommand(ev2Only, cmd("eva:EV2", "ACK_ALERT", { alert_id: "a-2" }), ctx(ev2Only)).result.ok).toBe(true);
    expect(handleCommand(ev2Only, cmd("ops", "ACK_ALERT", { alert_id: "a-2" }), ctx(ev2Only)).result.ok).toBe(true);
  });

  it("an EVA role may summon only for a crew list that includes itself (self)", () => {
    expect(rejected(handleCommand(running, cmd("eva:EV1", "SUMMON_VEHICLE", { crew: ["EV2"] }), ctx(running)).result)).toBe("FORBIDDEN_ROLE");
  });
});

describe("handleCommand: link check (02 §E.6)", () => {
  it("rejects an EVA command while that suit is unlinked with NO_LINK", () => {
    expect(rejected(handleCommand(ev1Unlinked, cmd("eva:EV1", "ACK_ALERT", { alert_id: "a-2" }), ctx(ev1Unlinked)).result)).toBe("NO_LINK");
  });

  it("the buddy's and ops' commands are not affected by EV1's link", () => {
    expect(handleCommand(ev1Unlinked, cmd("eva:EV2", "ACK_ALERT", { alert_id: "a-2" }), ctx(ev1Unlinked)).result.ok).toBe(true);
    expect(handleCommand(ev1Unlinked, cmd("ops", "ACK_ALERT", { alert_id: "a-2" }), ctx(ev1Unlinked)).result.ok).toBe(true);
  });
});

describe("handleCommand: args check (INVALID)", () => {
  it("rejects bad SET_CLOCK args with INVALID", () => {
    expect(rejected(handleCommand(running, cmd("ops", "SET_CLOCK", { speed: 5 }), ctx(running)).result)).toBe("INVALID");
    expect(rejected(handleCommand(running, cmd("ops", "SET_CLOCK", {}), ctx(running)).result)).toBe("INVALID");
  });

  it("rejects ACK_ALERT for an unknown or already acknowledged alert with INVALID", () => {
    expect(rejected(handleCommand(withAlert, cmd("ops", "ACK_ALERT", { alert_id: "a-99" }), ctx(withAlert)).result)).toBe("INVALID");
    const acked = apply(withAlert, "ALERT_ACKED", { alert_id: "a-2", acked_by: "ops" }, "ops");
    expect(rejected(handleCommand(acked, cmd("ops", "ACK_ALERT", { alert_id: "a-2" }), ctx(acked)).result)).toBe("INVALID");
  });

  it("rejects INJECT_EVENT without a level or with a message over 60 characters with INVALID (04 §D.2)", () => {
    expect(rejected(handleCommand(running, cmd("ops", "INJECT_EVENT", { message: "Dust devil nearby" }), ctx(running)).result)).toBe("INVALID");
    expect(rejected(handleCommand(running, cmd("ops", "INJECT_EVENT", { level: "caution", message: "x".repeat(61) }), ctx(running)).result)).toBe("INVALID");
  });

  it("rejects an unknown command kind with INVALID", () => {
    expect(rejected(handleCommand(running, cmd("ops", "NOT_A_COMMAND" as Command["kind"]), ctx(running)).result)).toBe("INVALID");
  });
});

describe("handleCommand: state check (BUSY)", () => {
  it("rejects START_EVA once the EVA has started with BUSY", () => {
    expect(rejected(handleCommand(running, cmd("ops", "START_EVA"), ctx(running)).result)).toBe("BUSY");
  });

  it("rejects SET_CLOCK after the EVA ended, and LOAD_SCENARIO during it, with BUSY", () => {
    expect(rejected(handleCommand(ended, cmd("ops", "SET_CLOCK", { paused: true }), ctx(ended)).result)).toBe("BUSY");
    expect(rejected(handleCommand(running, cmd("ops", "LOAD_SCENARIO", { scenario_id: "fake-straight-line" }), ctx(running)).result)).toBe("BUSY");
  });

  it("checks run in the order role → link → args → state", () => {
    // Unlinked EV1 sending a forbidden command: the role check wins.
    expect(rejected(handleCommand(ev1Unlinked, cmd("eva:EV1", "START_EVA"), ctx(ev1Unlinked)).result)).toBe("FORBIDDEN_ROLE");
    // Unlinked EV1 with bad args: the link check wins.
    expect(rejected(handleCommand(ev1Unlinked, cmd("eva:EV1", "ACK_ALERT", {}), ctx(ev1Unlinked)).result)).toBe("NO_LINK");
    // Bad args in a state that forbids the command: the args check wins.
    expect(rejected(handleCommand(ended, cmd("ops", "SET_CLOCK", { speed: 5 }), ctx(ended)).result)).toBe("INVALID");
  });
});

describe("handleCommand: results and events (02 §E.6, 05 Command)", () => {
  it("a rejected command changes nothing and logs one COMMAND_REJECTED", () => {
    const before = structuredClone(running);
    const c = cmd("ops", "START_EVA");
    const out = handleCommand(running, c, ctx(running));
    expect(running).toEqual(before);
    expect(out.events).toEqual([
      expect.objectContaining({ kind: "COMMAND_REJECTED", actor: "ops", sim_time: running.session.clock.sim_time, data: { code: "BUSY", message: expect.any(String) }, command_ref: { client_id: "c-1", command_id: c.command_id } }),
    ]);
    expect(out.result).toMatchObject({ v: 1, type: "COMMAND_RESULT", command_id: c.command_id, ok: false, code: "BUSY" });
  });

  it("an accepted command returns event_seq, and its events carry its command_ref and role", () => {
    const c = cmd("ops", "START_EVA");
    const out = handleCommand(loaded, c, ctx(loaded));
    expect(out.result).toEqual({ v: 1, type: "COMMAND_RESULT", command_id: c.command_id, ok: true, event_seq: loaded.session.last_seq + 1 });
    expect(out.events).toEqual([
      expect.objectContaining({ kind: "EVA_STARTED", actor: "ops", data: { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, command_ref: { client_id: "c-1", command_id: c.command_id } }),
    ]);
  });

  it("commands are never logged themselves, only the events they produce", () => {
    const kinds = new Set<string>(["START_EVA", "SET_CLOCK", "ACK_ALERT", "INJECT_EVENT"]);
    const outs = [
      handleCommand(loaded, cmd("ops", "START_EVA"), ctx(loaded)),
      handleCommand(running, cmd("ops", "SET_CLOCK", { speed: 10 }), ctx(running)),
      handleCommand(withAlert, cmd("ops", "ACK_ALERT", { alert_id: "a-2" }), ctx(withAlert)),
      handleCommand(running, cmd("ops", "INJECT_EVENT", { level: "caution", message: "Dust devil nearby" }), ctx(running)),
    ];
    for (const out of outs) for (const e of out.events) expect(kinds.has(e.kind), e.kind).toBe(false);
  });

  it("SET_CLOCK logs CLOCK_CHANGED with the new speed and the current paused flag", () => {
    const out = handleCommand(running, cmd("ops", "SET_CLOCK", { speed: 10 }), ctx(running));
    expect(out.events.map((e) => [e.kind, e.data])).toEqual([["CLOCK_CHANGED", { speed: 10, paused: running.session.clock.paused }]]);
  });

  it("ACK_ALERT logs ALERT_ACKED with the acknowledging role", () => {
    const out = handleCommand(withAlert, cmd("eva:EV1", "ACK_ALERT", { alert_id: "a-2" }), ctx(withAlert));
    expect(out.events.map((e) => [e.kind, e.data, e.actor])).toEqual([["ALERT_ACKED", { alert_id: "a-2", acked_by: "eva:EV1" }, "eva:EV1"]]);
  });

  it("INJECT_EVENT raises an INJECTED alert with alert_id a-<seq> (05 Alert)", () => {
    const c = ctx(running);
    const out = handleCommand(running, cmd("ops", "INJECT_EVENT", { level: "caution", message: "Dust devil nearby", subjects: ["EV1"] }), c);
    expect(out.events).toEqual([
      expect.objectContaining({ kind: "ALERT_RAISED", actor: "ops", data: { alert_id: `a-${c.next_seq}`, code: "INJECTED", level: "caution", subjects: ["EV1"], message: "Dust devil nearby" } }),
    ]);
  });

  it("PUBLISH_PLAN logs PLAN_REVISED with the whole plan and its waypoints and legs (decided 2026-11-07)", () => {
    const plan = { ...fake.scenario.plan, plan_hash: "abcdef012345" };
    const out = handleCommand(loaded, cmd("planner", "PUBLISH_PLAN", { plan }), ctx(loaded));
    expect(out.result.ok).toBe(true);
    expect(out.events.map((e) => [e.kind, e.data])).toEqual([
      ["PLAN_REVISED", { plan_revision: loaded.session.plan_revision + 1, option_id: null, stops_dropped: [], waypoints: plan.waypoints, legs: plan.result.legs, plan }],
    ]);
    expect(reduce(loaded, logged(out.events[0], 1)).plan).toEqual(plan);
  });

  it("rejects PUBLISH_PLAN without waypoints or legs with INVALID", () => {
    const noLegs = { ...fake.scenario.plan, result: { ...fake.scenario.plan.result, legs: undefined } };
    expect(rejected(handleCommand(loaded, cmd("planner", "PUBLISH_PLAN", { plan: noLegs }), ctx(loaded)).result)).toBe("INVALID");
    const noWaypoints = { ...fake.scenario.plan, waypoints: undefined };
    expect(rejected(handleCommand(loaded, cmd("planner", "PUBLISH_PLAN", { plan: noWaypoints }), ctx(loaded)).result)).toBe("INVALID");
  });

  it("LOAD_SCENARIO and JUMP_NEXT_EVENT are accepted with a session effect and no events of their own", () => {
    const load = handleCommand(loaded, cmd("ops", "LOAD_SCENARIO", { scenario_id: "fake-straight-line" }), ctx(loaded));
    expect(load.events).toEqual([]);
    expect(load.effect).toEqual({ kind: "load", scenario_id: "fake-straight-line" });
    const jump = handleCommand(running, cmd("ops", "JUMP_NEXT_EVENT"), ctx(running));
    expect(jump.effect).toEqual({ kind: "jump" });
  });
});

describe("handleCommand: repeated command_id (05 Command, decided 2026-11-07)", () => {
  it("an accepted command_id repeated by the same client gets the first COMMAND_RESULT and logs nothing", () => {
    const accepted = new AcceptedCommands();
    const c = cmd("ops", "SET_CLOCK", { speed: 10 });
    const first = handleCommand(running, c, ctx(running, accepted));
    accepted.record("c-1", c.command_id, first.result);
    const advanced = apply(running, "CLOCK_CHANGED", { speed: 10, paused: false }, "ops");
    const again = handleCommand(advanced, { ...c, queued_offline: true }, ctx(advanced, accepted));
    expect(again.result).toEqual(first.result);
    expect(again.events).toEqual([]);
  });

  it("the same command_id from another client runs normally", () => {
    const accepted = new AcceptedCommands();
    const c = cmd("ops", "SET_CLOCK", { speed: 10 });
    accepted.record("c-1", c.command_id, handleCommand(running, c, ctx(running, accepted)).result);
    const other = handleCommand(running, c, ctx(running, accepted, "c-2"));
    expect(other.events.map((e) => e.kind)).toEqual(["CLOCK_CHANGED"]);
  });

  it("a rejected command_id may be retried and is evaluated afresh", () => {
    const accepted = new AcceptedCommands();
    const c = cmd("eva:EV1", "ACK_ALERT", { alert_id: "a-2" });
    const first = handleCommand(ev1Unlinked, c, ctx(ev1Unlinked, accepted));
    expect(rejected(first.result)).toBe("NO_LINK");
    accepted.record("c-1", c.command_id, first.result); // rejected results are not remembered
    const relinked = apply(ev1Unlinked, "LINK_RESTORED", { node_id: "EV1" });
    const retry = handleCommand(relinked, { ...c, queued_offline: true }, ctx(relinked, accepted));
    expect(retry.result.ok).toBe(true);
    expect(retry.events.map((e) => e.kind)).toEqual(["ALERT_ACKED"]);
  });

  it("the accepted command_ids are rebuilt from the log's command_ref after a restart", () => {
    const pending: PendingEvent[] = [
      { sim_time: T0, kind: "EVA_STARTED", actor: "ops", data: { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, provenance: {}, command_ref: { client_id: "c-1", command_id: "k-a" } },
      { sim_time: T0, kind: "COMMAND_REJECTED", actor: "ops", data: { code: "BUSY", message: "EVA already started" }, provenance: {}, command_ref: { client_id: "c-1", command_id: "k-b" } },
      { sim_time: T0, kind: "LINK_LOST", actor: "system", data: { node_id: "EV1" }, provenance: {}, command_ref: null },
    ];
    const log: LogEvent[] = pending.map((p, i) => logged(p, 10 + i));
    const accepted = AcceptedCommands.fromLog(log);
    expect(accepted.get("c-1", "k-a")).toEqual({ v: 1, type: "COMMAND_RESULT", command_id: "k-a", ok: true, event_seq: 10 });
    expect(accepted.get("c-1", "k-b")).toBeUndefined();
    expect(accepted.get("c-2", "k-a")).toBeUndefined();
  });
});

describe("handleCommand: delegated commands (T23.04/T23.05)", () => {
  // Summon behaviour is tested with its handler in TASK-23 (T23.04); kept here as the original todos.
  it.todo("SUMMON_VEHICLE produces VEHICLE_DISPATCHED with a rendezvous");
  it.todo("SUMMON_VEHICLE with no rendezvous returns NO_RENDEZVOUS and leaves state unchanged");
});
