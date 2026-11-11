/**
 * T23.07 review (8 Nov): contingency options, APPROVE_OPTION and ABORT against the REAL
 * @marswalk/compute (docs/specs/02 §D.8, §D.10, §D.15; 03 §E.5; 05 ContingencyOption, Leg,
 * LogEvent; FR-44, NFR-06). TASK-23.
 *
 * Proposed 2026-11-08 — TODO(decision): this file is new. `contingencyOps.test.ts` (T23.06) replaces
 * compute with a fixture stand-in, so it cannot see what the engine hands to compute (ingress,
 * shielding, positions, `pair`) or what it does with a null grid. Here compute is the real one; the
 * only hook is a pass-through on `proposeOptions` that records its inputs and, for one test, adds a
 * non-finite option. The grid is the synthetic F9 `havenFlat` fixture
 * (`packages/compute/tests/fixtures/v2grids.ts`) tilted 5° (see `tilted` below), whose hab is at the
 * origin like the fake scenario's start waypoint. Expected values come from the same compute functions (the oracle), the fixture
 * scenario, or `HAB_INGRESS_S`; nothing is typed in as a science number.
 *
 * Rules checked here (TASK-23 T23.07, Proposed 2026-11-08):
 * - No grid (the scenario loader gives null until TASK-05): no options, no throw, no events.
 * - Inputs: hab = the plan's `role: "start"` waypoint; ingress = {HAB_INGRESS_S, the rover's own
 *   ParamSet `ingress_min` × 60}; shielding = the scenario's `shielding` ParamSet; the vehicle field
 *   starts at the rover's position; crew fields bounded at L = `max_haven_min` × 60 s (02 §D.10);
 *   two crew with OK rendezvous get `pair` from `rendezvousPair`. No vehicle option unless the rover is PARKED.
 * - An alert gets one OPTIONS_PROPOSED, ever: no re-proposal after an option was approved, even
 *   CONTINUE_SKIP (crew stay WALKING). A new alert is answered again.
 * - Options with a non-finite number are dropped before logging; the rest are re-ranked 1..n.
 * - The new leg: `walk_time_min` excludes ingress (ETA − ingress; for a rendezvous the crew's walk
 *   `eta_crew_s`), `distance_m` is the polyline length of the option's path in projected metres.
 * - Provenance: options' ETA and dose `modelled` (05), VEHICLE_DISPATCHED rendezvous `modelled`.
 * - APPROVE_OPTION for a rendezvous when the rover is not PARKED: BUSY, no events.
 * - ABORT: EVA self rule for EV2 too; with two warnings the newest alert's ABORT_TO_HAB is executed.
 * - Tick rule S5, tightened (decided by the orchestrator 2026-11-08, Proposed): a route whose last leg
 *   ends at the start waypoint shelters in the hab only if the crew member ends within
 *   SHELTER_REACH_M of the start waypoint's position. A VEHICLE_RENDEZVOUS revision ends at the meeting
 *   point, so the crew hold there and vehiclesTick shelters them in the vehicle when it arrives.
 * - APPROVE_OPTION dispatches through T23.05's `dispatchVehicle` with the option's own rendezvous
 *   (precomputed, logged verbatim); the reducer keeps `Vehicle.eta_s` an integer (Math.ceil).
 * - Final round (orchestrator decisions, 8 Nov): S5 holds a crew member for the vehicle only while a
 *   rover's SUMMON task names them and they ended off the start waypoint; otherwise a route ending at
 *   the start waypoint shelters in the hab as before. A compute RangeError never stops the engine:
 *   no vehicle option if the vehicle side throws, no options if the hab side throws; NO_RENDEZVOUS
 *   from dispatchVehicle.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cellIndex,
  crewTimeField,
  habTimeField,
  HAB_INGRESS_S,
  proposeOptions,
  rendezvous,
  rendezvousPair,
  sampleProfile,
  toLeg,
  vehiclePassable,
  vehicleTimeField,
  type ContingencyInputs,
  type LoadedGrid,
  type RendezvousOk,
} from "@marswalk/compute";
import type { Command, ContingencyOption, CrewId, LogEvent, LogEventData, LogEventKind, OkLeg, Role, Vehicle } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand, type CommandContext } from "../src/commands";
import { contingencyTick } from "../src/engine/contingencyOps";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import { tick, type TickContext } from "../src/engine/tick";
import { dispatchVehicle, SHELTER_REACH_M } from "../src/engine/vehicles";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { havenFlat } from "../../../packages/compute/tests/fixtures/v2grids";

// ---- pass-through hook on proposeOptions (real compute otherwise) -------------------------------------------

const hook = vi.hoisted(() => ({
  calls: [] as unknown[],
  extra: null as null | ((options: unknown[]) => unknown[]),
  /** Cell lists handed to `toLeg` (T23.07 follow-up). */
  toLegCells: [] as number[][],
  /** When set, `toLeg` / `sampleProfile` throw it (a forced compute failure). */
  toLegThrows: null as null | Error,
  sampleProfileThrows: null as null | Error,
}));
vi.mock("@marswalk/compute", async () => {
  const actual = await vi.importActual<typeof import("@marswalk/compute")>("@marswalk/compute");
  return {
    ...actual,
    proposeOptions: (inputs: ContingencyInputs) => {
      hook.calls.push(inputs);
      const out = actual.proposeOptions(inputs);
      return hook.extra ? hook.extra(out) : out;
    },
    toLeg: (...args: Parameters<typeof actual.toLeg>) => {
      const search = args[3];
      if (search.status === "OK") hook.toLegCells.push([...search.cells]);
      if (hook.toLegThrows) throw hook.toLegThrows;
      return actual.toLeg(...args);
    },
    sampleProfile: (...args: Parameters<typeof actual.sampleProfile>) => {
      if (hook.sampleProfileThrows) throw hook.sampleProfileThrows;
      return actual.sampleProfile(...args);
    },
  };
});
beforeEach(() => {
  hook.calls.length = 0;
  hook.extra = null;
  hook.toLegCells.length = 0;
  hook.toLegThrows = null;
  hook.sampleProfileThrows = null;
});

// ---- scenario and states ----------------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
/**
 * The F9 `havenFlat` shape at 10 m (coarser than the 5 m default only to keep the Dijkstra runs short), tilted
 * for the leg-metric tests (T23.07 follow-up, 9 Nov): elevation = x · tan(5°) at each cell centre, and the slope
 * bands encoded from it with the 05 ×4 u8 rule. On the flat grid every climb, descent and slope is 0, so
 * "0 === 0" would prove nothing. 5° is below the fake plan's caution limit (10°) and hard limit (15°), so
 * routes stay the F9 straight lines. A declared test shape, not a science value.
 */
