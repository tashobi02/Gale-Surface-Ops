/**
 * T23.05 review (8 Nov): summon, dispatch and vehicle motion against the REAL @marswalk/compute
 * (docs/specs/02 §D.8, §D.10; 03 §E.9; 05 Vehicle; FR-40, NFR-06). TASK-23.
 *
 * Proposed 2026-11-08, ratified (BD-71): this file is new. `summon.test.ts` (T23.04) mocks compute
 * with a 1-D stand-in, so it cannot see what the engine does with a real path (cell centres, a path
 * that bends, a 5 m crew grid over the 10 m vehicle field). The only `vi.mock` is a pass-through of
 * `rendezvousPair` that one test makes throw (its RangeError path cannot be reached on a real grid,
 * where every meeting point the vehicle reaches is reachable from the other); the grids
 * are the synthetic F9 fixtures (`packages/compute/tests/fixtures/v2grids.ts`), and every expected
 * value is derived here from the same compute functions (the "oracle") or from the fixture's
 * declared shape. Nothing is typed in as a science number.
 *
 * Rules checked here (TASK-23 T23.05 notes, Proposed 2026-11-08):
 * - The crew field is bounded at L = `max_haven_min` × 60 s (02 §D.8 "the haven rule"; 02 §D.10 L).
 * - The vehicle uses its own ParamSet (`Vehicle.param_set`), and a missing or non-positive
 *   `flat_speed_kmh` answers INVALID.
 * - The logged ETAs are whole seconds (05 Vehicle `eta_s` is an int): Math.round of the compute ETA.
 * - The path the vehicle drives is the compute's `vehicle_path` to the LOGGED target: it does not
 *   depend on where the crew is when the vehicle sets off, so there is no jump at arrival.
 * - Motion: constant speed = remaining path length ÷ `eta_s`, so arrival is on tick `eta_s`; `eta_s`
 *   counts down by dt_s as an integer. DISPATCHED → EN_ROUTE, `path`, `eta_s`, `x_m`, `y_m` are sent
 *   as STATE_DELTAs whenever they change.
 * - Two crew: both rendezvous, then `rendezvousPair`; the vehicle goes to the first meeting point of
 *   the chosen order.
 * - Unknown crew ids, more than two crew, duplicates, unknown option, and no pressurized rover answer
 *   INVALID.
 * - Sheltering reach: SHELTER_REACH_M = 1 m is the T23.04 value, ratified as a numerical "same point" tolerance (BD-72; summon.test.ts header).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  crewTimeField,
  rendezvous,
  rendezvousPair,
  vehiclePassable,
  vehicleTimeField,
  type LoadedGrid,
  type RendezvousOk,
} from "@marswalk/compute";
import type { Command, ContingencyOption, CrewId, LogEvent, LogEventData, LogEventKind, MissionScenario, ParamSet, Role, Vehicle } from "@marswalk/protocol";
import { dispatchVehicle, handleSummon, SHELTER_REACH_M, vehiclesTick } from "../src/engine/vehicles";
import { initialState, logged, reduce, type EngineState, type PendingEvent, type StateChange } from "../src/engine/reducer";
import type { TickContext } from "../src/engine/tick";
import { readScenario, type LoadedScenario } from "../src/scenario";
import {
  CREW_XY,
  HAB_XY,
  havenFlat,
  pr1Params,
  rendezvousBlockedVehicle,
  rendezvousRidge,
  defaultScenario,
  ridgeScenario,
  slowVehicleParams,
  VEHICLE_XY,
  type XY,
} from "../../../packages/compute/tests/fixtures/v2grids";

/** Pass-through of the real `rendezvousPair`; `throwPair` makes it throw its documented RangeError. */
const pairSwitch = vi.hoisted(() => ({ throwPair: false }));
vi.mock("@marswalk/compute", async () => {
  const actual = await vi.importActual<typeof import("@marswalk/compute")>("@marswalk/compute");
  return {
    ...actual,
    rendezvousPair: (...a: Parameters<typeof actual.rendezvousPair>) => {
      if (pairSwitch.throwPair) throw new RangeError("rendezvousPair: the vehicle cannot reach either meeting point from the other");
      return actual.rendezvousPair(...a);
    },
  };
});

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const T0_MS = Date.parse(fake.scenario.start_utc);
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");
const DT_S = 1;
/** The T23.04 reach, ratified as a numerical tolerance (BD-72; summon.test.ts header, "Sheltering"); declared, not read from the code. */
const DECIDED_REACH_M = 1;
const PR1_ID = fake.scenario.vehicles.find((v) => v.kind === "pressurized_rover")!.vehicle_id;

function scenarioWith(grid: LoadedGrid, plan: MissionScenario, params: ParamSet[]): LoadedScenario {
  const extra = Object.fromEntries(params.map((p) => [p.param_set_id, p]));
  return { ...fake, grid, scenario: { ...fake.scenario, plan: { ...fake.scenario.plan!, scenario: plan } }, params: { ...fake.params, ...extra } };
}

function apply(state: EngineState, kind: LogEventKind, data: LogEventData[LogEventKind], actor: Role | "system" = "system"): EngineState {
  const event: LogEvent = { seq: state.session.last_seq + 1, sim_time: state.session.clock.sim_time, kind, actor, data: data as Record<string, unknown>, provenance: {}, command_ref: null };
  return reduce(state, event);
}
const applyEvents = (state: EngineState, events: PendingEvent[]): EngineState =>
  events.reduce((s, e) => reduce(s, logged(e, s.session.last_seq + 1)), state);

