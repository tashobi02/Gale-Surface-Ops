/**
 * QoL Q2 (docs/plan/qol/README.md): SET_CREW_MOTION, a simulation control (02 §E.4, §E.6; 05 Command, LogEvent).
 * Runs on the fake scenario (F8). Every number compared is read from the same state, never typed in.
 *
 * Rules fixed here (decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 13 Nov 2026):
 * - HOLD: from WALKING or AT_STOP (and not waiting out `start_offset_s`) the activity becomes HOLDING, position and walk
 *   progress freeze; O2, dose and EVA time keep running at the resting rate in the suit. RESUME: back to WALKING, or AT_STOP
 *   when the hold began inside a stop dwell, and the walk continues from the same point.
 * - Allowed: `eva:EVn` for its own crew member, `ops` for either. Everyone else is FORBIDDEN_ROLE.
 * - INVALID: unknown crew id, motion other than HOLD or RESUME, HOLD when not walking or at a stop, RESUME when not HOLDING.
 * - BUSY outside RUNNING or PAUSED.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Command, CommandResult, CrewId, LogEvent, LogEventData, Role } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand, type CommandContext } from "../src/commands";
import { canonicalJson } from "../src/log";
import { initialState, logged, reduce, type EngineState } from "../src/engine/reducer";
import { tick } from "../src/engine/tick";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { pr1Params, rendezvousRidge, ridgeScenario } from "../../../packages/compute/tests/fixtures/v2grids";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const T0 = Date.parse(fake.scenario.start_utc);
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

let n = 0;
const cmd = (role: Role, crew_id: unknown, motion: unknown): Command => ({ command_id: `m-${++n}`, role, kind: "SET_CREW_MOTION", args: { crew_id, motion } });
const ctx = (s: EngineState): CommandContext => ({ scenario: fake, client_id: "c-1", next_seq: s.session.last_seq + 1, accepted: new AcceptedCommands() });

function eva(scenario: LoadedScenario = fake): EngineState {
  const e: LogEvent = { seq: 1, sim_time: fake.scenario.start_utc, kind: "EVA_STARTED", actor: "ops", data: { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, provenance: {}, command_ref: null };
  return reduce(initialState(scenario, "s-0001"), e);
}

/** One 1 s step: the clock advances first, as the session does, then the tick; the state already holds its events. */
function step(s: EngineState): EngineState {
  const t = Date.parse(s.session.clock.sim_time) + 1000;
  const advanced = { ...s, session: { ...s.session, clock: { ...s.session.clock, sim_time: iso(t) } } };
  return tick(advanced, fake, 1, advanced.session.last_seq + 1).state;
}
const steps = (s: EngineState, count: number): EngineState => Array.from({ length: count }).reduce<EngineState>((acc) => step(acc), s);

/** Send a command and reduce what it logged. */
function send(s: EngineState, command: Command): { state: EngineState; result: CommandResult; events: LogEvent[] } {
  const out = handleCommand(s, command, ctx(s));
  const events = out.events.map((e, i) => logged({ ...e, sim_time: s.session.clock.sim_time }, s.session.last_seq + 1 + i));
  return { state: events.reduce(reduce, s), result: out.result, events };
}
const crew = (s: EngineState, id: CrewId) => s.crew.find((c) => c.crew_id === id)!;
const code = (r: CommandResult): string => (r.ok ? "ok" : r.code);

/** EV1 walking, a few seconds out. */
const walking = (): EngineState => steps(eva(), 5);