const TILT_DEG = 5;
function tilted(base: LoadedGrid): LoadedGrid {
  const { width, height, cell_m, origin_m } = base.meta;
  const g: LoadedGrid = { ...base, elevation: new Float32Array(base.elevation), slopeP90: new Uint8Array(base.slopeP90), slopeMax: new Uint8Array(base.slopeMax) };
  const rise = cell_m * Math.tan((TILT_DEG * Math.PI) / 180);
  const slopeU8 = Math.round(((Math.atan(rise / cell_m) * 180) / Math.PI) * 4);
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const k = i * width + j;
      g.elevation[k] = ((origin_m[0] + (j + 0.5) * cell_m) / cell_m) * rise;
      g.slopeP90[k] = slopeU8;
      g.slopeMax[k] = slopeU8;
    }
  }
  return g;
}
const grid = tilted(havenFlat(10).grid);
const sc: LoadedScenario = { ...fake, grid };
const plan = sc.scenario.plan;
const START = plan.waypoints.find((w) => w.role === "start")!;
const STOP1 = plan.waypoints.filter((w) => w.role === "stop")[0]!;
const PR = sc.scenario.vehicles.find((v) => v.kind === "pressurized_rover")!;
const PR_PARAMS = sc.params[PR.param_set]!;
const SHIELDING = Object.values(sc.params).find((p) => p.kind === "shielding")!;
const T_ALERT = new Date(Date.parse(sc.scenario.start_utc) + 3600_000).toISOString().replace(".000Z", "Z");

function apply(state: EngineState, kind: LogEventKind, data: LogEventData[LogEventKind], actor: Role | "system" = "system"): EngineState {
  const event: LogEvent = { seq: state.session.last_seq + 1, sim_time: state.session.clock.sim_time, kind, actor, data: data as Record<string, unknown>, provenance: {}, command_ref: null };
  return reduce(state, event);
}
const applyAll = (state: EngineState, events: PendingEvent[]): EngineState => events.reduce((s, e) => reduce(s, logged(e, s.session.last_seq + 1)), state);
const at = (s: EngineState, t: string): EngineState => ({ ...s, session: { ...s.session, clock: { ...s.session.clock, sim_time: t } } });
const withCrew = (s: EngineState, id: CrewId, patch: Partial<EngineState["crew"][number]>): EngineState => ({ ...s, crew: s.crew.map((c) => (c.crew_id === id ? { ...c, ...patch } : c)) });
const withPr = (s: EngineState, patch: Partial<Vehicle>): EngineState => ({ ...s, vehicles: s.vehicles.map((v) => (v.vehicle_id === PR.vehicle_id ? { ...v, ...patch } : v)) });

let n = 0;
const cmd = (role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command => ({ command_id: `real-${++n}`, role, kind, args });
const cctx = (state: EngineState, scenario: LoadedScenario = sc): CommandContext => ({ scenario, client_id: "c-1", next_seq: state.session.last_seq + 1, accepted: new AcceptedCommands() });
const tctx = (state: EngineState, scenario: LoadedScenario = sc): TickContext => ({ scenario, dt_s: 1, next_seq: state.session.last_seq + 1 });

/** EVA running, both crew at stop 1 (AT_STOP, positioned on the stop), then a RADIATION_ALERT warning. */
function alertedOn(scenario: LoadedScenario): EngineState {
  let s = apply(initialState(scenario, "s-0001"), "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops");
  for (const id of ["EV1", "EV2"] as const) {
    s = apply(s, "ARRIVED_STOP", { crew_id: id, stop_id: STOP1.id, stop_index: 1 });
    s = withCrew(s, id, { x_m: STOP1.x_m, y_m: STOP1.y_m });
  }
  s = at(s, T_ALERT);
  return apply(s, "ALERT_RAISED", { alert_id: `a-${s.session.last_seq + 1}`, code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "Radiation surge — shelter now" });
}
const alerted = alertedOn(sc);
const ALERT_ID = alerted.alerts[0]!.alert_id;

/** The oracle: the inputs 02 §D.15 needs, built here from compute and the fixture alone. */
function oracleInputs(state: EngineState): ContingencyInputs {
  const scen = (state.plan ?? plan).scenario;
  const L = scen.max_haven_min * 60;
  const crew = state.crew.filter((c) => c.activity === "WALKING" || c.activity === "AT_STOP");
  const pr = state.vehicles.find((v) => v.vehicle_id === PR.vehicle_id)!;
  const fromVehicle = vehicleTimeField(grid, { x_m: pr.x_m, y_m: pr.y_m }, PR_PARAMS);
  const passable = vehiclePassable(grid, PR_PARAMS);
  const rv = Object.fromEntries(crew.map((c) => [c.crew_id, rendezvous(crewTimeField(grid, { x_m: c.x_m, y_m: c.y_m }, scen, L), fromVehicle, passable)]));
  const oks = crew.map((c) => rv[c.crew_id]).filter((r): r is RendezvousOk => r?.status === "OK");
  const pair = oks.length === 2 ? rendezvousPair(oks[0]!, oks[1]!, vehicleTimeField(grid, oks[0]!, PR_PARAMS), vehicleTimeField(grid, oks[1]!, PR_PARAMS)) : undefined;
  return {
    alert_id: ALERT_ID,
    crew,
    now_utc: state.session.clock.sim_time,
    hab: habTimeField(grid, { x_m: START.x_m, y_m: START.y_m }, scen),
    rendezvous: rv,
    ingress: { hab_s: HAB_INGRESS_S, vehicle_s: Number(PR_PARAMS.values.ingress_min) * 60 },
    ...(pair ? { pair } : {}),
    plan: { waypoints: plan.waypoints, legs: plan.result.legs },
    scenario: scen,
    series: sc.dose,
    shielding: SHIELDING,
  };
}
const EXPECTED = proposeOptions(oracleInputs(alerted));
const optionOf = (kind: ContingencyOption["kind"]): ContingencyOption => {
  const o = EXPECTED.find((x) => x.kind === kind);
  if (!o) throw new Error(`set-up: compute proposed no ${kind} option on the fixture`);
  return o;
};

const proposedState = (s: EngineState): EngineState => {
  const r = contingencyTick(s, tctx(s));
  return applyAll(r.state, r.events);
};
/** `alerted` after its OPTIONS_PROPOSED, built on first use (so a failure shows in the test, not at collection). */
let proposedMemo: EngineState | null = null;
const proposed = (): EngineState => (proposedMemo ??= proposedState(alerted));
const dataOf = <K extends LogEventKind>(events: PendingEvent[], kind: K): LogEventData[K] => events.find((e) => e.kind === kind)!.data as LogEventData[K];
const newLeg = (events: PendingEvent[]): OkLeg => {
  const legs = dataOf(events, "PLAN_REVISED").legs!;
  const leg = legs[legs.length - 1]!;
  if (leg.status !== "OK") throw new Error("the new leg must be OK");
  return leg;
};
function polylineLength(p: [number, number][]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]);
  return s;
}