const withCrew = (s: EngineState, id: CrewId, patch: Partial<EngineState["crew"][number]>): EngineState => ({
  ...s,
  crew: s.crew.map((c) => (c.crew_id === id ? { ...c, ...patch } : c)),
});
const withPr1 = (s: EngineState, patch: Partial<Vehicle>): EngineState => ({
  ...s,
  vehicles: s.vehicles.map((v) => (v.vehicle_id === PR1_ID ? { ...v, ...patch } : v)),
});
const pr1 = (s: EngineState): Vehicle => s.vehicles.find((v) => v.vehicle_id === PR1_ID)!;
const at = (s: EngineState, ms: number): EngineState => ({ ...s, session: { ...s.session, clock: { ...s.session.clock, sim_time: iso(ms) } } });

/** EVA running; EV1 (and EV2) placed; PR1 parked at `vehicle` with ParamSet `param_set`. */
function setUp(sc: LoadedScenario, crew: Partial<Record<CrewId, XY>>, vehicle: XY, param_set: string): EngineState {
  let s = initialState(sc, "s-0001");
  s = apply(s, "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops");
  for (const [id, p] of Object.entries(crew)) s = withCrew(s, id as CrewId, { x_m: p!.x_m, y_m: p!.y_m, activity: "TO_HAVEN" });
  return withPr1(s, { x_m: vehicle.x_m, y_m: vehicle.y_m, param_set });
}

let n = 0;
const summonCmd = (args: Record<string, unknown>, role: Role = "ops"): Command => ({ command_id: `r-${++n}`, role, kind: "SUMMON_VEHICLE", args });

/** The oracle: 02 §D.10 with the real compute, crew field bounded at max_haven_min (02 §D.8). */
function oracle(sc: LoadedScenario, crew: XY, vehicle: XY, params: ParamSet, limit_s?: number) {
  const plan = sc.scenario.plan!.scenario;
  const L = limit_s ?? plan.max_haven_min * 60;
  return rendezvous(crewTimeField(sc.grid!, crew, plan, L), vehicleTimeField(sc.grid!, vehicle, params), vehiclePassable(sc.grid!, params));
}
function ok(r: ReturnType<typeof oracle>): RendezvousOk {
  if (r.status !== "OK") throw new Error("set-up: the oracle found no rendezvous");
  return r;
}

interface Tick {
  k: number;
  before: EngineState;
  after: EngineState;
  moduleState: EngineState;
  events: PendingEvent[];
  deltas: StateChange[];
}

/** Run vehiclesTick for up to `max` ticks, applying its events, until `stop` says so. */
function drive(start: EngineState, sc: LoadedScenario, max: number, stop: (t: Tick) => boolean = () => false, dt_s = DT_S): Tick[] {
  const out: Tick[] = [];
  let state = start;
  for (let k = 1; k <= max; k++) {
    const before = at(state, T0_MS + k * dt_s * 1000);
    const ctx: TickContext = { scenario: sc, dt_s, next_seq: before.session.last_seq + 1 };
    const r = vehiclesTick(before, ctx);
    state = applyEvents(r.state, r.events);
    const t = { k, before, after: state, moduleState: r.state, events: r.events, deltas: r.deltas };
    out.push(t);
    if (stop(t)) break;
  }
  return out;
}
const arrivedTick = (ticks: Tick[]) => ticks.find((t) => t.events.some((e) => e.kind === "VEHICLE_ARRIVED"));

function polylineLength(p: [number, number][]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]);
  return s;
}
function distToPolyline(x: number, y: number, p: [number, number][]): number {
  let best = Infinity;
  for (let i = 1; i < p.length; i++) {
    const [ax, ay] = p[i - 1]!;
    const [bx, by] = p[i]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}
/** Arc length along `p` of the polyline point closest to (x, y). */
function arcAt(x: number, y: number, p: [number, number][]): number {
  let best = Infinity;
  let arc = 0;
  let at = 0;
  for (let i = 1; i < p.length; i++) {
    const [ax, ay] = p[i - 1]!;
    const [bx, by] = p[i]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (len * len)));
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (d < best) {
      best = d;
      at = arc + t * len;
    }
    arc += len;
  }
  return at;
}
const jsonSafe = (v: unknown): void => expect(JSON.parse(JSON.stringify(v))).toEqual(v);

// ---------------------------------------------------------------------------
// Ridge (02 §D.10 validation): crew on a ridge the vehicle cannot climb, 5 m crew grid
// ---------------------------------------------------------------------------

const ridge = rendezvousRidge(5);
const ridgeSc = scenarioWith(ridge.grid, ridgeScenario(), [pr1Params]);
const ridgeStart = (): EngineState => setUp(ridgeSc, { EV1: ridge.shape.crew }, ridge.shape.vehicle, pr1Params.param_set_id);
const ridgeOracle = ok(oracle(ridgeSc, ridge.shape.crew, ridge.shape.vehicle, pr1Params));

function summonRidge(state = ridgeStart()) {
  const out = handleSummon(state, ridgeSc, summonCmd({ crew: ["EV1"] }));
  expect(out.result.ok, JSON.stringify(out.result)).toBe(true);
  return { out, state: applyEvents(state, out.events) };
}

