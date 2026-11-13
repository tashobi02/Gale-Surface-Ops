/**
 * QoL Q3 (docs/plan/qol/README.md): RIDE_VEHICLE, a crew member rides the pressurized rover to a later stop of the plan.
 * Proposed 2026-11-13, decided by Sadman Shaharier Mahim; small choices in docs/plan/qol/decisions.md (QD-008 to QD-013).
 *
 * Real compute on the synthetic F9 flat world (5 m cells, no wall here). Expected values come from the ParamSet and the
 * declared shape: the stop is on the flat line y = 0, so the drive takes distance / flat_speed seconds. Nothing is typed in
 * as a science number. The fake scenario's plan has its first stop at (1000, 0).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LoadedGrid } from "@marswalk/compute";
import { PERMISSIONS, type Command, type CrewId, type LogEvent, type ParamSet, type Role } from "@marswalk/protocol";
import { losFlatWall } from "../../../packages/compute/tests/fixtures/v2grids";
import { AcceptedCommands, handleCommand } from "../src/commands";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import { tick } from "../src/engine/tick";
import { readScenario, type LoadedScenario } from "../src/scenario";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const read = (name: string): ParamSet => JSON.parse(readFileSync(join(here, "../../../scenarios/storm-sol4190/param_sets", name), "utf8")) as ParamSet;
const pr1 = read("pr1-assumed.json");
const ur1 = read("ur1-assumed.json");
const V_MS = (pr1.values as Record<string, number>).flat_speed_kmh / 3.6;

/** Flat ground everywhere (the F9 wall column is levelled), so the route length is the straight distance. */
function flatGrid(): LoadedGrid {
  const g = losFlatWall().grid;
  g.elevation.fill(0);
  return g;
}
const grid = flatGrid();
const sc: LoadedScenario = {
  ...fake,
  grid,
  scenario: { ...fake.scenario, vehicles: [...fake.scenario.vehicles, { vehicle_id: "UR1", kind: "utility_rover", param_set: ur1.param_set_id, start_x_m: 0, start_y_m: 0 }] },
  params: { ...fake.params, [ur1.param_set_id]: ur1 },
};
const STOP_1 = sc.scenario.plan!.waypoints.filter((w) => w.role === "stop")[0]!;

const T0 = Date.parse(sc.scenario.start_utc);
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");
const applyAll = (s: EngineState, events: readonly PendingEvent[]): EngineState => events.reduce((acc, e) => reduce(acc, logged(e, acc.session.last_seq + 1)), s);

/** EVA running for EV1 only (EV2 stays in the hab, so no second walker). */
function running(crew: CrewId[] = ["EV1"]): EngineState {
  return reduce(initialState(sc, "s-0001"), { seq: 1, sim_time: iso(T0), kind: "EVA_STARTED", actor: "ops", data: { crew_ids: crew, plan_revision: 1 }, provenance: {}, command_ref: null });
}

let n = 0;
interface Sent {
  state: EngineState;
  ok: boolean;
  code?: string;
  events: PendingEvent[];
}
function send(s: EngineState, args: Record<string, unknown>, role: Role = "eva:EV1"): Sent {
  const command: Command = { command_id: `ride-${++n}`, role, kind: "RIDE_VEHICLE", args };
  const out = handleCommand(s, command, { scenario: sc, client_id: "c1", next_seq: s.session.last_seq + 1, accepted: new AcceptedCommands() });
  const state = applyAll(s, out.events);
  return out.result.ok ? { state, ok: true, events: out.events } : { state, ok: false, code: out.result.code, events: out.events };
}
const ride = { crew_id: "EV1", vehicle_id: "PR1", to_stop_id: STOP_1.id };