// ---- contingencyTick --------------------------------------------------------------------------------------

describe("contingencyTick with no grid (scenario loader gives null until TASK-05)", () => {
  it("a warning plus a null grid gives no events and does not throw", () => {
    const nullGrid = alertedOn(fake);
    expect(fake.grid).toBeNull();
    const r = contingencyTick(nullGrid, tctx(nullGrid, fake));
    expect(r.events).toEqual([]);
    expect(r.deltas).toEqual([]);
    expect(hook.calls).toHaveLength(0);
  });
});

describe("contingencyTick on the real compute (02 §D.15; FR-44)", () => {
  it("hands compute the real inputs: start-waypoint hab, HAB_INGRESS_S and the rover's ingress_min, the shielding ParamSet, pair for two crew", () => {
    const r = contingencyTick(alerted, tctx(alerted));
    expect(r.events.map((e) => e.kind)).toEqual(["OPTIONS_PROPOSED"]);
    const asked = hook.calls[0] as ContingencyInputs;
    const want = oracleInputs(alerted);
    expect(asked.ingress).toEqual(want.ingress);
    expect(asked.shielding).toEqual(SHIELDING);
    expect(asked.pair).toEqual(want.pair);
    expect(want.pair).toBeDefined(); // the fixture gives both crew a rendezvous
    expect(dataOf(r.events, "OPTIONS_PROPOSED").options).toEqual(EXPECTED);
  });

  it("the logged options are those of the oracle inputs, all finite, and survive JSON", () => {
    const { options } = dataOf(contingencyTick(alerted, tctx(alerted)).events, "OPTIONS_PROPOSED");
    expect(options.map((o) => o.kind).sort()).toEqual(["ABORT_TO_HAB", "CONTINUE_SKIP", "VEHICLE_RENDEZVOUS"]);
    expect(JSON.parse(JSON.stringify(options))).toEqual(options);
  });

  it("labels the options' ETA and dose modelled (05 ContingencyOption)", () => {
    const e = contingencyTick(alerted, tctx(alerted)).events[0]!;
    // The key spelling of 05 §F.6 and the fixture `options-proposed`: data.options[].<field>.
    expect(e.provenance).toMatchObject({ "data.options[].eta_shelter_min": "modelled", "data.options[].expected_dose_ugy": "modelled", "data.options[].rendezvous": "modelled" });
    expect(Object.keys(e.provenance).filter((k) => k.startsWith("data.options."))).toEqual([]);
  });

  it("the vehicle field starts at the rover's real position", () => {
    const moved = withPr(alerted, { x_m: -1000, y_m: 0 });
    const { options } = dataOf(contingencyTick(moved, tctx(moved)).events, "OPTIONS_PROPOSED");
    const want = proposeOptions(oracleInputs(moved));
    expect(options).toEqual(want);
    expect(options.find((o) => o.kind === "VEHICLE_RENDEZVOUS")!.rendezvous).not.toEqual(optionOf("VEHICLE_RENDEZVOUS").rendezvous);
  });

  it("proposes no vehicle rendezvous while the rover is not PARKED (it could only be refused BUSY)", () => {
    const busy = withPr(alerted, { state: "DISPATCHED" });
    const { options } = dataOf(contingencyTick(busy, tctx(busy)).events, "OPTIONS_PROPOSED");
    expect(options.map((o) => o.kind)).not.toContain("VEHICLE_RENDEZVOUS");
    expect(options.length).toBeGreaterThan(0);
  });

  it("drops an option with a non-finite number and re-ranks the rest 1..n", () => {
    hook.extra = (out) => {
      const [first, ...rest] = out as ContingencyOption[];
      // Ranked by the stand-in as compute would rank them, so the bad ones hold ranks 2 and 3.
      const all = [first!, { ...first!, option_id: `${ALERT_ID}:BAD`, eta_shelter_min: Infinity }, { ...first!, option_id: `${ALERT_ID}:NAN`, rendezvous: { x_m: 0, y_m: 0, eta_crew_s: NaN, eta_vehicle_s: 0 } }, ...rest];
      return all.map((o, i) => ({ ...o, rank: i + 1 }));
    };
    const { options } = dataOf(contingencyTick(alerted, tctx(alerted)).events, "OPTIONS_PROPOSED");
    expect(options.map((o) => o.option_id)).toEqual(EXPECTED.map((o) => o.option_id));
    expect(options.map((o) => o.rank)).toEqual(EXPECTED.map((_, i) => i + 1));
  });

  it("does not propose again after CONTINUE_SKIP was approved (crew stay WALKING): 5 ticks, no OPTIONS_PROPOSED", () => {
    let s = proposedState(alerted);
    const out = handleCommand(s, cmd("ops", "APPROVE_OPTION", { option_id: optionOf("CONTINUE_SKIP").option_id }), cctx(s));
    expect(out.result.ok).toBe(true);
    s = applyAll(s, out.events);
    expect(s.options).toEqual([]);
    expect(s.crew.every((c) => c.activity === "WALKING" || c.activity === "AT_STOP")).toBe(true);
    for (let k = 0; k < 5; k++) {
      const r = contingencyTick(s, tctx(s));
      expect(r.events.filter((e) => e.kind === "OPTIONS_PROPOSED")).toEqual([]);
      s = applyAll(r.state, r.events);
    }
    expect(hook.calls).toHaveLength(1);
  });

  it("a new warning after an approved one is answered again", () => {
    let s = proposedState(alerted);
    s = applyAll(s, handleCommand(s, cmd("ops", "APPROVE_OPTION", { option_id: optionOf("CONTINUE_SKIP").option_id }), cctx(s)).events);
    s = apply(s, "ALERT_RAISED", { alert_id: `a-${s.session.last_seq + 1}`, code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "Radiation surge — shelter now" });
    const r = contingencyTick(s, tctx(s));
    expect(r.events.map((e) => e.kind)).toEqual(["OPTIONS_PROPOSED"]);
    expect(dataOf(r.events, "OPTIONS_PROPOSED").alert_id).toBe(s.alerts[1]!.alert_id);
  });
});

// ---- APPROVE_OPTION: the new leg ----------------------------------------------------------------------------

