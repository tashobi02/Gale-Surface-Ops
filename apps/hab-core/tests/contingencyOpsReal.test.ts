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
 * (`packages/compute/tests/fixtures/v2grids.ts`), whose hab is at the origin like the fake scenario's
 * start waypoint. Expected values come from the same compute functions (the oracle), the fixture
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
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  crewTimeField,
  habTimeField,
  HAB_INGRESS_S,
  proposeOptions,
  rendezvous,
  rendezvousPair,
  vehiclePassable,
  vehicleTimeField,
  type ContingencyInputs,
  type RendezvousOk,
} from "@marswalk/compute";
import type { Command, ContingencyOption, CrewId, LogEvent, LogEventData, LogEventKind, OkLeg, Role, Vehicle } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand, type CommandContext } from "../src/commands";
import { contingencyTick } from "../src/engine/contingencyOps";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import type { TickContext } from "../src/engine/tick";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { havenFlat } from "../../../packages/compute/tests/fixtures/v2grids";

// ---- pass-through hook on proposeOptions (real compute otherwise) -------------------------------------------

const hook = vi.hoisted(() => ({
  calls: [] as unknown[],
  extra: null as null | ((options: unknown[]) => unknown[]),
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
  };
});
beforeEach(() => {
  hook.calls.length = 0;
  hook.extra = null;
});

// ---- scenario and states ----------------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
/** Coarser than the 5 m default only to keep the Dijkstra runs short; the shape is the same. */
const grid = havenFlat(10).grid;
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
  const scen = plan.scenario;
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
    expect(e.provenance).toMatchObject({ "data.options.eta_shelter_min": "modelled", "data.options.expected_dose_ugy": "modelled" });
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
      return [first!, { ...first!, option_id: `${ALERT_ID}:BAD`, eta_shelter_min: Infinity }, { ...first!, option_id: `${ALERT_ID}:NAN`, rendezvous: { x_m: 0, y_m: 0, eta_crew_s: NaN, eta_vehicle_s: 0 } }, ...rest];
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
});