describe("real compute: dispatch on the ridge (02 §D.10)", () => {
  it("logs the compute rendezvous (the ridge foot) with whole-second ETAs", () => {
    const { out } = summonRidge();
    const rv = (out.events[0]!.data as LogEventData["VEHICLE_DISPATCHED"]).rendezvous!;
    expect({ x_m: rv.x_m, y_m: rv.y_m }).toEqual({ x_m: ridgeOracle.x_m, y_m: ridgeOracle.y_m });
    // The foot column; the row is the compute tie-break (open foot-row tie question in TASK-05b, T05b.07).
    expect(rv.x_m).toBe(ridge.shape.westFootX_m);
    expect(Number.isInteger(rv.eta_crew_s) && Number.isInteger(rv.eta_vehicle_s), JSON.stringify(rv)).toBe(true);
    expect(Math.abs(rv.eta_crew_s - ridgeOracle.eta_crew_s)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(rv.eta_vehicle_s - ridgeOracle.eta_vehicle_s)).toBeLessThanOrEqual(0.5);
    jsonSafe(out.events[0]);
  });

  it("drives the compute vehicle path at constant speed and arrives at the target on tick eta_s", () => {
    const { state: dispatched } = summonRidge();
    const target = pr1(dispatched).task!.target;
    const eta0 = pr1(dispatched).eta_s!;
    expect(Number.isInteger(eta0), `eta0 ${eta0}`).toBe(true);
    expect(eta0, "set-up: the drive takes more than one tick").toBeGreaterThan(DT_S);
    const route: [number, number][] = [[ridge.shape.vehicle.x_m, ridge.shape.vehicle.y_m], ...ridgeOracle.vehicle_path];
    const perTick = (polylineLength(route) / eta0) * DT_S;

    const ticks = drive(dispatched, ridgeSc, eta0 + 3);
    const arrival = arrivedTick(ticks);
    expect(arrival, "VEHICLE_ARRIVED is logged").toBeDefined();
    expect(arrival!.k, "arrival on tick eta_s (within one tick of the compute eta_vehicle_s)").toBe(eta0);
    expect(Math.abs(arrival!.k * DT_S - ridgeOracle.eta_vehicle_s)).toBeLessThanOrEqual(DT_S);
    expect(arrival!.events.find((e) => e.kind === "VEHICLE_ARRIVED")!.data).toEqual({ vehicle_id: PR1_ID, x_m: target.x_m, y_m: target.y_m });

    expect(pr1(ticks[0]!.after).state).toBe("EN_ROUTE");
    expect(pr1(ticks[0]!.after).path.at(-1), "the stored path ends at the logged target").toEqual([target.x_m, target.y_m]);

    let prev: [number, number] = [ridge.shape.vehicle.x_m, ridge.shape.vehicle.y_m];
    for (const t of ticks.filter((t) => t.k <= arrival!.k)) {
      const v = pr1(t.after);
      const step = Math.hypot(v.x_m - prev[0], v.y_m - prev[1]);
      expect(step, `tick ${t.k}: no jump beyond the per-tick distance`).toBeLessThanOrEqual(perTick + 1e-6);
      expect(distToPolyline(v.x_m, v.y_m, route), `tick ${t.k}: on the compute vehicle path`).toBeLessThanOrEqual(1e-6);
      expect(v.eta_s, `tick ${t.k}: eta_s counts down in whole seconds`).toBe(Math.max(0, eta0 - t.k * DT_S));
      prev = [v.x_m, v.y_m];
    }
    expect(pr1(arrival!.after)).toMatchObject({ state: "ARRIVED", x_m: target.x_m, y_m: target.y_m, eta_s: 0 });
    expect(ticks.filter((t) => t.k > arrival!.k).flatMap((t) => t.events)).toEqual([]);
  });

  it("sends EN_ROUTE, path, eta_s and position as JSON-safe STATE_DELTAs whenever they change", () => {
    const { state: dispatched } = summonRidge();
    const ticks = drive(dispatched, ridgeSc, pr1(dispatched).eta_s! + 2);
    const first = ticks[0]!;
    expect(first.deltas).toEqual(expect.arrayContaining([{ path: `vehicles/${PR1_ID}/state`, value: "EN_ROUTE" }]));
    for (const t of ticks) {
      const b = pr1(t.before);
      const m = pr1(t.moduleState);
      for (const key of ["state", "path", "eta_s", "x_m", "y_m"] as const) {
        if (JSON.stringify(b[key]) === JSON.stringify(m[key])) continue;
        const d = t.deltas.filter((x) => x.path === `vehicles/${PR1_ID}/${key}`);
        expect(d, `tick ${t.k}: one delta for the changed ${key}`).toHaveLength(1);
        expect(d[0]!.value).toEqual(m[key]);
      }
      jsonSafe(t.deltas);
      jsonSafe(pr1(t.moduleState));
    }
  });

  it("keeps the logged target when the crew move after the summon (no re-targeting, no jump)", () => {
    const { state: dispatched } = summonRidge();
    const target = pr1(dispatched).task!.target;
    const eta0 = pr1(dispatched).eta_s!;
    // EV1 walks off to the far (east) edge of the plateau after the summon.
    const moved = withCrew(dispatched, "EV1", { x_m: ridge.shape.plateau.xMax, y_m: ridge.shape.crew.y_m });
    const route: [number, number][] = [[ridge.shape.vehicle.x_m, ridge.shape.vehicle.y_m], ...ridgeOracle.vehicle_path];
    const perTick = (polylineLength(route) / eta0) * DT_S;
    const ticks = drive(moved, ridgeSc, eta0 + 2);
    expect(pr1(ticks[0]!.after).path.at(-1)).toEqual([target.x_m, target.y_m]);
    let prev: [number, number] = [ridge.shape.vehicle.x_m, ridge.shape.vehicle.y_m];
    for (const t of ticks) {
      const v = pr1(t.after);
      expect(Math.hypot(v.x_m - prev[0], v.y_m - prev[1]), `tick ${t.k}`).toBeLessThanOrEqual(perTick + 1e-6);
      prev = [v.x_m, v.y_m];
    }
    expect(arrivedTick(ticks)!.events.find((e) => e.kind === "VEHICLE_ARRIVED")!.data).toMatchObject({ x_m: target.x_m, y_m: target.y_m });
  });
});