describe("APPROVE_OPTION on the real compute: the new leg (05 Leg; tick rules S2, S11)", () => {
  const approve = (kind: ContingencyOption["kind"], s: EngineState = proposed()) => handleCommand(s, cmd("ops", "APPROVE_OPTION", { option_id: optionOf(kind).option_id }), cctx(s));

  it("ABORT_TO_HAB: walk_time_min is the ETA without the hab ingress, distance_m the path's polyline length", () => {
    const leg = newLeg(approve("ABORT_TO_HAB").events);
    const o = optionOf("ABORT_TO_HAB");
    expect(leg.walk_time_min * 60).toBeCloseTo(o.eta_shelter_min * 60 - HAB_INGRESS_S, 6);
    expect(leg.walk_time_min).toBeGreaterThan(0);
    expect(leg.distance_m).toBeCloseTo(polylineLength(o.path_preview), 6);
    expect(leg.distance_m).toBeGreaterThan(0);
  });

  it("CONTINUE_SKIP: walk_time_min is the ETA without the hab ingress", () => {
    const leg = newLeg(approve("CONTINUE_SKIP").events);
    expect(leg.walk_time_min * 60).toBeCloseTo(optionOf("CONTINUE_SKIP").eta_shelter_min * 60 - HAB_INGRESS_S, 6);
  });

  it("VEHICLE_RENDEZVOUS: walk_time_min is the crew's walk to the meeting point (eta_crew_s), not the ETA with ingress", () => {
    const out = approve("VEHICLE_RENDEZVOUS");
    const o = optionOf("VEHICLE_RENDEZVOUS");
    expect(newLeg(out.events).walk_time_min * 60).toBeCloseTo(o.rendezvous!.eta_crew_s, 6);
    expect(newLeg(out.events).distance_m).toBeCloseTo(polylineLength(o.path_preview), 6);
  });

  it("every number in PLAN_REVISED is finite and JSON-safe", () => {
    for (const kind of ["ABORT_TO_HAB", "CONTINUE_SKIP", "VEHICLE_RENDEZVOUS"] as const) {
      const data = dataOf(approve(kind).events, "PLAN_REVISED");
      expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    }
  });

  it("labels the new leg's walk time modelled and its distance derived; VEHICLE_DISPATCHED's rendezvous modelled", () => {
    const out = approve("VEHICLE_RENDEZVOUS");
    const i = dataOf(out.events, "PLAN_REVISED").legs!.length - 1;
    expect(out.events.find((e) => e.kind === "PLAN_REVISED")!.provenance).toMatchObject({ [`data.legs.${i}.walk_time_min`]: "modelled", [`data.legs.${i}.distance_m`]: "derived" });
    expect(out.events.find((e) => e.kind === "VEHICLE_DISPATCHED")!.provenance).toEqual({ "data.rendezvous": "modelled" });
  });

  it("approving the rendezvous while the rover is not PARKED is BUSY and logs nothing but the rejection", () => {
    const busy = withPr(proposed(), { state: "EN_ROUTE" });
    const out = approve("VEHICLE_RENDEZVOUS", busy);
    expect(out.result).toMatchObject({ ok: false, code: "BUSY" });
    expect(out.events.map((e) => e.kind)).toEqual(["COMMAND_REJECTED"]);
  });
});

// ---- ABORT ------------------------------------------------------------------------------------------------

describe("ABORT on the real compute (02 §E.4 self rule; FR-44)", () => {

  it("eva:EV2 may abort for itself, and not for EV1 only", () => {
    const own = handleCommand(proposed(), cmd("eva:EV2", "ABORT", { crew: ["EV2"] }), cctx(proposed()));
    expect(own.result.ok).toBe(true);
    expect(dataOf(own.events, "PLAN_REVISED").option_id).toBe(optionOf("ABORT_TO_HAB").option_id);
    const other = handleCommand(proposed(), cmd("eva:EV2", "ABORT", { crew: ["EV1"] }), cctx(proposed()));
    expect(other.result).toMatchObject({ ok: false, code: "FORBIDDEN_ROLE" });
  });

  it("with two warnings answered, ABORT executes the newest alert's ABORT_TO_HAB, whatever the options' order", () => {
    let s = apply(proposed(), "ALERT_RAISED", { alert_id: `a-${proposed().session.last_seq + 1}`, code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "Radiation surge — shelter now" });
    s = proposedState(s);
    const newest = s.alerts.reduce((a, b) => (b.raised_seq > a.raised_seq ? b : a));
    const want = s.options.find((o) => o.kind === "ABORT_TO_HAB" && o.alert_id === newest.alert_id)!.option_id;
    const reversed = { ...s, options: [...s.options].reverse() };
    for (const state of [s, reversed]) {
      const out = handleCommand(state, cmd("ops", "ABORT", { crew: ["EV1"] }), cctx(state));
      expect(dataOf(out.events, "PLAN_REVISED").option_id).toBe(want);
    }
  });

  it("ABORT skips the options of a cleared alert: the older active alert's ABORT_TO_HAB is executed", () => {
    const olderId = proposed().alerts[0]!.alert_id;
    let s = apply(proposed(), "ALERT_RAISED", { alert_id: `a-${proposed().session.last_seq + 1}`, code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], message: "Radiation surge — shelter now" });
    s = proposedState(s);
    s = apply(s, "ALERT_CLEARED", { alert_id: s.alerts[1]!.alert_id });
    const out = handleCommand(s, cmd("ops", "ABORT", { crew: ["EV1"] }), cctx(s));
    expect(out.result.ok).toBe(true);
    expect(dataOf(out.events, "PLAN_REVISED").option_id).toBe(s.options.find((o) => o.kind === "ABORT_TO_HAB" && o.alert_id === olderId)!.option_id);
  });
});

// ---- the whole engine: rendezvous end and hab end (tick rule S5) ------------------------------------------

/** Run `tick()` (all modules) every `dt_s` until `stop` or `max` ticks; returns every event logged. */
function runTicks(start: EngineState, dt_s: number, max: number, stop: (s: EngineState) => boolean): { state: EngineState; events: PendingEvent[] } {
  let s = start;
  const events: PendingEvent[] = [];
  for (let k = 0; k < max && !stop(s); k++) {
    const stepped = at(s, new Date(Date.parse(s.session.clock.sim_time) + dt_s * 1000).toISOString().replace(".000Z", "Z"));
    const r = tick(stepped, sc, dt_s, stepped.session.last_seq + 1);
    events.push(...r.events);
    s = r.state;
  }
  return { state: s, events };
}
const sheltered = (events: PendingEvent[]) => events.filter((e) => e.kind === "CREW_SHELTERED").map((e) => e.data as LogEventData["CREW_SHELTERED"]);