describe("SET_CREW_MOTION: engine", () => {
  it("HOLD freezes the position over N ticks while O2, dose and EVA time keep running; RESUME moves again", () => {
    const s0 = walking();
    expect(crew(s0, "EV1").activity).toBe("WALKING");
    const held = send(s0, cmd("eva:EV1", "EV1", "HOLD"));
    expect(held.result.ok).toBe(true);
    expect(crew(held.state, "EV1").activity).toBe("HOLDING");
    const at = { x_m: crew(held.state, "EV1").x_m, y_m: crew(held.state, "EV1").y_m };
    const later = steps(held.state, 30);
    const a = crew(later, "EV1");
    expect({ x_m: a.x_m, y_m: a.y_m }).toEqual(at);
    expect(a.activity).toBe("HOLDING");
    expect(a.o2_frac).toBeLessThan(crew(held.state, "EV1").o2_frac);
    expect(a.eva_elapsed_s).toBeGreaterThan(crew(held.state, "EV1").eva_elapsed_s);
    expect(a.dose_event_ugy).toBeGreaterThan(crew(held.state, "EV1").dose_event_ugy);
    // The other crew member keeps walking.
    expect(crew(later, "EV2").x_m).not.toBe(crew(held.state, "EV2").x_m);

    const resumed = send(later, cmd("eva:EV1", "EV1", "RESUME"));
    expect(resumed.result.ok).toBe(true);
    expect(crew(resumed.state, "EV1").activity).toBe("WALKING");
    const after = steps(resumed.state, 10);
    expect(crew(after, "EV1").x_m).not.toBe(at.x_m);
  });

  it("RESUME continues the plan from the held point: no jump, same route as an unheld walk would take", () => {
    const held = send(walking(), cmd("ops", "EV1", "HOLD")).state;
    const resumed = send(steps(held, 40), cmd("ops", "EV1", "RESUME")).state;
    const here = crew(resumed, "EV1");
    const next = crew(step(resumed), "EV1");
    // One step covers at most a few metres: the leg walked on, it did not restart.
    expect(Math.hypot(next.x_m - here.x_m, next.y_m - here.y_m)).toBeLessThan(10);
    expect(next.stop_index).toBe(here.stop_index);
  });

  it("a hold inside a stop dwell resumes as AT_STOP and the dwell does not advance while held", () => {
    // Walk until EV1 stands at a stop.
    let s = eva();
    for (let i = 0; i < 20_000 && crew(s, "EV1").activity !== "AT_STOP"; i++) s = step(s);
    expect(crew(s, "EV1").activity).toBe("AT_STOP");
    const t_before = s.motion.EV1!.t_s;
    const held = send(s, cmd("eva:EV1", "EV1", "HOLD")).state;
    const later = steps(held, 50);
    expect(later.motion.EV1!.t_s).toBe(t_before);
    expect(crew(send(later, cmd("eva:EV1", "EV1", "RESUME")).state, "EV1").activity).toBe("AT_STOP");
  });

  it("logs CREW_MOTION_SET { crew_id, motion, actor } with the command's actor", () => {
    const { events } = send(walking(), cmd("eva:EV1", "EV1", "HOLD"));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("CREW_MOTION_SET");
    expect(events[0].actor).toBe("eva:EV1");
    expect(events[0].data).toEqual({ crew_id: "EV1", motion: "HOLD", actor: "eva:EV1" } satisfies LogEventData["CREW_MOTION_SET"]);
  });

  it("is deterministic: the same commands and ticks give the same state, and the state survives a JSON round trip", () => {
    const run = (): EngineState => {
      let s = walking();
      s = send(s, cmd("eva:EV1", "EV1", "HOLD")).state;
      s = steps(s, 25);
      s = send(s, cmd("ops", "EV1", "RESUME")).state;
      return steps(s, 25);
    };
    expect(canonicalJson(run())).toBe(canonicalJson(run()));
    const mid = steps(send(walking(), cmd("ops", "EV1", "HOLD")).state, 5);
    const restored = JSON.parse(JSON.stringify(mid)) as EngineState;
    expect(canonicalJson(steps(restored, 5))).toBe(canonicalJson(steps(mid, 5)));
  });
});