describe("never moves without a computed path", () => {
  it("a DISPATCHED vehicle whose path to the target cannot be computed stays put and logs nothing", () => {
    const blocked = rendezvousBlockedVehicle(5);
    const sc = scenarioWith(blocked.grid, defaultScenario(), [pr1Params]);
    expect(oracle(sc, blocked.shape.crew, blocked.shape.vehicle, pr1Params).status, "set-up: the vehicle is fenced in").toBe("NO_RENDEZVOUS");
    let s = setUp(sc, { EV1: blocked.shape.crew }, blocked.shape.vehicle, pr1Params.param_set_id);
    // A dispatch to the crew's point (outside the ring), as a log written elsewhere could carry.
    s = apply(s, "VEHICLE_DISPATCHED", { vehicle_id: PR1_ID, rendezvous: { x_m: blocked.shape.crew.x_m, y_m: blocked.shape.crew.y_m, eta_crew_s: 0, eta_vehicle_s: 60 } });
    const ticks = drive(s, sc, 5);
    for (const t of ticks) {
      expect(pr1(t.after)).toMatchObject({ x_m: blocked.shape.vehicle.x_m, y_m: blocked.shape.vehicle.y_m });
      expect(t.events).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// ParamSet, bound L and two crew on the flat haven grid (02 §D.8 shape)
// ---------------------------------------------------------------------------

const flat = havenFlat(5);

describe("the vehicle's own ParamSet and the bound L (02 §D.8, §D.10)", () => {
  // pr1-assumed (fast) is listed before the slow set, so "first ParamSet of the kind" picks the wrong one.
  const sc = scenarioWith(flat.grid, defaultScenario(), [pr1Params, slowVehicleParams]);
  const start = () => setUp(sc, { EV1: flat.shape.crew }, flat.shape.vehicle, slowVehicleParams.param_set_id);

  it("uses PR1's own param_set, not the first pressurized-rover ParamSet", () => {
    const slow = ok(oracle(sc, flat.shape.crew, flat.shape.vehicle, slowVehicleParams));
    const fast = ok(oracle(sc, flat.shape.crew, flat.shape.vehicle, pr1Params));
    expect(Math.abs(slow.eta_vehicle_s - fast.eta_vehicle_s), "set-up: the two sets give different ETAs").toBeGreaterThan(1);
    const out = handleSummon(start(), sc, summonCmd({ crew: ["EV1"] }));
    const rv = (out.events[0]!.data as LogEventData["VEHICLE_DISPATCHED"]).rendezvous!;
    expect({ x_m: rv.x_m, y_m: rv.y_m }).toEqual({ x_m: slow.x_m, y_m: slow.y_m });
    expect(Math.abs(rv.eta_vehicle_s - slow.eta_vehicle_s)).toBeLessThanOrEqual(0.5);
  });

  it("bounds the crew field at max_haven_min × 60 s", () => {
    const L = sc.scenario.plan!.scenario.max_haven_min * 60;
    const bounded = ok(oracle(sc, flat.shape.crew, flat.shape.vehicle, slowVehicleParams));
    const unbounded = ok(oracle(sc, flat.shape.crew, flat.shape.vehicle, slowVehicleParams, Infinity));
    expect(unbounded.eta_crew_s, "set-up: without the bound the crew would walk longer than L").toBeGreaterThan(L);
    const rv = (handleSummon(start(), sc, summonCmd({ crew: ["EV1"] })).events[0]!.data as LogEventData["VEHICLE_DISPATCHED"]).rendezvous!;
    expect({ x_m: rv.x_m, y_m: rv.y_m }).toEqual({ x_m: bounded.x_m, y_m: bounded.y_m });
    expect(rv.eta_crew_s).toBeLessThanOrEqual(L);
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["negative", -1],
    ["a string", "10"],
  ])("answers INVALID when flat_speed_kmh is %s, before any event", (_label, speed) => {
    const values: Record<string, unknown> = { ...slowVehicleParams.values };
    if (speed === undefined) delete values.flat_speed_kmh;
    else values.flat_speed_kmh = speed;
    const broken = { ...slowVehicleParams, values } as ParamSet;
    const sc2 = { ...sc, params: { ...sc.params, [broken.param_set_id]: broken } };
    const out = handleSummon(start(), sc2, summonCmd({ crew: ["EV1"] }));
    expect(out.result).toMatchObject({ ok: false, code: "INVALID" });
    expect(out.events).toEqual([]);
  });
});

describe("two crew (02 §D.10 rendezvousPair)", () => {
  const sc = scenarioWith(flat.grid, defaultScenario(), [pr1Params]);

  it("dispatches to the first meeting point of the order rendezvousPair chooses", () => {
    // EV1 far east, EV2 at the hab: the vehicle coming from the west should meet EV2 first.
    const a = ok(oracle(sc, CREW_XY, VEHICLE_XY, pr1Params));
    const b = ok(oracle(sc, HAB_XY, VEHICLE_XY, pr1Params));
    const pair = rendezvousPair(a, b, vehicleTimeField(sc.grid!, a, pr1Params), vehicleTimeField(sc.grid!, b, pr1Params));
    expect(pair.order, "set-up: the second-named crew member is visited first").toEqual([1, 0]);
    const first = pair.order[0] === 0 ? a : b;

    const s = setUp(sc, { EV1: CREW_XY, EV2: HAB_XY }, VEHICLE_XY, pr1Params.param_set_id);
    const out = handleSummon(s, sc, summonCmd({ crew: ["EV1", "EV2"] }));
    expect(out.result.ok, JSON.stringify(out.result)).toBe(true);
    const rv = (out.events[0]!.data as LogEventData["VEHICLE_DISPATCHED"]).rendezvous!;
    expect({ x_m: rv.x_m, y_m: rv.y_m }).toEqual({ x_m: first.x_m, y_m: first.y_m });
    expect(Math.abs(rv.eta_crew_s - first.eta_crew_s)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(rv.eta_vehicle_s - first.eta_vehicle_s)).toBeLessThanOrEqual(0.5);
  });
});

// ---------------------------------------------------------------------------
// The second meeting (BD-58): after the first crew member is sheltered, the vehicle drives to the second
// ---------------------------------------------------------------------------

describe("two crew: the vehicle drives the second meeting (BD-58)", () => {
  const sc = scenarioWith(flat.grid, defaultScenario(), [pr1Params]);
  const OPTION: ContingencyOption = {
    option_id: "o2",
    alert_id: "a-2",
    kind: "VEHICLE_RENDEZVOUS",
    crew_ids: ["EV1", "EV2"],
    eta_shelter_min: 0,
    expected_dose_ugy: 0,
    stops_dropped: [],
    violations: [],
    rank: 1,
    path_preview: [],
    rendezvous: null,
  };

  /** EV1 far east, EV2 at the hab (EV2 is visited first, see the test above); the summon names an option for both. */
  function dispatchedPair(scn: LoadedScenario = sc, ev1: XY = CREW_XY, ev2: XY = HAB_XY, vehicle: XY = VEHICLE_XY) {
    let s = setUp(scn, { EV1: ev1, EV2: ev2 }, vehicle, pr1Params.param_set_id);
    s = apply(s, "OPTIONS_PROPOSED", { alert_id: OPTION.alert_id, options: [OPTION] });
    const out = handleSummon(s, scn, summonCmd({ crew: ["EV1", "EV2"], option_id: OPTION.option_id }));
    expect(out.result.ok, JSON.stringify(out.result)).toBe(true);
    const rv = (out.events[0]!.data as LogEventData["VEHICLE_DISPATCHED"]).rendezvous!;
    // The first-visited crew member stands at the meeting point (crew hold there, rule S5); the other holds where it is.
    const first = withCrew(applyEvents(s, out.events), "EV2", { x_m: rv.x_m, y_m: rv.y_m });
    return { state: first, rv };
  }
  const sheltered = (ticks: Tick[]) => ticks.flatMap((t) => t.events.filter((e) => e.kind === "CREW_SHELTERED"));

  it("shelters EV2 at the first point, then drives to EV1 and shelters it, both with haven_kind vehicle", () => {
    const { state, rv } = dispatchedPair();
    const ticks = drive(state, sc, 4000, (t) => t.after.crew.every((c) => c.activity === "SHELTERED"));
    const last = ticks[ticks.length - 1]!;
    expect(last.after.crew.map((c) => c.activity)).toEqual(["SHELTERED", "SHELTERED"]);
    const events = sheltered(ticks);
    expect(events.map((e) => [(e.data as LogEventData["CREW_SHELTERED"]).crew_id, (e.data as LogEventData["CREW_SHELTERED"]).haven_kind])).toEqual([
      ["EV2", "vehicle"],
      ["EV1", "vehicle"],
    ]);
    const arrivals = ticks.flatMap((t) => t.events.filter((e) => e.kind === "VEHICLE_ARRIVED"));
    expect(arrivals).toHaveLength(2);
    expect(arrivals[0]!.data).toMatchObject({ x_m: rv.x_m, y_m: rv.y_m });
    expect(arrivals[1]!.data).toMatchObject({ x_m: CREW_XY.x_m, y_m: CREW_XY.y_m });
  });

  it("the second drive starts only after the first CREW_SHELTERED, and takes the oracle's ETA from the first point", () => {
    const { state, rv } = dispatchedPair();
    const ticks = drive(state, sc, 4000, (t) => t.after.crew.every((c) => c.activity === "SHELTERED"));
    const firstShelter = ticks.findIndex((t) => t.events.some((e) => e.kind === "CREW_SHELTERED"));
    const secondArrival = ticks.findIndex((t, i) => i > firstShelter && t.events.some((e) => e.kind === "VEHICLE_ARRIVED"));
    expect(firstShelter).toBeGreaterThanOrEqual(0);
    expect(secondArrival).toBeGreaterThan(firstShelter);
    // Between the two the vehicle is on the road again.
    const mid = ticks[firstShelter + 2]!;
    expect(pr1(mid.after).state).toBe("EN_ROUTE");
    // The oracle: zero-limit crew field at EV1 (its own cell is the only candidate), vehicle field from the first point.
    const plan = sc.scenario.plan!.scenario;
    const second = ok(rendezvous(crewTimeField(sc.grid!, CREW_XY, plan, 0), vehicleTimeField(sc.grid!, { x_m: rv.x_m, y_m: rv.y_m }, pr1Params), vehiclePassable(sc.grid!, pr1Params)));
    const driveTicks = secondArrival - firstShelter;
    expect(Math.abs(driveTicks - Math.round(second.eta_vehicle_s))).toBeLessThanOrEqual(2);
  });

  it("logs no event kind the one-crew summon does not, and the same keys", () => {
    const { state } = dispatchedPair();
    const ticks = drive(state, sc, 4000, (t) => t.after.crew.every((c) => c.activity === "SHELTERED"));
    const all = ticks.flatMap((t) => t.events);
    expect([...new Set(all.map((e) => e.kind))].sort()).toEqual(["CREW_SHELTERED", "VEHICLE_ARRIVED"]);
    for (const e of all.filter((x) => x.kind === "VEHICLE_ARRIVED")) expect(Object.keys(e.data).sort()).toEqual(["vehicle_id", "x_m", "y_m"]);
    for (const e of all.filter((x) => x.kind === "CREW_SHELTERED")) expect(Object.keys(e.data).sort()).toEqual(["crew_id", "dose_event_ugy", "dose_event_unsheltered_ugy", "haven_kind"]);
  });

  it("is deterministic: two runs give identical event lists", () => {
    const run = () => drive(dispatchedPair().state, sc, 4000, (t) => t.after.crew.every((c) => c.activity === "SHELTERED")).flatMap((t) => t.events);
    expect(run()).toEqual(run());
  });

  it("a one-crew summon never drives a second meeting: the vehicle stays ARRIVED once its crew member is sheltered", () => {
    let s = setUp(sc, { EV1: CREW_XY, EV2: HAB_XY }, VEHICLE_XY, pr1Params.param_set_id);
    s = apply(s, "OPTIONS_PROPOSED", { alert_id: "a-1", options: [{ ...OPTION, option_id: "o1", alert_id: "a-1", crew_ids: ["EV2"] }] });
    const out = handleSummon(s, sc, summonCmd({ crew: ["EV2"], option_id: "o1" }));
    const rv = (out.events[0]!.data as LogEventData["VEHICLE_DISPATCHED"]).rendezvous!;
    const start = withCrew(applyEvents(s, out.events), "EV2", { x_m: rv.x_m, y_m: rv.y_m });
    const ticks = drive(start, sc, 3000, (t) => t.after.crew.find((c) => c.crew_id === "EV2")!.activity === "SHELTERED");
    const after = drive(ticks[ticks.length - 1]!.after, sc, 50);
    expect(after.every((t) => t.events.length === 0)).toBe(true);
    expect(pr1(after[after.length - 1]!.after).state).toBe("ARRIVED");
  });

  it("does not leave for the second meeting before anyone is sheltered (the first crew member may still be walking in)", () => {
    const { state } = dispatchedPair();
    // Move EV2 (the first-visited) away from the meeting point so nobody can be sheltered on arrival.
    const away = withCrew(state, "EV2", { x_m: state.crew.find((c) => c.crew_id === "EV2")!.x_m + 50 * SHELTER_REACH_M });
    const ticks = drive(away, sc, 4000, (t) => t.events.some((e) => e.kind === "VEHICLE_ARRIVED"));
    const arrived = ticks[ticks.length - 1]!.after;
    const wait = drive(arrived, sc, 40);
    expect(wait.every((t) => t.events.length === 0)).toBe(true);
    expect(pr1(wait[wait.length - 1]!.after).state).toBe("ARRIVED");
  });

  it("an unreachable second crew member is not served: the vehicle shelters the first and stays ARRIVED (their alert stays latched)", () => {
    const blocked = rendezvousBlockedVehicle(5);
    const bsc = scenarioWith(blocked.grid, defaultScenario(), [pr1Params]);
    const inside = blocked.shape.vehicle;
    const outside = blocked.shape.crew;
    const vehicle = { x_m: (inside.x_m + outside.x_m) / 2, y_m: outside.y_m };
    let s = setUp(bsc, { EV1: inside, EV2: outside }, vehicle, pr1Params.param_set_id);
    s = apply(s, "OPTIONS_PROPOSED", { alert_id: OPTION.alert_id, options: [OPTION] });
    const out = handleSummon(s, bsc, summonCmd({ crew: ["EV1", "EV2"], option_id: OPTION.option_id }));
    expect(out.result.ok, JSON.stringify(out.result)).toBe(true);
    const rv = (out.events[0]!.data as LogEventData["VEHICLE_DISPATCHED"]).rendezvous!;
    const start = withCrew(applyEvents(s, out.events), "EV2", { x_m: rv.x_m, y_m: rv.y_m });
    const ticks = drive(start, bsc, 4000, (t) => t.after.crew.find((c) => c.crew_id === "EV2")!.activity === "SHELTERED");
    const idle = drive(ticks[ticks.length - 1]!.after, bsc, 60);
    expect(idle.every((t) => t.events.length === 0)).toBe(true);
    const end = idle[idle.length - 1]!.after;
    expect(pr1(end).state).toBe("ARRIVED");
    expect(end.crew.find((c) => c.crew_id === "EV1")!.activity).not.toBe("SHELTERED");
  });

  it("the deltas of the second drive include the new task target, so clients see where the vehicle is going", () => {
    const { state } = dispatchedPair();
    const ticks = drive(state, sc, 4000, (t) => t.after.crew.every((c) => c.activity === "SHELTERED"));
    const firstShelter = ticks.findIndex((t) => t.events.some((e) => e.kind === "CREW_SHELTERED"));
    const departure = ticks[firstShelter + 1]!;
    expect(departure.deltas.map((d) => d.path)).toEqual(expect.arrayContaining([`vehicles/${PR1_ID}/state`, `vehicles/${PR1_ID}/task`]));
    expect(pr1(departure.after).task!.target).toEqual({ x_m: CREW_XY.x_m, y_m: CREW_XY.y_m });
  });
});

// ---------------------------------------------------------------------------
// Rejections (02 §E.6): INVALID before any event
// ---------------------------------------------------------------------------

describe("SUMMON_VEHICLE argument and state checks", () => {
  const OPTION: ContingencyOption = {
    option_id: "o1",
    alert_id: "a-1",
    kind: "VEHICLE_RENDEZVOUS",
    crew_ids: ["EV1"],
    eta_shelter_min: 0,
    expected_dose_ugy: 0,
    stops_dropped: [],
    violations: [],
    rank: 1,
    path_preview: [],
    rendezvous: null,
  };
  const withOption = () => apply(ridgeStart(), "OPTIONS_PROPOSED", { alert_id: OPTION.alert_id, options: [OPTION] });

  it.each([
    ["an unknown crew id", { crew: ["EV9"] }],
    ["one known and one unknown crew id", { crew: ["EV1", "EV9"] }],
    ["more than two crew", { crew: ["EV1", "EV2", "EV1"] }],
    ["a duplicate crew id", { crew: ["EV1", "EV1"] }],
    ["a non-string crew id", { crew: [1] }],
    ["no crew", { crew: [] }],
    ["crew not an array", { crew: "EV1" }],
    ["an unknown option_id", { crew: ["EV1"], option_id: "o-missing" }],
    ["crew that differ from the option's crew", { crew: ["EV2"], option_id: "o1" }],
  ])("answers INVALID for %s, with no event", (_label, args) => {
    const out = handleSummon(withOption(), ridgeSc, summonCmd(args as Record<string, unknown>));
    expect(out.result).toMatchObject({ ok: false, code: "INVALID" });
    expect(out.events).toEqual([]);
  });

  it("answers INVALID, not BUSY, when the scenario has no pressurized rover", () => {
    const s = { ...ridgeStart(), vehicles: [] };
    const out = handleSummon(s, ridgeSc, summonCmd({ crew: ["EV1"] }));
    expect(out.result).toMatchObject({ ok: false, code: "INVALID" });
    expect(out.events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The shared dispatch helper (T23.07 reuses it for APPROVE_OPTION VEHICLE_RENDEZVOUS)
// ---------------------------------------------------------------------------

describe("dispatchVehicle (shared with T23.07)", () => {
  it("gives the same VEHICLE_DISPATCHED as handleSummon, with the given actor and no command_ref", () => {
    const state = ridgeStart();
    const viaHelper = dispatchVehicle(state, ridgeSc, { crew_ids: ["EV1"], actor: "system" });
    const viaSummon = handleSummon(state, ridgeSc, summonCmd({ crew: ["EV1"] }));
    expect(viaHelper.ok).toBe(true);
    if (!viaHelper.ok) return;
    expect(viaHelper.events).toHaveLength(1);
    expect(viaHelper.events[0]).toEqual({ ...viaSummon.events[0], actor: "system" });
    expect(viaHelper.events[0]!.command_ref).toBeUndefined();
  });

  it("answers BUSY when the vehicle is not PARKED", () => {
    const { state: dispatched } = summonRidge();
    expect(dispatchVehicle(dispatched, ridgeSc, { crew_ids: ["EV1"], actor: "ops" })).toMatchObject({ ok: false, code: "BUSY" });
  });
});

// ---------------------------------------------------------------------------
// Sheltering reach (T23.04, ratified BD-72: SHELTER_REACH_M = 1 m)
// ---------------------------------------------------------------------------

describe("CREW_SHELTERED reach and provenance", () => {
  const target = ridge.shape.footCell;
  function arrivedAt(offset_m: number): EngineState {
    let s = ridgeStart();
    s = apply(s, "OPTIONS_PROPOSED", {
      alert_id: "a-1",
      options: [{ option_id: "o1", alert_id: "a-1", kind: "VEHICLE_RENDEZVOUS", crew_ids: ["EV1"], eta_shelter_min: 0, expected_dose_ugy: 0, stops_dropped: [], violations: [], rank: 1, path_preview: [], rendezvous: null }],
    });
    s = apply(s, "VEHICLE_DISPATCHED", { vehicle_id: PR1_ID, option_id: "o1", rendezvous: { x_m: target.x_m, y_m: target.y_m, eta_crew_s: 0, eta_vehicle_s: 0 } });
    s = apply(s, "VEHICLE_ARRIVED", { vehicle_id: PR1_ID, x_m: target.x_m, y_m: target.y_m });
    return withCrew(s, "EV1", { x_m: target.x_m + offset_m, y_m: target.y_m, activity: "TO_HAVEN" });
  }

  it("the code's reach is the T23.04 decided value", () => {
    expect(SHELTER_REACH_M).toBe(DECIDED_REACH_M);
  });

  it("shelters a crew member half the reach away, with the doses labelled simulated", () => {
    const [t] = drive(arrivedAt(DECIDED_REACH_M / 2), ridgeSc, 1);
    const sheltered = t!.events.filter((e) => e.kind === "CREW_SHELTERED");
    expect(sheltered).toHaveLength(1);
    expect(sheltered[0]!.provenance).toEqual({ "data.dose_event_ugy": "simulated", "data.dose_event_unsheltered_ugy": "simulated" });
  });

  it("does not shelter a crew member twice the reach away", () => {
    const [t] = drive(arrivedAt(2 * DECIDED_REACH_M), ridgeSc, 1);
    expect(t!.events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Re-review round (8 Nov): pair fallback, one unreachable crew member, zero ETA, dt_s, crew state
// ---------------------------------------------------------------------------

describe("two crew: fallbacks (Proposed 2026-11-08)", () => {
  const sc = scenarioWith(flat.grid, defaultScenario(), [pr1Params]);
  const meet = (r: RendezvousOk): number => Math.max(r.eta_crew_s, r.eta_vehicle_s);

  it("when rendezvousPair throws, goes to the earlier meeting point", () => {
    const a = ok(oracle(sc, CREW_XY, VEHICLE_XY, pr1Params));
    const b = ok(oracle(sc, HAB_XY, VEHICLE_XY, pr1Params));
    expect(meet(b), "set-up: the second-named crew member meets earlier").toBeLessThan(meet(a));
    const s = setUp(sc, { EV1: CREW_XY, EV2: HAB_XY }, VEHICLE_XY, pr1Params.param_set_id);
    pairSwitch.throwPair = true;
    let out: ReturnType<typeof handleSummon>;
    try {
      out = handleSummon(s, sc, summonCmd({ crew: ["EV1", "EV2"] }));
    } finally {
      pairSwitch.throwPair = false;
    }
    expect(out.result.ok, JSON.stringify(out.result)).toBe(true);
    const rv = (out.events[0]!.data as LogEventData["VEHICLE_DISPATCHED"]).rendezvous!;
    expect({ x_m: rv.x_m, y_m: rv.y_m }).toEqual({ x_m: b.x_m, y_m: b.y_m });
  });

  it("when only one of two crew has a rendezvous, dispatches to that one (the other is not served)", () => {
    const blocked = rendezvousBlockedVehicle(5);
    const bsc = scenarioWith(blocked.grid, defaultScenario(), [pr1Params]);
    // EV1 stands inside the hazard ring; EV2 outside; PR1 halfway between them, outside the ring.
    const inside = blocked.shape.vehicle;
    const outside = blocked.shape.crew;
    const vehicle = { x_m: (inside.x_m + outside.x_m) / 2, y_m: outside.y_m };
    expect(oracle(bsc, inside, vehicle, pr1Params).status, "set-up: EV1 cannot be met").toBe("NO_RENDEZVOUS");
    const reachable = ok(oracle(bsc, outside, vehicle, pr1Params));
    const s = setUp(bsc, { EV1: inside, EV2: outside }, vehicle, pr1Params.param_set_id);
    for (const crew of [["EV1", "EV2"], ["EV2", "EV1"]]) {
      const out = handleSummon(s, bsc, summonCmd({ crew }));
      expect(out.result.ok, JSON.stringify(out.result)).toBe(true);
      const rv = (out.events[0]!.data as LogEventData["VEHICLE_DISPATCHED"]).rendezvous!;
      expect({ x_m: rv.x_m, y_m: rv.y_m }).toEqual({ x_m: reachable.x_m, y_m: reachable.y_m });
    }
  });
});

describe("no teleport: zero ETA and missing ETA (Proposed 2026-11-08)", () => {
  it("logs eta_vehicle_s of at least 1 s when the path has length, and arrives on tick 1 without a jump", () => {
    const sc = scenarioWith(flat.grid, defaultScenario(), [pr1Params]);
    const rv0 = ok(oracle(sc, HAB_XY, HAB_XY, pr1Params));
    const route: [number, number][] = [[HAB_XY.x_m, HAB_XY.y_m], ...rv0.vehicle_path];
    expect(Math.round(rv0.eta_vehicle_s), "set-up: compute's vehicle ETA rounds to 0 s").toBe(0);
    expect(polylineLength(route), "set-up: but the path has length").toBeGreaterThan(0);

    const s = setUp(sc, { EV1: HAB_XY }, HAB_XY, pr1Params.param_set_id);
    const out = handleSummon(s, sc, summonCmd({ crew: ["EV1"] }));
    const rv = (out.events[0]!.data as LogEventData["VEHICLE_DISPATCHED"]).rendezvous!;
    expect(rv.eta_vehicle_s).toBe(DT_S);
    const ticks = drive(applyEvents(s, out.events), sc, 2);
    expect(arrivedTick(ticks)!.k).toBe(1);
    expect(pr1(ticks[0]!.after)).toMatchObject({ state: "ARRIVED", x_m: rv.x_m, y_m: rv.y_m });
  });

  it.each([0, -1, null])("an EN_ROUTE vehicle with path ahead and eta_s %s stays put and does not arrive", (eta) => {
    const s = withPr1(ridgeStart(), { state: "EN_ROUTE", path: ridgeOracle.vehicle_path, eta_s: eta, task: { kind: "SUMMON", target: { x_m: ridgeOracle.x_m, y_m: ridgeOracle.y_m } } });
    const [t] = drive(s, ridgeSc, 1);
    expect(t!.events).toEqual([]);
    expect(t!.deltas).toEqual([]);
    expect(pr1(t!.after)).toMatchObject({ state: "EN_ROUTE", x_m: ridge.shape.vehicle.x_m, y_m: ridge.shape.vehicle.y_m, eta_s: eta });
  });

  it("a VEHICLE_DISPATCHED without a rendezvous (eta_s null) stays DISPATCHED with no path and no motion", () => {
    const s = apply(ridgeStart(), "VEHICLE_DISPATCHED", { vehicle_id: PR1_ID });
    expect(pr1(s)).toMatchObject({ state: "DISPATCHED", eta_s: null });
    for (const t of drive(s, ridgeSc, 3)) {
      expect(t.events).toEqual([]);
      expect(t.deltas).toEqual([]);
      expect(pr1(t.after)).toMatchObject({ state: "DISPATCHED", path: [], x_m: ridge.shape.vehicle.x_m, y_m: ridge.shape.vehicle.y_m });
    }
  });
});

describe("motion with dt_s = 2", () => {
  it("covers remaining length × dt_s ÷ eta_s per tick, counts eta_s down by dt_s, arrives on tick ceil(eta_s ÷ dt_s)", () => {
    const dt = 2 * DT_S;
    const { state: dispatched } = summonRidge();
    const target = pr1(dispatched).task!.target;
    const eta0 = pr1(dispatched).eta_s!;
    const route: [number, number][] = [[ridge.shape.vehicle.x_m, ridge.shape.vehicle.y_m], ...ridgeOracle.vehicle_path];
    const perTick = (polylineLength(route) / eta0) * dt;
    const arriveK = Math.ceil(eta0 / dt);
    expect(arriveK, "set-up: several ticks of motion").toBeGreaterThan(DT_S);

    const ticks = drive(dispatched, ridgeSc, arriveK + 2, undefined, dt);
    expect(arrivedTick(ticks)!.k).toBe(arriveK);
    let prev: [number, number] = [ridge.shape.vehicle.x_m, ridge.shape.vehicle.y_m];
    for (const t of ticks.filter((t) => t.k < arriveK)) {
      const v = pr1(t.after);
      const step = Math.hypot(v.x_m - prev[0], v.y_m - prev[1]);
      expect(step, `tick ${t.k}`).toBeLessThanOrEqual(perTick + 1e-6);
      expect(distToPolyline(v.x_m, v.y_m, route)).toBeLessThanOrEqual(1e-6);
      expect(v.eta_s, `tick ${t.k}`).toBe(eta0 - t.k * dt);
      expect(arcAt(v.x_m, v.y_m, route), `tick ${t.k}: progress along the path`).toBeCloseTo(t.k * perTick, 6);
      prev = [v.x_m, v.y_m];
    }
    expect(pr1(ticks[arriveK - 1]!.after)).toMatchObject({ state: "ARRIVED", x_m: target.x_m, y_m: target.y_m, eta_s: 0 });
  });
});

describe("crew who are already safe (Proposed 2026-11-08)", () => {
  it.each(["SHELTERED", "IN_HAB"] as const)("answers INVALID when a named crew member is %s", (activity) => {
    const s = withCrew(ridgeStart(), "EV1", { activity });
    const out = handleSummon(s, ridgeSc, summonCmd({ crew: ["EV1"] }));
    expect(out.result).toMatchObject({ ok: false, code: "INVALID" });
    expect(out.events).toEqual([]);
    expect(dispatchVehicle(s, ridgeSc, { crew_ids: ["EV1"], actor: "ops" })).toMatchObject({ ok: false, code: "INVALID" });
  });
});