describe("tick rule S5 with a revised plan (T22.09 rule tightened for T23.07)", () => {
  /** Ticks of 10 s keep the run short; the vehicle and the crew both need several minutes. */
  const DT = 10;
  const MAX = 400;
  const allSafe = (s: EngineState): boolean => s.crew.every((c) => c.activity === "SHELTERED" || c.activity === "IN_HAB");

  it("VEHICLE_RENDEZVOUS: the crew walk to the meeting point and hold (no hab shelter), then shelter in the vehicle when it arrives", () => {
    const out = handleCommand(proposed(), cmd("ops", "APPROVE_OPTION", { option_id: optionOf("VEHICLE_RENDEZVOUS").option_id }), cctx(proposed()));
    expect(out.result.ok).toBe(true);
    const start = applyAll(proposed(), out.events);
    const { state, events } = runTicks(start, DT, MAX, allSafe);
    const kinds = sheltered(events);
    expect(kinds.filter((d) => d.haven_kind === "hab")).toEqual([]);
    expect(kinds.filter((d) => d.haven_kind === "vehicle").map((d) => d.crew_id).sort()).toEqual(["EV1", "EV2"]);
    expect(events.some((e) => e.kind === "VEHICLE_ARRIVED")).toBe(true);
    const meet = optionOf("VEHICLE_RENDEZVOUS").rendezvous!;
    for (const c of state.crew) expect(Math.hypot(c.x_m - meet.x_m, c.y_m - meet.y_m)).toBeLessThanOrEqual(SHELTER_REACH_M);
  });

  it("ABORT_TO_HAB: the route ends at the start waypoint's position, so the crew shelter in the hab", () => {
    const out = handleCommand(proposed(), cmd("ops", "ABORT", { crew: ["EV1", "EV2"] }), cctx(proposed()));
    const { events } = runTicks(applyAll(proposed(), out.events), DT, MAX, allSafe);
    expect(sheltered(events).map((d) => [d.crew_id, d.haven_kind]).sort()).toEqual([
      ["EV1", "hab"],
      ["EV2", "hab"],
    ]);
  });
});

describe("a hab-bound leg ends on the start waypoint (so S5 can shelter it in the hab)", () => {
  it("an ABORT_TO_HAB path ending at the hab cell's centre, off the waypoint, gets the start waypoint as its last vertex", () => {
    const base = proposed();
    const abort = base.options.find((o) => o.kind === "ABORT_TO_HAB")!;
    const last = abort.path_preview[abort.path_preview.length - 1]!;
    // The neighbouring cell centre, farther from the waypoint than the reach (a declared test input, not science).
    // It stays on the grid's cell centres, which the leg-metric guard (T23.07 follow-up) requires.
    const off: [number, number] = [last[0] + grid.meta.cell_m, last[1]];
    expect(grid.meta.cell_m).toBeGreaterThan(SHELTER_REACH_M);
    const s = { ...base, options: base.options.map((o) => (o === abort ? { ...o, path_preview: [...o.path_preview.slice(0, -1), off] } : o)) };
    const leg = newLeg(handleCommand(s, cmd("ops", "APPROVE_OPTION", { option_id: abort.option_id }), cctx(s)).events);
    expect(leg.geometry[leg.geometry.length - 2]).toEqual(off);
    expect(leg.geometry[leg.geometry.length - 1]).toEqual([START.x_m, START.y_m]);
  });
});

// ---- dispatchVehicle with a precomputed rendezvous (T23.05 extension for T23.07) --------------------------

describe("dispatchVehicle with a precomputed rendezvous", () => {
  const point = { x_m: STOP1.x_m / 2, y_m: STOP1.y_m, eta_crew_s: 100.4, eta_vehicle_s: 200.2 };

  it("skips compute (works with no grid) and logs the given rendezvous verbatim, labelled modelled", () => {
    const s = alertedOn(fake);
    const out = dispatchVehicle(s, fake, { crew_ids: ["EV1"], actor: "ops", rendezvous: point });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ kind: "VEHICLE_DISPATCHED", actor: "ops", provenance: { "data.rendezvous": "modelled" } });
    expect(out.events[0]!.data).toEqual({ vehicle_id: PR.vehicle_id, rendezvous: point });
  });

  it("keeps the BUSY and INVALID checks", () => {
    const s = alertedOn(fake);
    expect(dispatchVehicle(withPr(s, { state: "EN_ROUTE" }), fake, { crew_ids: ["EV1"], actor: "ops", rendezvous: point })).toMatchObject({ ok: false, code: "BUSY" });
    expect(dispatchVehicle(s, fake, { crew_ids: ["EV9"], actor: "ops", rendezvous: point })).toMatchObject({ ok: false, code: "INVALID" });
    expect(dispatchVehicle(s, fake, { crew_ids: ["EV1"], actor: "ops", rendezvous: { ...point, eta_vehicle_s: Infinity } })).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("the reduced vehicle has a whole-second eta_s (05 Vehicle eta_s is an int)", () => {
    const s = alertedOn(fake);
    const out = dispatchVehicle(s, fake, { crew_ids: ["EV1"], actor: "ops", rendezvous: point });
    if (!out.ok) throw new Error(out.message);
    const v = applyAll(s, out.events).vehicles.find((x) => x.vehicle_id === PR.vehicle_id)!;
    expect(Number.isInteger(v.eta_s)).toBe(true);
    expect(v.eta_s).toBe(Math.ceil(point.eta_vehicle_s));
  });

  it("APPROVE_OPTION goes through dispatchVehicle: a crew member already SHELTERED makes the rendezvous INVALID", () => {
    const s = withCrew(proposed(), "EV2", { activity: "SHELTERED" });
    const out = handleCommand(s, cmd("ops", "APPROVE_OPTION", { option_id: optionOf("VEHICLE_RENDEZVOUS").option_id }), cctx(s));
    expect(out.result).toMatchObject({ ok: false, code: "INVALID" });
  });
});

// ---- final round: S5 without a vehicle task, compute RangeErrors, the two pinned mutants -----------------

