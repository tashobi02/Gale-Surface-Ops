/**
 * T29.01 (backend package 19): the utility rover, TASK_ROVER, its FIFO queue, motion, battery and relay
 * (docs/specs/01 FR-41, FR-42; 02 §D.9, §D.11, §E.4; 05 Vehicle; backend decisions BD-102, BD-112, BD-131).
 *
 * Real compute on the synthetic F9 wall world (`fixtures/wallWorld.ts`: 5 m cells, flat ground, mast at the origin, a wall at
 * x = 500 for |y| <= 100). The rover UR1 starts at (600, 200), beside the wall, on flat ground: so every drive along y = 200 has
 * zero climb and the 02 §D.9 energy is exactly P_base * t. Expected values come from the ParamSet and the declared shape
 * (distance / speed, P_base * t); nothing is typed in as a science number.
 *
 * Rules checked (decided by the orchestrator under Sadman Shaharier Mahim's authority, 12 Nov 2026):
 * - BD-102: TASK_ROVER appends to a FIFO queue; the head is `Vehicle.task`, the rest `Vehicle.queue` with cumulative `eta_s` and
 *   `battery_wh_after`; an accepted task logs ONE `VEHICLE_DISPATCHED` with `task_id` `rt-<seq>`; `VEHICLE_ARRIVED` pops the head;
 *   a task whose predicted battery would go below 0 is INVALID. The ETAs and batteries are filled by the tick (the event has no field
 *   for them), so "logged with ETA and battery" means: the event, then the tick's `Vehicle.eta_s` and `queue`.
 * - BD-131: RETURN drives to the rover's start point and logs it as `target`; a RETURN given a target ignores it.
 * - BD-112: a RELAY rover parked on its target gets `relay_coverage_rev` (1, 2, ...), null while it is not parked as a relay.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { lineOfSight, vehicleTimeField, timeAt, type LoadedGrid } from "@marswalk/compute";
import type { Command, CrewId, LogEventData, OkLeg, ParamSet, Role, Vehicle } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand } from "../src/commands";
import { linksTick } from "../src/engine/links";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import { relayCoverageGrid, roversTick } from "../src/engine/rovers";
import type { TickContext, TickResult } from "../src/engine/tick";
import { handleTaskRover } from "../src/rover";
import { startServer } from "../src/server";
import { loadSession } from "../src/session";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { commLayer, partialWall } from "./fixtures/wallWorld";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const ur1 = JSON.parse(readFileSync(join(here, "../../../scenarios/storm-sol4190/param_sets/ur1-assumed.json"), "utf8")) as ParamSet;
const u = ur1.values as Record<string, number>;
const V_MS = u.flat_speed_kmh / 3.6;

const fx = partialWall();
const mast = fx.shape.mast;
const START = { x_m: 600, y_m: 200 };
const scenarioWith = (params: ParamSet, grid: LoadedGrid = fx.grid): LoadedScenario => ({
  ...fake,
  grid,
  comm: { comm_hab: commLayer(grid, mast, fx.shape.targetHeight_m), hab_mast: mast },
  scenario: { ...fake.scenario, vehicles: [...fake.scenario.vehicles, { vehicle_id: "UR1", kind: "utility_rover", param_set: params.param_set_id, start_x_m: START.x_m, start_y_m: START.y_m }] },
  params: { ...fake.params, [params.param_set_id]: params },
});
const sc = scenarioWith(ur1);

const T0 = Date.parse(sc.scenario.start_utc);
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

/** EVA running, rover parked at its start. */
function running(scenario: LoadedScenario = sc): EngineState {
  let s = initialState(scenario, "s-0001");
  s = reduce(s, { seq: 1, sim_time: iso(T0), kind: "EVA_STARTED", actor: "ops", data: { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, provenance: {}, command_ref: null });
  return s;
}

const applyAll = (s: EngineState, events: readonly PendingEvent[]): EngineState => events.reduce((acc, e) => reduce(acc, logged(e, acc.session.last_seq + 1)), s);

let n = 0;
interface Sent {
  state: EngineState;
  ok: boolean;
  code?: string;
  message?: string;
  events: PendingEvent[];
}
/** Send a TASK_ROVER through handleCommand and apply what it logged. */
function send(s: EngineState, args: Record<string, unknown>, role: Role = "ops", scenario: LoadedScenario = sc): Sent {
  const command: Command = { command_id: `r-${++n}`, role, kind: "TASK_ROVER", args };
  const out = handleCommand(s, command, { scenario, client_id: "c1", next_seq: s.session.last_seq + 1, accepted: new AcceptedCommands() });
  const next = applyAll(s, out.events);
  return out.result.ok ? { state: next, ok: true, events: out.events } : { state: next, ok: false, code: out.result.code, message: out.result.message, events: out.events };
}

const ctxOf = (s: EngineState, scenario: LoadedScenario = sc): TickContext => ({ scenario, dt_s: 1, next_seq: s.session.last_seq + 1 });

/** One sim second of the rover module, as tick.ts runs it: the clock moves, the module runs, its events are reduced. */
function step(s: EngineState, scenario: LoadedScenario = sc): { state: EngineState; result: TickResult } {
  const moved: EngineState = { ...s, session: { ...s.session, clock: { ...s.session.clock, sim_time: iso(Date.parse(s.session.clock.sim_time) + 1000) } } };
  const result = roversTick(moved, ctxOf(moved, scenario));
  return { state: applyAll(result.state, result.events), result };
}

/** Step until `done` holds (at most `limit` seconds). */
function until(s: EngineState, done: (s: EngineState) => boolean, limit = 4000, scenario: LoadedScenario = sc): { state: EngineState; seconds: number; events: PendingEvent[] } {
  const events: PendingEvent[] = [];
  let seconds = 0;
  while (!done(s) && seconds < limit) {
    const r = step(s, scenario);
    events.push(...r.result.events);
    s = r.state;
    seconds++;
  }
  return { state: s, seconds, events };
}

const ur = (s: EngineState): Vehicle => s.vehicles.find((v) => v.vehicle_id === "UR1")!;
const kinds = (events: readonly PendingEvent[], kind: string): PendingEvent[] => events.filter((e) => e.kind === kind);
const dist = (a: { x_m: number; y_m: number }, b: { x_m: number; y_m: number }): number => Math.hypot(b.x_m - a.x_m, b.y_m - a.y_m);
const etaOf = (m: number): number => Math.round(m / V_MS);
const whOf = (s: number): number => (u.p_base_w * s) / 3600;

const A = { x_m: 800, y_m: 200 };
const B = { x_m: 1000, y_m: 200 };

describe("TASK_ROVER: arguments and vehicle", () => {
  it("SCOUT, CARRY and RELAY without a target are INVALID; RETURN needs none", () => {
    const s = running();
    for (const task of ["SCOUT", "CARRY", "RELAY"]) {
      const r = send(s, { vehicle_id: "UR1", task });
      expect(r, task).toMatchObject({ ok: false, code: "INVALID" });
      expect(kinds(r.events, "VEHICLE_DISPATCHED")).toEqual([]);
    }
    expect(send(s, { vehicle_id: "UR1", task: "RETURN" }).ok).toBe(true);
  });

  it("a task that is not SCOUT, CARRY, RELAY or RETURN, a target that is not two finite numbers, or an item that is not text is INVALID", () => {
    const s = running();
    expect(send(s, { vehicle_id: "UR1", task: "DANCE", target: A })).toMatchObject({ ok: false, code: "INVALID" });
    expect(send(s, { vehicle_id: "UR1", task: "SCOUT", target: { x_m: "800", y_m: 200 } })).toMatchObject({ ok: false, code: "INVALID" });
    expect(send(s, { vehicle_id: "UR1", task: "SCOUT", target: { x_m: NaN, y_m: 200 } })).toMatchObject({ ok: false, code: "INVALID" });
    expect(send(s, { vehicle_id: "UR1", task: "SCOUT", target: { x_m: 800 } })).toMatchObject({ ok: false, code: "INVALID" });
    expect(send(s, { vehicle_id: "UR1", task: "CARRY", target: A, item: 7 })).toMatchObject({ ok: false, code: "INVALID" });
    expect(send(s, { vehicle_id: "UR1", task: "CARRY", target: A, item: "sample bag" }).ok).toBe(true);
  });

  it("tasking the pressurized rover or an unknown vehicle_id is INVALID", () => {
    const s = running();
    expect(send(s, { vehicle_id: "PR1", task: "SCOUT", target: A })).toMatchObject({ ok: false, code: "INVALID" });
    expect(send(s, { vehicle_id: "UR9", task: "SCOUT", target: A })).toMatchObject({ ok: false, code: "INVALID" });
    expect(send(s, { task: "SCOUT", target: A })).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("both EVA roles and ops may task the rover; planner and earth get FORBIDDEN_ROLE", () => {
    const s = running();
    for (const role of ["eva:EV1", "eva:EV2", "ops"] as Role[]) expect(send(s, { vehicle_id: "UR1", task: "SCOUT", target: A }, role).ok, role).toBe(true);
    for (const role of ["planner", "earth"] as Role[]) expect(send(s, { vehicle_id: "UR1", task: "SCOUT", target: A }, role), role).toMatchObject({ ok: false, code: "FORBIDDEN_ROLE" });
  });

  it("outside a running EVA the command is BUSY", () => {
    const loaded = initialState(sc, "s-0001");
    expect(send(loaded, { vehicle_id: "UR1", task: "SCOUT", target: A })).toMatchObject({ ok: false, code: "BUSY" });
  });

  it("a target with no passable route for the utility rover is INVALID and leaves the rover unchanged", () => {
    const s = running();
    const off = send(s, { vehicle_id: "UR1", task: "SCOUT", target: { x_m: 50_000, y_m: 0 } });
    expect(off).toMatchObject({ ok: false, code: "INVALID" });
    // A target the rover's slope limit forbids: no-data slope cells around it (255 is impassable, 02 §D.8).
    const walled = cloneGrid(fx.grid);
    const { meta } = walled;
    for (const dx of [-10, -5, 0, 5, 10, 15]) for (const dy of [-10, -5, 0, 5, 10, 15]) {
      const i = Math.floor((meta.origin_m[1] - (B.y_m + dy)) / meta.cell_m);
      const j = Math.floor((B.x_m + dx - meta.origin_m[0]) / meta.cell_m);
      walled.slopeP90[i * meta.width + j] = 255;
    }
    const blocked = scenarioWith(ur1, walled);
    const sb = running(blocked);
    const r = send(sb, { vehicle_id: "UR1", task: "SCOUT", target: B }, "ops", blocked);
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(ur(r.state)).toEqual(ur(sb));
    expect(ur(off.state)).toEqual(ur(s));
  });

  it("a scenario with no terrain grid answers INVALID", () => {
    const noGrid: LoadedScenario = { ...sc, grid: null, comm: null };
    expect(send(running(noGrid), { vehicle_id: "UR1", task: "SCOUT", target: A }, "ops", noGrid)).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("handleTaskRover can be called directly and gives the same answer as the dispatcher", () => {
    const s = running();
    const out = handleTaskRover(s, sc, { command_id: "d-1", role: "ops", kind: "TASK_ROVER", args: { vehicle_id: "UR1", task: "RELAY", target: A } }, s.session.last_seq + 1);
    expect(out.result.ok).toBe(true);
    expect(out.events).toHaveLength(1);
  });
});

describe("an accepted task is one VEHICLE_DISPATCHED event (BD-102)", () => {
  it("carries the vehicle, task, target, item, task_id rt-<seq>, the actor and the command reference", () => {
    const s = running();
    const command: Command = { command_id: "c-77", role: "eva:EV1", kind: "TASK_ROVER", args: { vehicle_id: "UR1", task: "CARRY", target: A, item: "sample bag" } };
    const out = handleCommand(s, command, { scenario: sc, client_id: "tab-1", next_seq: 42, accepted: new AcceptedCommands() });
    expect(out.result).toMatchObject({ ok: true, event_seq: 42 });
    expect(out.events).toHaveLength(1);
    const e = out.events[0]!;
    expect(e).toMatchObject({ kind: "VEHICLE_DISPATCHED", actor: "eva:EV1", command_ref: { client_id: "tab-1", command_id: "c-77" } });
    expect(e.data).toEqual({ vehicle_id: "UR1", task: "CARRY", target: A, item: "sample bag", task_id: "rt-42" });
    expect(e.provenance).toEqual({ "data.target": "assumed" });
  });

  it("the head becomes Vehicle.task (TASKED); RETURN logs the rover's start point as its target (BD-131) and ignores a given one", () => {
    const first = send(running(), { vehicle_id: "UR1", task: "RETURN", target: { x_m: 1, y_m: 1 } });
    expect(first.events[0]!.data).toMatchObject({ task: "RETURN", target: START });
    expect(ur(first.state)).toMatchObject({ state: "TASKED", task: { kind: "RETURN", target: START }, queue: [] });
    expect(ur(first.state).task_id).toBe(`rt-${first.state.session.last_seq}`);
  });

  it("a second task waits in the queue behind the head (FIFO)", () => {
    let s = send(running(), { vehicle_id: "UR1", task: "SCOUT", target: A }).state;
    const second = send(s, { vehicle_id: "UR1", task: "RELAY", target: B });
    s = second.state;
    expect(ur(s).task).toMatchObject({ kind: "SCOUT", target: A });
    expect(ur(s).queue!.map((q) => q.kind)).toEqual(["RELAY"]);
    expect(ur(s).queue![0]).toMatchObject({ target: B, eta_s: null, battery_wh_after: null });
  });
});

describe("the tick fills ETA and battery (BD-102, 02 §D.9)", () => {
  it("the first tick starts the drive: path, eta_s, battery from the ParamSet, one STATE_DELTA per changed field", () => {
    const s = send(running(), { vehicle_id: "UR1", task: "SCOUT", target: A }).state;
    expect(ur(s).battery_wh).toBeNull();
    const { state, result } = step(s);
    const v = ur(state);
    expect(v.battery_wh).toBeLessThanOrEqual(u.battery_wh);
    expect(v.battery_wh).toBeGreaterThan(u.battery_wh - 1);
    expect(v.path.length).toBeGreaterThan(0);
    expect(v.path[v.path.length - 1]).toEqual([A.x_m, A.y_m]);
    expect(v.eta_s).toBe(etaOf(dist(START, A)) - 1);
    // The path goes to the target without a detour through a cell centre past it: driven + left is the distance, plus at most
    // the half-cell offset of the 10 m lattice centres from the rover and the target (2.5 m each way, so under 1 m of extra length).
    let left = 0;
    let prev: [number, number] = [v.x_m, v.y_m];
    for (const p of v.path) {
      left += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      prev = p;
    }
    const overshoot = left + (v.x_m - START.x_m) - dist(START, A);
    expect(overshoot).toBeGreaterThanOrEqual(-1e-9);
    expect(overshoot).toBeLessThan(1);
    expect(result.deltas.map((d) => d.path)).toEqual(expect.arrayContaining(["vehicles/UR1/battery_wh", "vehicles/UR1/path", "vehicles/UR1/eta_s", "vehicles/UR1/x_m"]));
    expect(v.state).toBe("TASKED");
  });

  it("the head arrives on the tick its eta runs out, with one VEHICLE_ARRIVED at the target, and the battery fell by P_base * t (flat ground)", () => {
    const s = send(running(), { vehicle_id: "UR1", task: "SCOUT", target: A }).state;
    const run = until(s, (x) => ur(x).state === "ARRIVED");
    expect(run.seconds).toBe(etaOf(dist(START, A)));
    expect(kinds(run.events, "VEHICLE_ARRIVED")).toHaveLength(1);
    expect(kinds(run.events, "VEHICLE_ARRIVED")[0]!.data).toEqual({ vehicle_id: "UR1", x_m: A.x_m, y_m: A.y_m });
    const v = ur(run.state);
    expect(v).toMatchObject({ x_m: A.x_m, y_m: A.y_m, eta_s: 0, task_id: null, queue: [] });
    expect(v.battery_wh).toBeCloseTo(u.battery_wh - whOf(etaOf(dist(START, A))), 6);
  });

  it("each queued task shows a cumulative eta_s and the battery after it (leg from the previous target)", () => {
    let s = send(running(), { vehicle_id: "UR1", task: "SCOUT", target: A }).state;
    s = send(s, { vehicle_id: "UR1", task: "CARRY", target: B, item: "sample bag" }).state;
    s = send(s, { vehicle_id: "UR1", task: "RETURN" }).state;
    s = step(s).state;
    const v = ur(s);
    const headEta = etaOf(dist(START, A));
    const t1 = headEta - 1 + etaOf(dist(A, B));
    const t2 = t1 + etaOf(dist(B, START));
    expect(v.queue!.map((q) => q.eta_s)).toEqual([t1, t2]);
    const spent = (secs: number): number => u.battery_wh - whOf(secs);
    // Battery now is the start minus one tick; the head's rest and every later leg are P_base * t each.
    const afterHead = spent(headEta);
    expect(v.queue![0]!.battery_wh_after).toBeCloseTo(afterHead - whOf(etaOf(dist(A, B))), 6);
    expect(v.queue![1]!.battery_wh_after).toBeCloseTo(afterHead - whOf(etaOf(dist(A, B))) - whOf(etaOf(dist(B, START))), 6);
    expect(v.queue![0]).toMatchObject({ kind: "CARRY", item: "sample bag", target: B });
    expect(v.queue![1]).toMatchObject({ kind: "RETURN", target: START });
  });

  it("the eta of a queued task counts down with the head and agrees with the real arrival tick", () => {
    let s = send(running(), { vehicle_id: "UR1", task: "SCOUT", target: A }).state;
    s = send(s, { vehicle_id: "UR1", task: "RELAY", target: B }).state;
    s = step(s).state;
    const predicted = ur(s).queue![0]!.eta_s!;
    const run = until(s, (x) => ur(x).task?.kind === "RELAY" && ur(x).path.length === 0 && ur(x).state === "ARRIVED");
    expect(run.seconds).toBe(predicted);
    expect(ur(run.state)).toMatchObject({ x_m: B.x_m, y_m: B.y_m });
  });

  it("VEHICLE_ARRIVED pops the head: the next task becomes Vehicle.task, the queue shortens, the second drive starts from where the first ended", () => {
    let s = send(running(), { vehicle_id: "UR1", task: "SCOUT", target: A }).state;
    s = send(s, { vehicle_id: "UR1", task: "SCOUT", target: B }).state;
    const second = ur(s).queue![0]!.task_id;
    const first = until(s, (x) => ur(x).task?.target.x_m === B.x_m);
    expect(ur(first.state)).toMatchObject({ state: "TASKED", task_id: second, queue: [], x_m: A.x_m, y_m: A.y_m });
    const moved = step(first.state).state;
    expect(ur(moved).x_m).toBeGreaterThan(A.x_m);
    expect(ur(moved).eta_s).toBe(etaOf(dist(A, B)) - 1);
    const done = until(moved, (x) => ur(x).state === "ARRIVED");
    expect(ur(done.state)).toMatchObject({ x_m: B.x_m, y_m: B.y_m, task_id: null, queue: [] });
  });

  it("a task the battery cannot complete is INVALID, and so is a later one whose cumulative use exceeds it; the state is unchanged", () => {
    const small: ParamSet = { ...ur1, values: { ...ur1.values, battery_wh: whOf(etaOf(dist(START, A))) * 1.5 } } as ParamSet;
    const scenario = scenarioWith(small);
    const s = running(scenario);
    const first = send(s, { vehicle_id: "UR1", task: "SCOUT", target: A }, "ops", scenario);
    expect(first.ok).toBe(true);
    const second = send(first.state, { vehicle_id: "UR1", task: "SCOUT", target: B }, "ops", scenario);
    expect(second).toMatchObject({ ok: false, code: "INVALID" });
    expect(second.message).toMatch(/battery/i);
    expect(ur(second.state)).toEqual(ur(first.state));
    const none: ParamSet = { ...ur1, values: { ...ur1.values, battery_wh: 1 } } as ParamSet;
    const sn = scenarioWith(none);
    expect(send(running(sn), { vehicle_id: "UR1", task: "SCOUT", target: A }, "ops", sn)).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("a task exactly as long as the battery lasts is accepted (the limit is below 0, not at 0)", () => {
    const exact: ParamSet = { ...ur1, values: { ...ur1.values, battery_wh: whOf(etaOf(dist(START, A))) } } as ParamSet;
    const scenario = scenarioWith(exact);
    expect(send(running(scenario), { vehicle_id: "UR1", task: "SCOUT", target: A }, "ops", scenario).ok).toBe(true);
  });

  it("the queue is cumulative against the battery left while the rover is already driving", () => {
    let s = send(running(), { vehicle_id: "UR1", task: "SCOUT", target: B }).state;
    s = until(s, (x) => (ur(x).eta_s ?? 99999) <= 100).state;
    const left = ur(s).battery_wh!;
    expect(left).toBeLessThan(u.battery_wh);
    // Cap the battery just under what the head's rest plus a return would need: that return is refused.
    const need = whOf(100) + whOf(etaOf(dist(B, START)));
    const capped: EngineState = { ...s, vehicles: s.vehicles.map((v) => (v.vehicle_id === "UR1" ? { ...v, battery_wh: need - 0.5 } : v)) };
    expect(send(capped, { vehicle_id: "UR1", task: "RETURN" })).toMatchObject({ ok: false, code: "INVALID" });
    const roomy: EngineState = { ...s, vehicles: s.vehicles.map((v) => (v.vehicle_id === "UR1" ? { ...v, battery_wh: need + 1 } : v)) };
    expect(send(roomy, { vehicle_id: "UR1", task: "RETURN" }).ok).toBe(true);
  });
});

describe("module hygiene", () => {
  it("the pressurized rover is not touched, and a scenario with no grid changes no position", () => {
    const s = running();
    const out = roversTick(s, ctxOf(s));
    expect(out.state.vehicles.find((v) => v.vehicle_id === "PR1")).toEqual(s.vehicles.find((v) => v.vehicle_id === "PR1"));
    const noGrid: LoadedScenario = { ...sc, grid: null, comm: null };
    const tasked = send(running(noGrid), { vehicle_id: "UR1", task: "SCOUT", target: A }, "ops", noGrid);
    expect(tasked.ok).toBe(false);
    const manual: EngineState = { ...s, vehicles: s.vehicles.map((v) => (v.vehicle_id === "UR1" ? { ...v, state: "TASKED" as const, task: { kind: "SCOUT" as const, target: A }, task_id: "rt-9", queue: [] } : v)) };
    const r = roversTick(manual, ctxOf(manual, noGrid));
    expect(ur(r.state)).toMatchObject({ x_m: START.x_m, y_m: START.y_m, path: [] });
  });

  it("a state saved as a snapshot (JSON round trip) and resumed ticks the same as the one that kept running", () => {
    let s = send(running(), { vehicle_id: "UR1", task: "SCOUT", target: A }).state;
    s = send(s, { vehicle_id: "UR1", task: "RELAY", target: B }).state;
    for (let i = 0; i < 30; i++) s = step(s).state;
    const resumed = JSON.parse(JSON.stringify(s)) as EngineState;
    const a = step(s);
    const b = step(resumed);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    expect(JSON.stringify(b.result.deltas)).toBe(JSON.stringify(a.result.deltas));
    // And with no saved legs at all, the drive is planned again and the position and ETA are the same.
    const bare = { ...JSON.parse(JSON.stringify(s)), rover_legs: undefined } as EngineState;
    const c = step(bare);
    expect(ur(c.state).x_m).toBeCloseTo(ur(a.state).x_m, 9);
    expect(ur(c.state).eta_s).toBe(ur(a.state).eta_s);
    expect(ur(c.state).queue!.map((q) => q.eta_s)).toEqual(ur(a.state).queue!.map((q) => q.eta_s));
  });

  it("a vehicle time field outside the grid does not stop the engine: the rover stays where it is", () => {
    const s = running();
    const lost: EngineState = { ...s, vehicles: s.vehicles.map((v) => (v.vehicle_id === "UR1" ? { ...v, x_m: 90_000, state: "TASKED" as const, task: { kind: "SCOUT" as const, target: A }, task_id: "rt-9", queue: [] } : v)) };
    expect(() => roversTick(lost, ctxOf(lost))).not.toThrow();
    expect(ur(roversTick(lost, ctxOf(lost)).state).x_m).toBe(90_000);
  });

  it("agrees with compute on the time of one leg", () => {
    const field = vehicleTimeField(fx.grid, START, ur1);
    expect(etaOf(dist(START, A))).toBe(Math.round(timeAt(field, A.x_m, A.y_m)));
  });
});

// ---- RELAY (FR-42) ---------------------------------------------------------------------------------------------------

const leg0 = sc.scenario.plan!.result.legs[0] as OkLeg;
const shortPlan = (to_x: number): NonNullable<EngineState["plan"]> => {
  const plan = sc.scenario.plan!;
  const out = { ...leg0, to: "wp-1", distance_m: to_x, walk_time_min: leg0.walk_time_min * (to_x / 1000), geometry: [[0, 0], [to_x, 0]] as [number, number][] };
  const back = { ...out, from: "wp-1", to: "wp-0", geometry: [[to_x, 0], [0, 0]] as [number, number][] };
  return { ...plan, waypoints: [plan.waypoints[0], { id: "wp-1", role: "stop", x_m: to_x, y_m: 0 }], result: { ...plan.result, legs: [out, back] } } as NonNullable<EngineState["plan"]>;
};
const crewOut = (): EngineState => {
  const s = running();
  return {
    ...s,
    plan: shortPlan(1000),
    crew: s.crew.map((c) => (c.crew_id === "EV1" ? { ...c, activity: "WALKING" as const, x_m: 700, y_m: 0 } : c)),
    motion: { EV1: { plan_revision: 1, phase: "walk", leg_index: 0, t_s: 0, last_wp_id: "wp-0" } },
  };
};
const links = (s: EngineState): TickResult => linksTick(s, ctxOf(s));
const shadows = (events: PendingEvent[]): PendingEvent[] => events.filter((e) => e.kind === "ALERT_RAISED" && (e.data as LogEventData["ALERT_RAISED"]).code === "COMM_SHADOW");
const crew = (s: EngineState, id: CrewId) => s.crew.find((c) => c.crew_id === id)!;

describe("RELAY closes the comm shadow (FR-41, FR-42)", () => {
  it("a crew member behind the wall has a COMM_SHADOW; after UR1 parks as a relay beside the wall the shadow is cleared and the link is restored", () => {
    let s = crewOut();
    const before = links(s);
    s = applyAll(before.state, before.events);
    expect(shadows(before.events)).toHaveLength(1);
    expect(crew(s, "EV1").linked).toBe(false);

    s = send(s, { vehicle_id: "UR1", task: "RELAY", target: A }).state;
    const parked = until(s, (x) => ur(x).state === "ARRIVED");
    s = parked.state;
    expect(ur(s)).toMatchObject({ x_m: A.x_m, y_m: A.y_m, task: { kind: "RELAY" } });

    const after = links(s);
    const out = applyAll(after.state, after.events);
    expect(after.events.filter((e) => e.kind === "ALERT_CLEARED").length).toBe(1);
    expect(shadows(after.events)).toHaveLength(0);
    expect(out.alerts.filter((a) => a.code === "COMM_SHADOW" && a.cleared_seq === null)).toEqual([]);
    expect(crew(out, "EV1")).toMatchObject({ linked: true, link_path: ["EV1", "UR1", "HAB"], link_via: "relay" });
  });

  it("while UR1 is still driving, the shadow stays", () => {
    let s = applyAll(links(crewOut()).state, links(crewOut()).events);
    s = send(s, { vehicle_id: "UR1", task: "RELAY", target: A }).state;
    s = until(s, () => false, 50).state;
    const r = links(s);
    expect(r.events.filter((e) => e.kind === "ALERT_CLEARED")).toEqual([]);
    expect(crew(applyAll(r.state, r.events), "EV1").linked).toBe(false);
  });
});

describe("relay_coverage_rev and the coverage grid (BD-112, N-11)", () => {
  const parkAt = (s: EngineState, target: { x_m: number; y_m: number }): EngineState => {
    const sent = send(s, { vehicle_id: "UR1", task: "RELAY", target }).state;
    const arrived = until(sent, (x) => ur(x).state === "ARRIVED").state;
    return step(arrived).state; // one more tick: the rover is parked now, the module notices
  };

  it("is null until the rover is parked as a relay, 1 when it parks, null while it drives on, and a new number when it parks again", () => {
    let s = running();
    expect(ur(s).relay_coverage_rev ?? null).toBeNull();
    s = parkAt(s, A);
    expect(ur(s).relay_coverage_rev).toBe(1);
    expect(step(s).state.vehicles.find((v) => v.vehicle_id === "UR1")!.relay_coverage_rev).toBe(1);
    s = send(s, { vehicle_id: "UR1", task: "SCOUT", target: B }).state;
    s = step(s).state;
    expect(ur(s).relay_coverage_rev).toBeNull();
    s = parkAt(until(s, (x) => ur(x).state === "ARRIVED").state, B);
    expect(ur(s).relay_coverage_rev).toBe(2);
  });

  it("a rover parked for a task other than RELAY has no coverage", () => {
    const s = step(until(send(running(), { vehicle_id: "UR1", task: "SCOUT", target: A }).state, (x) => ur(x).state === "ARRIVED").state).state;
    expect(ur(s).relay_coverage_rev ?? null).toBeNull();
  });

  it("the grid has the comm_hab layout and marks a cell 1 exactly where compute's line of sight from the rover antenna holds, within range", () => {
    const rover: Vehicle = { vehicle_id: "UR1", kind: "utility_rover", param_set: "ur1-assumed", x_m: A.x_m, y_m: A.y_m, state: "ARRIVED", task: { kind: "RELAY", target: A }, path: [], eta_s: 0, battery_wh: 4000 };
    const cov = relayCoverageGrid(sc, rover)!;
    const { meta } = fx.grid;
    expect(cov).toMatchObject({ width: meta.width, height: meta.height });
    expect(cov.data).toBeInstanceOf(Uint8Array);
    expect(cov.data.length).toBe(meta.width * meta.height);
    const link = Object.values(sc.params).find((p) => p.kind === "link")!.values as Record<string, number>;
    const antenna = (Object.values(sc.params).find((p) => p.kind === "suit")!.values as Record<string, number>).antenna_m;
    const at = (x: number, y: number): number => cov.data[Math.floor((meta.origin_m[1] - y) / meta.cell_m) * meta.width + Math.floor((x - meta.origin_m[0]) / meta.cell_m)]!;
    // Sample points: behind the wall (covered by the relay), in front of the wall near the rover, and far outside the 4 km radius.
    for (const [x, y] of [[700, 0], [700, 50], [900, 100], [1100, 0], [400, 0], [300, 200], [1450, -240]] as [number, number][]) {
      const range = Math.hypot(x - A.x_m, y - A.y_m);
      const visible = range <= link.range_rover_m && lineOfSight(fx.grid, { x_m: A.x_m, y_m: A.y_m, height_m: u.antenna_m }, { x_m: x, y_m: y, height_m: antenna });
      // The viewshed is sampled on a 20 m grid, so only points whose 20 m cell is unambiguous are compared exactly.
      if (range > 60) expect(at(x, y), `(${x}, ${y})`).toBe(visible ? 1 : 0);
    }
    expect(at(700, 0)).toBe(1);
    // The line from the rover to (300, 0) crosses the wall at (500, 80): shadowed.
    expect(at(300, 0)).toBe(0);
  });

  it("is null for a rover that is not parked as a relay", () => {
    const rover: Vehicle = { vehicle_id: "UR1", kind: "utility_rover", param_set: "ur1-assumed", x_m: A.x_m, y_m: A.y_m, state: "TASKED", task: { kind: "RELAY", target: A }, path: [], eta_s: 3, battery_wh: 4000 };
    expect(relayCoverageGrid(sc, rover)).toBeNull();
    expect(relayCoverageGrid(sc, { ...rover, state: "ARRIVED", task: { kind: "SCOUT", target: A } })).toBeNull();
    expect(relayCoverageGrid({ ...sc, grid: null, comm: null }, { ...rover, state: "ARRIVED" })).toBeNull();
  });
});

function cloneGrid(g: LoadedGrid): LoadedGrid {
  return { ...g, elevation: g.elevation.slice(), slopeP90: g.slopeP90.slice(), slopeMax: g.slopeMax.slice(), flags: g.flags.slice(), commHab: g.commHab.slice() };
}

describe("GET /api/relay-coverage/<vehicle_id> on a real session (N-11, BD-112)", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()!();
  });

  it("404 until UR1 is parked as a relay; then the u8 grid with ETag = relay_coverage_rev; 304 on a matching If-None-Match; 404 for another vehicle", async () => {
    const dir = mkdtempSync(join(tmpdir(), "marswalk-relay-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const session = loadSession(sc, dir);
    const server = await startServer({ site: "mock_site", port: 0, host: "127.0.0.1", session });
    cleanup.push(() => server.close());
    const get = (path: string, headers: Record<string, string> = {}): Promise<Response> => fetch(`${server.url}${path}`, { headers });
    const cmd = (command_id: string, kind: Command["kind"], args: Record<string, unknown>) => session.apply({ command_id, role: "ops", kind, args });

    expect((await get("/api/relay-coverage/UR1")).status).toBe(404);
    expect(cmd("s-1", "START_EVA", {}).result.ok).toBe(true);
    expect(cmd("s-2", "TASK_ROVER", { vehicle_id: "UR1", task: "RELAY", target: A }).result.ok).toBe(true);
    session.advance(10);
    expect((await get("/api/relay-coverage/UR1")).status).toBe(404); // still driving
    session.advance(etaOf(dist(START, A)) + 2);
    const snap = session.snapshot([]);
    const rover = snap.vehicles.find((v) => v.vehicle_id === "UR1")!;
    expect(rover).toMatchObject({ state: "ARRIVED", relay_coverage_rev: 1, battery_wh: expect.any(Number) });

    const res = await get("/api/relay-coverage/UR1");
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe('"1"');
    expect(res.headers.get("content-type")).toContain("application/octet-stream");
    const body = new Uint8Array(await res.arrayBuffer());
    const expected = relayCoverageGrid(sc, rover)!;
    expect(body.length).toBe(expected.width * expected.height);
    expect(Buffer.from(body).equals(Buffer.from(expected.data))).toBe(true);
    expect(body.some((b) => b === 1)).toBe(true);

    expect((await get("/api/relay-coverage/UR1", { "If-None-Match": '"1"' })).status).toBe(304);
    expect((await get("/api/relay-coverage/UR1", { "If-None-Match": '"7"' })).status).toBe(200);
    expect((await get("/api/relay-coverage/PR1")).status).toBe(404);
    expect((await get("/api/relay-coverage/NOPE")).status).toBe(404);
  });

  it("404 when there is no session", async () => {
    const server = await startServer({ site: "mock_site", port: 0, host: "127.0.0.1" });
    cleanup.push(() => server.close());
    expect((await fetch(`${server.url}/api/relay-coverage/UR1`)).status).toBe(404);
  });
});