function step(s: EngineState): { state: EngineState; events: PendingEvent[] } {
  const moved: EngineState = { ...s, session: { ...s.session, clock: { ...s.session.clock, sim_time: iso(Date.parse(s.session.clock.sim_time) + 1000) } } };
  const r = tick(moved, sc, 1, s.session.last_seq + 1);
  return { state: r.state, events: r.events };
}
/** Tick until `done` (at most `limit` seconds); the events of every tick, in order. */
function until(s: EngineState, done: (s: EngineState) => boolean, limit = 2000): { state: EngineState; seconds: number; events: PendingEvent[] } {
  const events: PendingEvent[] = [];
  let seconds = 0;
  while (!done(s) && seconds < limit) {
    const r = step(s);
    events.push(...r.events);
    s = r.state;
    seconds++;
  }
  return { state: s, seconds, events };
}
const crewOf = (s: EngineState, id: CrewId = "EV1") => s.crew.find((c) => c.crew_id === id)!;
const pr = (s: EngineState) => s.vehicles.find((v) => v.vehicle_id === "PR1")!;
const kinds = (events: readonly Pick<PendingEvent, "kind">[]): string[] => events.map((e) => e.kind);

describe("RIDE_VEHICLE: board, ride, dismount", () => {
  it("logs CREW_BOARDED then VEHICLE_DISPATCHED, and the crew member is RIDING", () => {
    const r = send(running(), ride);
    expect(r.ok).toBe(true);
    expect(kinds(r.events)).toEqual(["CREW_BOARDED", "VEHICLE_DISPATCHED"]);
    expect(r.events[0]!.data).toEqual({ crew_id: "EV1", vehicle_id: "PR1", to_stop_id: STOP_1.id });
    expect(r.events[1]!.data).toMatchObject({ vehicle_id: "PR1", rendezvous: { x_m: STOP_1.x_m, y_m: STOP_1.y_m, eta_crew_s: 0 } });
    expect(crewOf(r.state).activity).toBe("RIDING");
    expect(pr(r.state)).toMatchObject({ state: "DISPATCHED", task: { kind: "RIDE", crew_ids: ["EV1"] } });
  });

  it("arrives AT_STOP at the stop after route length / ParamSet speed, with the log in order", () => {
    const start = send(running(), ride).state;
    const metres = Math.hypot(STOP_1.x_m - pr(start).x_m, STOP_1.y_m - pr(start).y_m);
    const expected_s = Math.round(metres / V_MS);

    // Mid-ride the crew member is where the vehicle is.
    const mid = until(start, (s) => pr(s).state === "EN_ROUTE" && (pr(s).eta_s ?? 0) <= expected_s / 2);
    expect(crewOf(mid.state)).toMatchObject({ activity: "RIDING", x_m: pr(mid.state).x_m, y_m: pr(mid.state).y_m });
    expect(crewOf(mid.state).x_m).toBeGreaterThan(0);

    const done = until(start, (s) => crewOf(s).activity === "AT_STOP");
    expect(done.seconds).toBe(expected_s);
    expect(crewOf(done.state)).toMatchObject({ activity: "AT_STOP", stop_index: 1, x_m: STOP_1.x_m, y_m: STOP_1.y_m });
    expect(pr(done.state)).toMatchObject({ state: "PARKED", x_m: STOP_1.x_m, y_m: STOP_1.y_m, task: null });
    expect(kinds(done.events).filter((k) => ["VEHICLE_ARRIVED", "CREW_DISMOUNTED", "ARRIVED_STOP", "CREW_SHELTERED"].includes(k))).toEqual(["VEHICLE_ARRIVED", "CREW_DISMOUNTED", "ARRIVED_STOP"]);
    const dismounted = done.events.find((e) => e.kind === "CREW_DISMOUNTED")!;
    expect(dismounted.data).toMatchObject({ crew_id: "EV1", vehicle_id: "PR1", stop_id: STOP_1.id, stop_index: 1, x_m: STOP_1.x_m, y_m: STOP_1.y_m });
  });

  it("the dismounted crew member dwells at the stop, then the walk continues from there", () => {
    const done = until(send(running(), ride).state, (s) => crewOf(s).activity === "AT_STOP").state;
    expect(done.motion.EV1).toMatchObject({ phase: "dwell", leg_index: 1, last_wp_id: STOP_1.id, t_s: 0 });
  });

  it("does not shelter the rider in the vehicle on arrival", () => {
    const all = until(send(running(), ride).state, (s) => crewOf(s).activity === "AT_STOP");
    const after = until(all.state, () => false, 5);
    expect(kinds([...all.events, ...after.events])).not.toContain("CREW_SHELTERED");
    expect(crewOf(after.state).activity).toBe("AT_STOP");
  });

  it("is deterministic: the same commands and ticks give the same events", () => {
    const run = (): string => {
      n = 0;
      const s = send(running(), ride);
      const r = until(s.state, (x) => crewOf(x).activity === "AT_STOP");
      return JSON.stringify([...s.events, ...r.events]);
    };
    expect(run()).toBe(run());
  });
});