describe("tick rule S5: a loop ending off the start waypoint still shelters in the hab unless a vehicle is coming", () => {
  /** The fake plan with its last (loop) leg ending 3 × SHELTER_REACH_M east of the start waypoint (a declared offset). */
  function offLoop(): EngineState {
    const s = apply(initialState(fake, "s-0001"), "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops");
    const legs = s.plan!.result.legs.map((l, i, all) => {
      if (i !== all.length - 1 || l.status !== "OK") return l;
      const g = l.geometry.map(([x, y]) => [x, y] as [number, number]);
      g[g.length - 1] = [START.x_m + 3 * SHELTER_REACH_M, START.y_m];
      return { ...l, geometry: g };
    });
    return { ...s, plan: { ...s.plan!, result: { ...s.plan!.result, legs } } };
  }
  function runFake(start: EngineState, dt: number, max: number): PendingEvent[] {
    let s = start;
    const events: PendingEvent[] = [];
    for (let k = 0; k < max && s.session.status === "RUNNING"; k++) {
      const stepped = at(s, new Date(Date.parse(s.session.clock.sim_time) + dt * 1000).toISOString().replace(".000Z", "Z"));
      const r = tick(stepped, fake, dt, stepped.session.last_seq + 1);
      events.push(...r.events);
      s = r.state;
    }
    return events;
  }

  it("with no vehicle task, both crew shelter in the hab and the EVA ends", () => {
    const events = runFake(offLoop(), 30, 600);
    expect(sheltered(events).map((d) => [d.crew_id, d.haven_kind]).sort()).toEqual([
      ["EV1", "hab"],
      ["EV2", "hab"],
    ]);
    expect(events.some((e) => e.kind === "EVA_ENDED")).toBe(true);
  });

  it("a crew member named by a dispatched rover's SUMMON task holds instead; the other shelters in the hab", () => {
    const s0 = offLoop();
    const s = withPr(s0, { state: "DISPATCHED", task: { kind: "SUMMON", target: { x_m: START.x_m, y_m: START.y_m }, crew_ids: ["EV1"] } });
    const events = runFake(s, 30, 600);
    expect(sheltered(events).map((d) => [d.crew_id, d.haven_kind])).toEqual([["EV2", "hab"]]);
  });

  it("a crew member a rover is coming for who ends ON the start waypoint still shelters in the hab", () => {
    const s0 = apply(initialState(fake, "s-0001"), "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops");
    const s = withPr(s0, { state: "DISPATCHED", task: { kind: "SUMMON", target: { x_m: START.x_m, y_m: START.y_m }, crew_ids: ["EV1"] } });
    expect(sheltered(runFake(s, 30, 600)).map((d) => [d.crew_id, d.haven_kind]).sort()).toEqual([
      ["EV1", "hab"],
      ["EV2", "hab"],
    ]);
  });
});

describe("compute RangeErrors never stop the engine", () => {
  const FAR = 1e7; // far outside any grid: a declared position, not a science number

  it("hab off the grid: no options and no events, no throw", () => {
    const s = { ...alerted, plan: { ...alerted.plan!, waypoints: alerted.plan!.waypoints.map((w) => (w.role === "start" ? { ...w, x_m: FAR } : w)) } };
    expect(() => contingencyTick(s, tctx(s))).not.toThrow();
    expect(contingencyTick(s, tctx(s)).events).toEqual([]);
  });

  it("rover off the grid: options without a vehicle rendezvous", () => {
    const s = withPr(alerted, { x_m: FAR });
    const { options } = dataOf(contingencyTick(s, tctx(s)).events, "OPTIONS_PROPOSED");
    expect(options.map((o) => o.kind)).not.toContain("VEHICLE_RENDEZVOUS");
    expect(options.map((o) => o.kind)).toContain("ABORT_TO_HAB");
  });

  it("malformed rover ParamSet (flat_speed_kmh not > 0): options without a vehicle rendezvous", () => {
    const bad: LoadedScenario = { ...sc, params: { ...sc.params, [PR.param_set]: { ...PR_PARAMS, values: { ...PR_PARAMS.values, flat_speed_kmh: -1 } } } };
    const { options } = dataOf(contingencyTick(alerted, tctx(alerted, bad)).events, "OPTIONS_PROPOSED");
    expect(options.map((o) => o.kind)).not.toContain("VEHICLE_RENDEZVOUS");
    expect(options.length).toBeGreaterThan(0);
  });

  it("a RangeError from proposeOptions (stop_index outside the plan) skips the alert: no events, no throw", () => {
    const stops = plan.waypoints.filter((w) => w.role === "stop").length;
    const s = withCrew(alerted, "EV1", { stop_index: stops + 1 });
    expect(() => contingencyTick(s, tctx(s))).not.toThrow();
    expect(contingencyTick(s, tctx(s)).events).toEqual([]);
  });

  it("an error that is not a RangeError still propagates (a malformed grid object)", () => {
    const broken: LoadedScenario = { ...sc, grid: {} as LoadedScenario["grid"] };
    expect(() => contingencyTick(alerted, tctx(alerted, broken))).toThrow(TypeError);
  });

  it("dispatchVehicle maps a compute RangeError (rover off the grid) to NO_RENDEZVOUS", () => {
    const s = withPr(alerted, { x_m: FAR });
    expect(dispatchVehicle(s, sc, { crew_ids: ["EV1"], actor: "ops" })).toMatchObject({ ok: false, code: "NO_RENDEZVOUS" });
  });
});

describe("pinned rules (surviving mutants of the review)", () => {
  it("a cleared warning gets no OPTIONS_PROPOSED", () => {
    const cleared = apply(alerted, "ALERT_CLEARED", { alert_id: ALERT_ID });
    expect(contingencyTick(cleared, tctx(cleared)).events).toEqual([]);
  });

  it("the crew field is bounded at max_haven_min x 60 s: with a bound that cuts it, the rendezvous moves", () => {
    // max_haven_min = 2 is a declared scenario input, chosen below the unbounded meeting time.
    const tight = { ...alerted, plan: { ...alerted.plan!, scenario: { ...alerted.plan!.scenario, max_haven_min: 2 } } };
    const { options } = dataOf(contingencyTick(tight, tctx(tight)).events, "OPTIONS_PROPOSED");
    expect(options).toEqual(proposeOptions(oracleInputs(tight)));
    const rv = options.find((o) => o.kind === "VEHICLE_RENDEZVOUS")?.rendezvous ?? null;
    expect(rv).not.toEqual(optionOf("VEHICLE_RENDEZVOUS").rendezvous);
    expect(optionOf("VEHICLE_RENDEZVOUS").rendezvous!.eta_crew_s).toBeGreaterThan(tight.plan.scenario.max_haven_min * 60);
  });
});

// ---- T23.07 follow-up (9 Nov): climb, descent, max slope and profile of the revised leg ------------------------