describe("SET_CREW_MOTION: permissions and checks", () => {
  const s = walking();
  it("allows the crew member's own role and ops", () => {
    expect(code(send(s, cmd("eva:EV1", "EV1", "HOLD")).result)).toBe("ok");
    expect(code(send(s, cmd("eva:EV2", "EV2", "HOLD")).result)).toBe("ok");
    expect(code(send(s, cmd("ops", "EV2", "HOLD")).result)).toBe("ok");
  });
  it("rejects the other crew member and every other role with FORBIDDEN_ROLE", () => {
    expect(code(send(s, cmd("eva:EV2", "EV1", "HOLD")).result)).toBe("FORBIDDEN_ROLE");
    expect(code(send(s, cmd("eva:EV1", "EV2", "HOLD")).result)).toBe("FORBIDDEN_ROLE");
    for (const role of ["hud:EV1", "hud:EV2", "planner", "earth", "presenter"] as const) {
      expect(code(send(s, cmd(role, "EV1", "HOLD")).result), role).toBe("FORBIDDEN_ROLE");
    }
  });
  it("rejects bad args, wrong activity and the wrong session status", () => {
    expect(code(send(s, cmd("ops", "EV9", "HOLD")).result)).toBe("INVALID");
    expect(code(send(s, cmd("ops", "EV1", "STOP")).result)).toBe("INVALID");
    expect(code(send(s, cmd("ops", undefined, undefined)).result)).toBe("INVALID");
    expect(code(send(s, cmd("ops", "EV1", "RESUME")).result), "not holding").toBe("INVALID");
    const held = send(s, cmd("ops", "EV1", "HOLD")).state;
    expect(code(send(held, cmd("ops", "EV1", "HOLD")).result), "already holding").toBe("INVALID");
    const inHab = initialState(fake, "s-0002");
    expect(code(send(inHab, cmd("ops", "EV1", "HOLD")).result)).toBe("BUSY");
    const toHaven = { ...s, crew: s.crew.map((c) => ({ ...c, activity: "TO_HAVEN" as const })) };
    expect(code(send(toHaven, cmd("ops", "EV1", "HOLD")).result), "never holds a crew member heading for shelter").toBe("INVALID");
  });
  it("a rejected command logs COMMAND_REJECTED and leaves the state alone", () => {
    const r = send(s, cmd("hud:EV1", "EV1", "HOLD"));
    expect(r.events.map((e) => e.kind)).toEqual(["COMMAND_REJECTED"]);
    expect(crew(r.state, "EV1").activity).toBe("WALKING");
  });
});

describe("SET_CREW_MOTION: summoning while holding (the reason the control exists)", () => {
  // The synthetic F9 ridge fixture, as in summonReal.test.ts: the real compute finds the rendezvous.
  const ridge = rendezvousRidge(5);
  const sc: LoadedScenario = {
    ...fake,
    grid: ridge.grid,
    scenario: { ...fake.scenario, plan: { ...fake.scenario.plan!, scenario: ridgeScenario() } },
    params: { ...fake.params, [pr1Params.param_set_id]: pr1Params },
  };
  const pr1 = fake.scenario.vehicles.find((v) => v.kind === "pressurized_rover")!.vehicle_id;

  it("accepts SUMMON_VEHICLE from the held crew member and dispatches the rover", () => {
    let s = eva(sc);
    s = { ...s, vehicles: s.vehicles.map((v) => (v.vehicle_id === pr1 ? { ...v, x_m: ridge.shape.vehicle.x_m, y_m: ridge.shape.vehicle.y_m, param_set: pr1Params.param_set_id } : v)) };
    s = { ...s, crew: s.crew.map((c) => (c.crew_id === "EV1" ? { ...c, x_m: ridge.shape.crew.x_m, y_m: ridge.shape.crew.y_m } : c)) };
    const held = handleCommand(s, cmd("eva:EV1", "EV1", "HOLD"), { ...ctx(s), scenario: sc });
    expect(held.result.ok, JSON.stringify(held.result)).toBe(true);
    const state = held.events.reduce((acc, e) => reduce(acc, logged(e, acc.session.last_seq + 1)), s);
    expect(crew(state, "EV1").activity).toBe("HOLDING");
    const summon: Command = { command_id: "sv-1", role: "eva:EV1", kind: "SUMMON_VEHICLE", args: { crew: ["EV1"] } };
    const out = handleCommand(state, summon, { ...ctx(state), scenario: sc });
    expect(out.result.ok, JSON.stringify(out.result)).toBe(true);
    expect(out.events.map((e) => e.kind)).toEqual(["VEHICLE_DISPATCHED"]);
  });
});