describe("RIDE_VEHICLE: what is refused", () => {
  it("a utility rover cannot carry crew: INVALID, nothing logged", () => {
    const r = send(running(), { ...ride, vehicle_id: "UR1" });
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(kinds(r.events)).toEqual(["COMMAND_REJECTED"]);
    expect(crewOf(r.state).activity).toBe("WALKING");
  });

  it("bad arguments are INVALID", () => {
    const s = running();
    for (const args of [{}, { ...ride, crew_id: "EV9" }, { ...ride, vehicle_id: "XX" }, { ...ride, to_stop_id: "wp-nope" }, { ...ride, to_stop_id: "wp-0" }, { ...ride, to_stop_id: 7 }]) {
      expect(send(s, args, "ops"), JSON.stringify(args)).toMatchObject({ ok: false, code: "INVALID" });
    }
  });

  it("an EVA role may ride only as itself: another crew_id is FORBIDDEN_ROLE", () => {
    expect(send(running(["EV1", "EV2"]), { ...ride, crew_id: "EV2" }, "eva:EV1")).toMatchObject({ ok: false, code: "FORBIDDEN_ROLE" });
  });

  it("a stop already reached is INVALID", () => {
    const s = reduce(running(), { seq: 2, sim_time: iso(T0), kind: "ARRIVED_STOP", actor: "system", data: { crew_id: "EV1", stop_id: STOP_1.id, stop_index: 1 }, provenance: {}, command_ref: null });
    expect(send(s, ride)).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("a crew member who is not at the vehicle is INVALID", () => {
    const s = running();
    const away: EngineState = { ...s, crew: s.crew.map((c) => (c.crew_id === "EV1" ? { ...c, x_m: 200, y_m: 0 } : c)) };
    expect(send(away, ride)).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("a crew member in the hab is INVALID; the session must be running (BUSY)", () => {
    expect(send(running(), { ...ride, crew_id: "EV2" }, "ops")).toMatchObject({ ok: false, code: "INVALID" });
    expect(send(initialState(sc, "s-0001"), ride)).toMatchObject({ ok: false, code: "BUSY" });
  });

  it("a vehicle that is not parked, or a rider already aboard, is BUSY", () => {
    const first = send(running(), ride).state;
    expect(send(first, ride)).toMatchObject({ ok: false, code: "BUSY" });
  });
});

describe("RIDE_VEHICLE: permissions", () => {
  it("is in the eva and ops rows only", () => {
    const holders = Object.entries(PERMISSIONS).filter(([, kindsOf]) => kindsOf.includes("RIDE_VEHICLE")).map(([role]) => role).sort();
    expect(holders).toEqual(["eva:EV1", "eva:EV2", "ops"]);
  });

  it("ops and the own EVA role are accepted; the other EVA role, the HUD and the planner get FORBIDDEN_ROLE", () => {
    expect(send(running(), ride, "ops").ok).toBe(true);
    expect(send(running(), ride, "eva:EV1").ok).toBe(true);
    for (const role of ["eva:EV2", "hud:EV1", "planner", "presenter"] as Role[]) {
      expect(send(running(), ride, role), role).toMatchObject({ ok: false, code: "FORBIDDEN_ROLE" });
    }
  });
});

describe("RIDE_VEHICLE: log events type check", () => {
  it("CREW_BOARDED and CREW_DISMOUNTED are LogEvent kinds", () => {
    const e: LogEvent["kind"][] = ["CREW_BOARDED", "CREW_DISMOUNTED"];
    expect(e).toHaveLength(2);
  });
});