/**
 * Proposed 2026-11-09 — TODO(decision), listed in TASK-23 under T23.07. The new leg keeps today's `geometry`,
 * `walk_time_min` and `distance_m` (T23.06 and ops depend on them); only `climb_m`, `descent_m`,
 * `max_slope_deg` and `profile` come from compute, and the Hab Core does no slope or elevation maths:
 * - ABORT_TO_HAB and VEHICLE_RENDEZVOUS: `path_preview` is a cell-centre path, so its cells go to `toLeg`
 *   and the four fields are copied; labelled `derived`.
 * - CONTINUE_SKIP: `path_preview` is a display polyline, not a cell path. `profile` is `sampleProfile` of it
 *   (`derived`); climb, descent and max slope stay 0, `assumed`, until TASK-05 offers a polyline-to-cells helper.
 * - A non-finite result (elevation next to no-data) keeps zeros and an empty profile, all `assumed`, for that
 *   leg only: a display metric never blocks a safety abort.
 * - No grid at approval: INVALID, the only rejection (options exist only when a tick had a grid).
 * - The metrics are a contained step (decided 9 Nov, review): a path not on the grid's cell centres (a field
 *   of another `cell_m`: `toLeg`'s distance differs from the path's own length), an error thrown by
 *   `toLeg` / `sampleProfile`, or a non-finite value gives 0 and an empty profile, all `assumed`, and
 *   the revision proceeds: a display metric never blocks a safety command.
 * Expected values are compute's own `toLeg` / `sampleProfile` on the same inputs, never typed numbers.
 */
describe("the revised leg's climb, descent, max slope and profile (T23.07 follow-up; 05 Leg)", () => {
  const approve = (kind: ContingencyOption["kind"], s: EngineState = proposed(), scenario: LoadedScenario = sc) =>
    handleCommand(s, cmd("ops", "APPROVE_OPTION", { option_id: optionOf(kind).option_id }), cctx(s, scenario));
  const scen = plan.scenario;
  const METRICS = ["climb_m", "descent_m", "max_slope_deg", "profile"] as const;
  const pick = (leg: OkLeg) => Object.fromEntries(METRICS.map((k) => [k, leg[k]]));
  const EMPTY_PROFILE = { dist_m: [], elev_m: [], slope_class: [] };
  /** Compute's own answer for a cell path: the path's vertices, as cells, repeated cells collapsed. */
  function oracleLeg(path: [number, number][]): OkLeg {
    const cells: number[] = [];
    for (const [x, y] of path) {
      const c = cellIndex(grid, x, y);
      if (c === null) throw new Error("set-up: the path leaves the grid");
      if (cells[cells.length - 1] !== c) cells.push(c);
    }
    const leg = toLeg(grid, "from", "to", { status: "OK", cells }, scen);
    if (leg.status !== "OK") throw new Error("set-up: toLeg gave no route");
    return leg;
  }
  const provOf = (out: { events: PendingEvent[] }): Record<string, string> => out.events.find((e) => e.kind === "PLAN_REVISED")!.provenance as Record<string, string>;
  const lastIndex = (out: { events: PendingEvent[] }): number => dataOf(out.events, "PLAN_REVISED").legs!.length - 1;

  for (const kind of ["ABORT_TO_HAB", "VEHICLE_RENDEZVOUS"] as const) {
    describe(kind, () => {
      it("takes climb, descent, max slope and profile from compute's toLeg on the path's cells", () => {
        const leg = newLeg(approve(kind).events);
        expect(pick(leg)).toEqual(pick(oracleLeg(optionOf(kind).path_preview)));
      });

      it("the tilt makes them real: a slope, a climb or descent, and a profile with samples", () => {
        const leg = newLeg(approve(kind).events);
        expect(leg.max_slope_deg).toBeGreaterThan(0);
        expect(leg.climb_m + leg.descent_m).toBeGreaterThan(0);
        expect(leg.profile.dist_m.length).toBeGreaterThan(1);
        expect(leg.profile.elev_m).toHaveLength(leg.profile.dist_m.length);
        expect(leg.profile.slope_class).toHaveLength(leg.profile.dist_m.length);
      });

      it("labels the four fields derived, walk time modelled and distance derived; nothing is assumed", () => {
        const out = approve(kind);
        const i = lastIndex(out);
        expect(provOf(out)).toEqual({
          [`data.legs.${i}.walk_time_min`]: "modelled",
          [`data.legs.${i}.distance_m`]: "derived",
          [`data.legs.${i}.climb_m`]: "derived",
          [`data.legs.${i}.descent_m`]: "derived",
          [`data.legs.${i}.max_slope_deg`]: "derived",
          [`data.legs.${i}.profile`]: "derived",
        });
      });

      it("keeps geometry (the option's path), walk_time_min and distance_m as before", () => {
        const o = optionOf(kind);
        const leg = newLeg(approve(kind).events);
        // The option's path already ends on the start waypoint (ABORT) or at the meeting point (rendezvous).
        expect(leg.geometry).toEqual(o.path_preview);
        expect(leg.distance_m).toBeCloseTo(polylineLength(o.path_preview), 9);
        const walk_s = kind === "VEHICLE_RENDEZVOUS" ? o.rendezvous!.eta_crew_s : o.eta_shelter_min * 60 - HAB_INGRESS_S;
        expect(leg.walk_time_min * 60).toBeCloseTo(walk_s, 6);
      });

      it("PLAN_REVISED survives a JSON round trip unchanged", () => {
        const data = dataOf(approve(kind).events, "PLAN_REVISED");
        expect(JSON.parse(JSON.stringify(data))).toEqual(data);
      });
    });
  }

  describe("CONTINUE_SKIP (its path_preview is a display polyline, not a cell path)", () => {
    it("profile is sampleProfile of the leg's polyline with the scenario's slope limits", () => {
      const leg = newLeg(approve("CONTINUE_SKIP").events);
      expect(leg.profile).toEqual(sampleProfile(grid, leg.geometry, scen.caution_slope_deg, scen.hard_slope_limit_deg));
      expect(leg.profile.dist_m.length).toBeGreaterThan(1);
      expect(leg.profile.elev_m.every(Number.isFinite)).toBe(true);
    });

    it("climb, descent and max slope stay 0, labelled assumed (they wait for a TASK-05 polyline-to-cells helper); profile derived", () => {
      const out = approve("CONTINUE_SKIP");
      const leg = newLeg(out.events);
      const i = lastIndex(out);
      expect([leg.climb_m, leg.descent_m, leg.max_slope_deg]).toEqual([0, 0, 0]);
      expect(provOf(out)).toMatchObject({
        [`data.legs.${i}.climb_m`]: "assumed",
        [`data.legs.${i}.descent_m`]: "assumed",
        [`data.legs.${i}.max_slope_deg`]: "assumed",
        [`data.legs.${i}.profile`]: "derived",
        [`data.legs.${i}.walk_time_min`]: "modelled",
        [`data.legs.${i}.distance_m`]: "derived",
      });
    });

    it("PLAN_REVISED survives a JSON round trip unchanged", () => {
      const data = dataOf(approve("CONTINUE_SKIP").events, "PLAN_REVISED");
      expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    });
  });

  describe("ABORT through handleCommand", () => {
    it("the abort's revised leg carries the same compute metrics as approving ABORT_TO_HAB", () => {
      const out = handleCommand(proposed(), cmd("ops", "ABORT", { crew: ["EV1", "EV2"] }), cctx(proposed()));
      expect(pick(newLeg(out.events))).toEqual(pick(oracleLeg(optionOf("ABORT_TO_HAB").path_preview)));
    });
  });

  describe("a non-finite metric never blocks the abort", () => {
    /** The same grid with one cell of the abort path set to no-data (NaN elevation), as bilinear sampling meets it. */
    function nanGrid(): LoadedGrid {
      const path = optionOf("ABORT_TO_HAB").path_preview;
      const mid = path[Math.floor(path.length / 2)]!;
      const k = cellIndex(grid, mid[0], mid[1])!;
      const elevation = new Float32Array(grid.elevation);
      elevation[k] = Number.NaN;
      return { ...grid, elevation };
    }

    it("keeps zeros and an empty profile, all four labelled assumed, and still accepts", () => {
      const bad: LoadedScenario = { ...sc, grid: nanGrid() };
      let out!: ReturnType<typeof approve>;
      expect(() => (out = approve("ABORT_TO_HAB", proposed(), bad))).not.toThrow();
      expect(out.result.ok).toBe(true);
      const leg = newLeg(out.events);
      expect([leg.climb_m, leg.descent_m, leg.max_slope_deg]).toEqual([0, 0, 0]);
      expect(leg.profile).toEqual(EMPTY_PROFILE);
      const i = lastIndex(out);
      expect(provOf(out)).toMatchObject(Object.fromEntries(METRICS.map((k) => [`data.legs.${i}.${k}`, "assumed"])));
      expect(leg.walk_time_min * 60).toBeCloseTo(optionOf("ABORT_TO_HAB").eta_shelter_min * 60 - HAB_INGRESS_S, 6);
      const data = dataOf(out.events, "PLAN_REVISED");
      expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    });

    it("the same for CONTINUE_SKIP: an empty profile labelled assumed", () => {
      const bad: LoadedScenario = { ...sc, grid: { ...grid, elevation: new Float32Array(grid.elevation).fill(Number.NaN) } };
      const out = approve("CONTINUE_SKIP", proposed(), bad);
      expect(out.result.ok).toBe(true);
      expect(newLeg(out.events).profile).toEqual(EMPTY_PROFILE);
      expect(provOf(out)[`data.legs.${lastIndex(out)}.profile`]).toBe("assumed");
    });
  });

  describe("grid guards at approval", () => {
    it("no grid (null until TASK-05): INVALID, no events but the rejection", () => {
      const out = approve("ABORT_TO_HAB", proposed(), fake);
      expect(out.result).toMatchObject({ ok: false, code: "INVALID" });
      expect(out.events.map((e) => e.kind)).toEqual(["COMMAND_REJECTED"]);
    });

    /** The ABORT option with its path replaced by `path`, in a state ready for the ABORT command. */
    const withAbortPath = (path: [number, number][]): EngineState => {
      const base = proposed();
      const abort = base.options.find((o) => o.kind === "ABORT_TO_HAB")!;
      return { ...base, options: base.options.map((o) => (o === abort ? { ...o, path_preview: path } : o)) };
    };
    const abortOf = (s: EngineState) => handleCommand(s, cmd("ops", "ABORT", { crew: ["EV1"] }), cctx(s));
    const expectAssumedAccepted = (out: ReturnType<typeof abortOf>): void => {
      expect(out.result.ok).toBe(true);
      expect(out.events.map((e) => e.kind)).toEqual(["PLAN_REVISED"]);
      const leg = newLeg(out.events);
      expect([leg.climb_m, leg.descent_m, leg.max_slope_deg]).toEqual([0, 0, 0]);
      expect(leg.profile).toEqual(EMPTY_PROFILE);
      const i = lastIndex(out);
      expect(provOf(out)).toMatchObject(Object.fromEntries(METRICS.map((k) => [`data.legs.${i}.${k}`, "assumed"])));
      expect(provOf(out)).toMatchObject({ [`data.legs.${i}.walk_time_min`]: "modelled", [`data.legs.${i}.distance_m`]: "derived" });
    };

    it("a path not on the grid's cell centres (a field of another cell_m): the abort still goes through, metrics assumed", () => {
      // A diagonal run of half-cell steps (5 m on the 10 m grid), as a field of half the cell_m would give; a
      // declared test input. Its vertices fall on cells whose centres are farther apart than the steps.
      const half = grid.meta.cell_m / 2;
      const path: [number, number][] = Array.from({ length: 11 }, (_, k) => [k * half, k * half]);
      let out!: ReturnType<typeof abortOf>;
      expect(() => (out = abortOf(withAbortPath(path)))).not.toThrow();
      expectAssumedAccepted(out);
      expect(newLeg(out.events).geometry.slice(0, path.length)).toEqual(path);
    });

    it("an error thrown by toLeg: the abort still goes through, metrics assumed", () => {
      hook.toLegThrows = new Error("forced toLeg failure");
      expectAssumedAccepted(abortOf(proposed()));
    });

    it("an error thrown by sampleProfile: a CONTINUE_SKIP approval still goes through, profile assumed", () => {
      hook.sampleProfileThrows = new TypeError("forced sampleProfile failure");
      const out = approve("CONTINUE_SKIP");
      expect(out.result.ok).toBe(true);
      expect(newLeg(out.events).profile).toEqual(EMPTY_PROFILE);
      expect(provOf(out)[`data.legs.${lastIndex(out)}.profile`]).toBe("assumed");
    });

    it("errors outside the metrics step still surface (a plan whose legs cannot be read)", () => {
      const s = proposed();
      const broken = { ...s, plan: { ...s.plan!, result: undefined as never } };
      expect(() => abortOf(broken)).toThrow(TypeError);
    });

    it("repeated vertices are collapsed before toLeg (consecutive duplicate cells are not passed on)", () => {
      const base = optionOf("ABORT_TO_HAB").path_preview;
      // Every vertex twice, and the first three times: a declared test input.
      const doubled: [number, number][] = [base[0]!, ...base.flatMap((p): [number, number][] => [p, p])];
      const out = abortOf(withAbortPath(doubled));
      expect(out.result.ok).toBe(true);
      const want = base.map(([x, y]) => cellIndex(grid, x, y)!);
      expect(hook.toLegCells).toEqual([want]);
      expect(want.some((c, i) => i > 0 && c === want[i - 1])).toBe(false);
      expect(pick(newLeg(out.events))).toEqual(pick(oracleLeg(base)));
    });
  });
});
