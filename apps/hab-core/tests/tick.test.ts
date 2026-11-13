/**
 * T22.08: tick — crew motion, dwell, consumables, dose and alert order (docs/specs/02 §D.13, §D.14;
 * FR-35, FR-37, FR-38). Runs on the fake scenario (F8, T22.02).
 *
 * Alert cases (T22.10): the alert modules are called directly. @marswalk/compute is real now
 * (`rateAt`, `triggerState`, `stepO2`, `integrateDose`; T05b.15, T05b.17); only `stepO2` and
 * `integrateDose` are wrapped in spies so the tick tests can see who calls them. The engine part
 * under test for alerts is: raise once on the nominal → alert change, clear once on the change
 * back, and the event fields.
 *
 * Consumables (decided 2026-11-07): the O₂ alert compares the O₂ time left (the real compute
 * `o2RemainingS`, T05b.17) with the time to the nearest haven
 * (`crew.haven`, T23.03). The message says where to go: the hab, or a pressurized rover to restock.
 * Both the O₂ and the buddy alert clear once the condition is safe again.
 *
 * Tick cases (T22.09): every expected number is derived from the fixture (leg `walk_time_min`,
 * `dwell_min_per_stop`, geometry, the dose series) or from the real compute functions, never typed
 * in. With leg times `leg_s[i]` and dwell `dwell_s`, the phases are leg 0, dwell, leg 1, dwell, leg 2;
 * an event at the end of phase k (cumulative time B_k) lands at tick ceil(B_k), because tick adds
 * whole 1-s steps and carries the overshoot into the next phase.
 *
 * Rules these tests fix for T22.09 (proposed 2026-11-07, ratified BD-71; docs/tasks/TASK-22 T22.09):
 * - Constant speed within a leg; position is the arc-length fraction along `leg.geometry`.
 * - `stop_index` is 1-based among the plan's `role: "stop"` waypoints.
 * - `start_offset_s` holds the crew member at the start (shielding hab, no O₂ used) until it elapses.
 * - End of a loop route: CREW_SHELTERED `haven_kind: "hab"` with this tick's doses; the reducer sets IN_HAB.
 * - `eva_elapsed_s` grows by dt_s in every activity except IN_HAB.
 * - After PLAN_REVISED a TO_HAVEN crew member snaps to the closest point of the revised legs (from the
 *   last waypoint reached) and walks them with no dwell and no ARRIVED_STOP/LEFT_STOP.
 * - O₂ and dose use the activity at the start of the step: WALKING and TO_HAVEN walk in the suit,
 *   AT_STOP rests in the suit, IN_HAB uses the hab factor and no O₂.
 * - A module whose body is still a `TODO(TASK-nn): Tnn.nn not implemented` stub is skipped; any
 *   other error propagates.
 * - Events: ARRIVED_STOP, LEFT_STOP and CREW_SHELTERED only; positions, O₂, elapsed time and doses are
 *   STATE_DELTAs, sent only when the value changed.
 *
 * Review-fix rules (proposed 2026-11-07, docs/tasks/TASK-22 T22.09 S4, S5, S7, S8, S9, S11): EVA_ENDED
 * once all crew are IN_HAB or SHELTERED; a waiting crew member is not out; LEFT_STOP always; a held
 * crew member rests and resumes after a revision; a bad walk_time_min throws. The last describe pins
 * the interpolation and re-anchoring with hand-computed geometry.
 *
 * Not yet covered (it.todo at the end): refuge or vehicle shelter dose.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertCode, CrewId, LogEventData, LogEventKind, OkLeg, ParamSet } from "@marswalk/protocol";
import * as compute from "@marswalk/compute";
import { o2RemainingS } from "@marswalk/compute";
import { buddyTick, consumablesTick, radiationTick } from "../src/engine/alerts";
import { havenTick } from "../src/engine/haven";
import { linksTick } from "../src/engine/links";
import { earthTick } from "../src/engine/earth";
import { initialState, logged, reduce, type EngineState, type PendingEvent, type StateChange } from "../src/engine/reducer";
import { MODULE_ORDER, tick, type TickContext } from "../src/engine/tick";
import { canonicalJson } from "../src/log";
import { readScenario, type LoadedScenario } from "../src/scenario";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const alertParams = Object.values(fake.params).find((p) => p.kind === "alert")!;
const v = alertParams.values as Record<string, number>;
const T0 = Date.parse(fake.scenario.start_utc);
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

// Schedule from the fixture's declared shape (README "Value sources": PHASE_S, SAMPLE_STEP_S).
const samples = fake.dose.samples.map(([t, r]) => [Date.parse(t), r] as const);
const SAMPLE_STEP_MS = samples[1][0] - samples[0][0];
const stepStart = samples.find(([, r]) => r !== samples[0][1])![0];
const stepEnd = samples.find(([t, r]) => t > stepStart && r === samples[0][1])![0];
/** Raise at the second consecutive high sample; clear after rad_clear_min of low rate (02 §D.13). */
const RAISE_AT = stepStart + SAMPLE_STEP_MS;
const CLEAR_AT = stepEnd + v.rad_clear_min * 60_000;

const actual = await vi.importActual<typeof import("@marswalk/compute")>("@marswalk/compute");

// The real compute functions, wrapped so the tick tests can see every call (T22.08 "through compute").
vi.mock("@marswalk/compute", async () => {
  const real = await vi.importActual<typeof import("@marswalk/compute")>("@marswalk/compute");
  return { ...real, stepO2: vi.fn(real.stepO2), integrateDose: vi.fn(real.integrateDose) };
});

// earthTick keeps its T22.01 stub body by default; the stub-guard test injects other errors.
vi.mock("../src/engine/earth", async () => {
  const real = await vi.importActual<typeof import("../src/engine/earth")>("../src/engine/earth");
  return { ...real, earthTick: vi.fn(real.earthTick) };
});

const scenarioWith = (values: Record<string, number>): LoadedScenario => ({
  ...fake,
  params: { ...fake.params, [alertParams.param_set_id]: { ...alertParams, values: { ...v, ...values } } as ParamSet },
});

function at(state: EngineState, ms: number): EngineState {
  return { ...state, session: { ...state.session, clock: { ...state.session.clock, sim_time: iso(ms) } } };
}

const ctx = (state: EngineState, scenario = fake): TickContext => ({ scenario, dt_s: 1, next_seq: state.session.last_seq + 1 });

/** Reduce a module's events the way tick.ts does (seqs from ctx.next_seq). */
function applyEvents(state: EngineState, events: PendingEvent[]): EngineState {
  return events.reduce((s, e) => reduce(s, logged(e, s.session.last_seq + 1)), state);
}

/**
 * The storm pressed at its recorded UTC (START_EVENT at `series_start_utc`, U-62, BD-97, T32.12): from that sim time the
 * series plays at its own UTC, so every number below is the one the table-time storm gave; before it the rate is the
 * background (the fixture's series is at the background there too).
 */
const STORM = fake.scenario.event_library[0];
const SERIES_START_MS = Date.parse(STORM.series_start_utc);
const pressedAtSeriesStart = (s: EngineState): EngineState => ({ ...s, session: { ...s.session, started_events: [{ event_id: STORM.event_id, t0_sim_time: STORM.series_start_utc }] } });

function onEva(scenario: LoadedScenario = fake): EngineState {
  const s = initialState(scenario, "s-0001");
  return pressedAtSeriesStart(reduce(s, { seq: 1, sim_time: fake.scenario.start_utc, kind: "EVA_STARTED", actor: "ops", data: { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, provenance: {}, command_ref: { client_id: "c-1", command_id: "k-1" } }));
}

const withCrew = (s: EngineState, id: CrewId, patch: Partial<EngineState["crew"][number]>): EngineState => ({
  ...s,
  crew: s.crew.map((c) => (c.crew_id === id ? { ...c, ...patch } : c)),
});

/** Run one module every `stepMs` from `fromMs` to `toMs`, applying its events; return them with their sim times. */
function sweep(module: typeof radiationTick, start: EngineState, fromMs: number, toMs: number, stepMs = 60_000): { state: EngineState; events: PendingEvent[] } {
  let state = start;
  const events: PendingEvent[] = [];
  for (let t = fromMs; t <= toMs; t += stepMs) {
    const r = module(at(state, t), ctx(state));
    expect(r.state.alerts, "a module returns events and does not apply them (tick.ts state rule)").toEqual(state.alerts);
    events.push(...r.events);
    state = applyEvents(r.state, r.events);
  }
  return { state, events };
}

const codes = (events: PendingEvent[]): [string, AlertCode | undefined][] => events.map((e) => [e.kind, (e.data as { code?: AlertCode }).code]);

describe("radiation alert (02 §D.13; T22.10)", () => {
  it("RADIATION_ALERT fires at the first sample satisfying the trigger", () => {
    const { events } = sweep(radiationTick, onEva(), T0, RAISE_AT + 3 * SAMPLE_STEP_MS);
    expect(codes(events)).toEqual([["ALERT_RAISED", "RADIATION_ALERT"]]);
    expect(events[0].sim_time).toBe(iso(RAISE_AT));
  });

  it("the raised event carries the replayed rate, the threshold k × background and the source", () => {
    const s = at(onEva(), RAISE_AT);
    const [raised] = radiationTick(s, ctx(s)).events;
    const data = raised.data as LogEventData["ALERT_RAISED"];
    expect(data).toEqual({
      alert_id: `a-${ctx(s).next_seq}`,
      code: "RADIATION_ALERT",
      level: "warning",
      subjects: ["EV1", "EV2"],
      message: expect.any(String),
      rate_ugy_h: samples.find(([t]) => t === stepStart)![1],
      threshold_ugy_h: v.rad_k_background * fake.dose.background_rate,
      source: `replayed:${fake.dose.source_id}`,
    });
    expect(data.message.length).toBeLessThanOrEqual(60);
    expect(raised.actor).toBe("system");
    expect(raised.provenance).toEqual({ "data.rate_ugy_h": "replayed", "data.threshold_ugy_h": "assumed" });
  });

  it("ALERT_CLEARED fires once when the trigger returns to nominal (02 §D.13 clear rule)", () => {
    const { events, state } = sweep(radiationTick, onEva(), T0, CLEAR_AT + 3 * SAMPLE_STEP_MS);
    expect(codes(events)).toEqual([
      ["ALERT_RAISED", "RADIATION_ALERT"],
      ["ALERT_CLEARED", undefined],
    ]);
    expect(events[1].sim_time).toBe(iso(CLEAR_AT));
    expect((events[1].data as LogEventData["ALERT_CLEARED"]).alert_id).toBe((events[0].data as LogEventData["ALERT_RAISED"]).alert_id);
    // Not acknowledged, so the warning latches (03 §E.7).
    expect(state.alerts).toEqual([expect.objectContaining({ code: "RADIATION_ALERT", acked_seq: null })]);
  });

  it("does not raise again while a radiation alert is active", () => {
    const raised = sweep(radiationTick, onEva(), RAISE_AT, RAISE_AT).state;
    const again = sweep(radiationTick, raised, RAISE_AT + 60_000, CLEAR_AT - 60_000).events;
    expect(again).toEqual([]);
  });
});

const suit = Object.values(fake.params).find((p) => p.kind === "suit")!;
/** O₂ time left on a full suit at the walking rate (compute, T05b.17); time left is linear in o2_frac. */
const O2_FULL_S = o2RemainingS(1, "walking", suit);
type HavenKind = EngineState["crew"][number]["haven"]["kind"];

/** EV1 on EVA with O₂ time left `margin` × its time to the haven (`haven_min` minutes away). */
function o2Margin(margin: number, haven_min = 40, kind: HavenKind = "hab", from = onEva()): EngineState {
  const c = from.crew.find((x) => x.crew_id === "EV1")!;
  return withCrew(from, "EV1", { o2_frac: (margin * haven_min * 60) / O2_FULL_S, haven: { ...c.haven, minutes: haven_min, kind } });
}

const raisedData = (events: PendingEvent[]) => events.filter((e) => e.kind === "ALERT_RAISED").map((e) => e.data as LogEventData["ALERT_RAISED"]);

describe("consumables alert: O₂ left against the time to a haven (02 §D.14; T22.10, decided 2026-11-07)", () => {
  it("a caution at o2_caution_margin, then a warning at o2_warning_margin, once each per crew member", () => {
    let s = o2Margin(v.o2_caution_margin);
    const caution = consumablesTick(s, ctx(s)).events;
    expect(raisedData(caution).map((d) => [d.code, d.level, d.subjects])).toEqual([["CONSUMABLES_LOW", "caution", ["EV1"]]]);
    s = applyEvents(s, caution);
    expect(consumablesTick(s, ctx(s)).events).toEqual([]);
    s = o2Margin(v.o2_warning_margin, 40, "hab", s);
    const warning = consumablesTick(s, ctx(s)).events;
    expect(raisedData(warning).map((d) => [d.code, d.level])).toEqual([["CONSUMABLES_LOW", "warning"]]);
    s = applyEvents(s, warning);
    expect(consumablesTick(s, ctx(s)).events).toEqual([]);
  });

  it("the warning replaces the caution: the caution is cleared when the warning is raised", () => {
    let s = o2Margin(v.o2_caution_margin);
    s = applyEvents(s, consumablesTick(s, ctx(s)).events);
    const cautionId = s.alerts[0].alert_id;
    s = o2Margin(v.o2_warning_margin, 40, "hab", s);
    const events = consumablesTick(s, ctx(s)).events;
    expect(events.map((e) => e.kind)).toEqual(["ALERT_CLEARED", "ALERT_RAISED"]);
    expect((events[0].data as LogEventData["ALERT_CLEARED"]).alert_id).toBe(cautionId);
  });

  it("the same O₂ fraction alerts far from a haven and not close to one", () => {
    const far = o2Margin(v.o2_caution_margin, 60);
    const near = withCrew(far, "EV1", { haven: { ...far.crew[0].haven, minutes: 60 / (2 * v.o2_caution_margin) } });
    expect(raisedData(consumablesTick(far, ctx(far)).events)).toHaveLength(1);
    expect(consumablesTick(near, ctx(near)).events).toEqual([]);
  });

  it("the message says where to go: return to the hab, or restock at a pressurized rover; at most 60 characters", () => {
    const messages = (["hab", "vehicle"] as const).flatMap((kind) =>
      [v.o2_caution_margin, v.o2_warning_margin].map((m) => {
        const s = o2Margin(m, 40, kind);
        return raisedData(consumablesTick(s, ctx(s)).events)[0].message;
      }),
    );
    expect(messages.map((m) => /rover/i.test(m))).toEqual([false, false, true, true]);
    expect(messages.map((m) => /hab/i.test(m))).toEqual([true, true, false, false]);
    for (const m of messages) expect(m.length).toBeLessThanOrEqual(60);
    expect(new Set(messages).size).toBe(4);
  });

  it("the raised event carries the O₂ time left, the haven time and kind, the margin and its threshold", () => {
    const s = o2Margin(v.o2_caution_margin, 40, "vehicle");
    const [d] = raisedData(consumablesTick(s, ctx(s)).events) as (LogEventData["ALERT_RAISED"] & Record<string, unknown>)[];
    expect(d).toMatchObject({ haven_min: 40, haven_kind: "vehicle", threshold_margin: v.o2_caution_margin });
    expect(d.o2_remaining_min).toBeCloseTo(v.o2_caution_margin * 40, 9);
    expect(d.margin).toBeCloseTo(v.o2_caution_margin, 9);
  });

  it("two crew crossing on the same tick get distinct alert_ids a-<seq> in log order (05 Alert)", () => {
    const s = withCrew(o2Margin(v.o2_caution_margin), "EV2", { o2_frac: o2Margin(v.o2_caution_margin).crew[0].o2_frac, haven: o2Margin(v.o2_caution_margin).crew[0].haven });
    const c = ctx(s);
    const ids = raisedData(consumablesTick(s, c).events).map((d) => [d.subjects, d.alert_id]);
    expect(ids).toEqual([[["EV1"], `a-${c.next_seq}`], [["EV2"], `a-${c.next_seq + 1}`]]);
    const after = applyEvents(s, consumablesTick(s, c).events);
    expect(after.alerts.map((a) => [a.alert_id, a.raised_seq])).toEqual([[`a-${c.next_seq}`, c.next_seq], [`a-${c.next_seq + 1}`, c.next_seq + 1]]);
  });

  it("a warning that replaces a caution has the alert_id of its own seq, after the clear", () => {
    let s = o2Margin(v.o2_caution_margin);
    s = applyEvents(s, consumablesTick(s, ctx(s)).events);
    s = o2Margin(v.o2_warning_margin, 40, "hab", s);
    const c = ctx(s);
    s = applyEvents(s, consumablesTick(s, c).events);
    const warning = s.alerts.find((a) => a.level === "warning")!;
    expect([warning.alert_id, warning.raised_seq]).toEqual([`a-${c.next_seq + 1}`, c.next_seq + 1]);
  });

  it("no alert when the haven time is 0 or less; an unreachable haven (Infinity) is a warning with haven_min null", () => {
    const neg = withCrew(o2Margin(v.o2_warning_margin / 2), "EV1", { haven: { ...onEva().crew[0].haven, minutes: -5 } });
    expect(consumablesTick(neg, ctx(neg)).events).toEqual([]);
    const none = withCrew(onEva(), "EV1", { haven: { ...onEva().crew[0].haven, minutes: Infinity } });
    const [d] = raisedData(consumablesTick(none, ctx(none)).events);
    expect([d.level, d.haven_min, d.margin]).toEqual(["warning", null, 0]);
  });

  it("a NaN O₂ fraction or haven time throws instead of clearing a live alert", () => {
    let s = o2Margin(v.o2_warning_margin);
    s = applyEvents(s, consumablesTick(s, ctx(s)).events);
    const bad = withCrew(s, "EV1", { o2_frac: Number.NaN });
    expect(() => consumablesTick(bad, ctx(bad))).toThrow(/NaN/);
  });

  it("clears when O₂ is back to a safe margin (decided 2026-11-07)", () => {
    let s = o2Margin(v.o2_warning_margin);
    s = applyEvents(s, consumablesTick(s, ctx(s)).events);
    s = o2Margin(v.o2_caution_margin * 2, 40, "hab", s);
    const events = consumablesTick(s, ctx(s)).events;
    expect(events.map((e) => e.kind)).toEqual(["ALERT_CLEARED"]);
    expect((events[0].data as LogEventData["ALERT_CLEARED"]).alert_id).toBe(s.alerts[0].alert_id);
  });

  it("hysteresis: once raised, it clears only above o2_clear_margin, not just above the caution margin (decided 2026-11-07)", () => {
    let s = o2Margin(v.o2_caution_margin);
    s = applyEvents(s, consumablesTick(s, ctx(s)).events);
    const between = o2Margin((v.o2_caution_margin + v.o2_clear_margin) / 2, 40, "hab", s);
    expect(consumablesTick(between, ctx(between)).events).toEqual([]);
    const above = o2Margin(v.o2_clear_margin * 1.01, 40, "hab", s);
    expect(consumablesTick(above, ctx(above)).events.map((e) => e.kind)).toEqual(["ALERT_CLEARED"]);
  });

  it("an o2_clear_margin below the caution margin is a ParamSet error", () => {
    const s = o2Margin(v.o2_caution_margin);
    expect(() => consumablesTick(s, ctx(s, scenarioWith({ o2_clear_margin: v.o2_caution_margin / 2 })))).toThrow(/o2_clear_margin/);
  });

  it("clears when the crew member is back in the hab", () => {
    let s = o2Margin(v.o2_warning_margin);
    s = applyEvents(s, consumablesTick(s, ctx(s)).events);
    s = withCrew(s, "EV1", { activity: "IN_HAB" });
    expect(consumablesTick(s, ctx(s)).events.map((e) => e.kind)).toEqual(["ALERT_CLEARED"]);
  });

  it("no consumables alert above the caution margin, at the haven, or for crew in the hab", () => {
    const above = o2Margin(v.o2_caution_margin * 2);
    expect(consumablesTick(above, ctx(above)).events).toEqual([]);
    const atHaven = o2Margin(v.o2_warning_margin / 2, 0);
    expect(consumablesTick(atHaven, ctx(atHaven)).events).toEqual([]);
    const inHab = withCrew(o2Margin(v.o2_warning_margin / 2), "EV1", { activity: "IN_HAB" });
    expect(consumablesTick(inHab, ctx(inHab)).events).toEqual([]);
  });
});

describe("buddy separation alert (02 §D.14; T22.10)", () => {
  const apart = (d: number, from = onEva()): EngineState => withCrew(withCrew(from, "EV1", { x_m: 0, y_m: 0 }), "EV2", { x_m: d, y_m: 0 });

  it("BUDDY_SEPARATION fires once when the crew are farther apart than buddy_max_m", () => {
    let s = apart(v.buddy_max_m + 1);
    const events = buddyTick(s, ctx(s)).events;
    expect(codes(events)).toEqual([["ALERT_RAISED", "BUDDY_SEPARATION"]]);
    expect((events[0].data as LogEventData["ALERT_RAISED"]).subjects).toEqual(["EV1", "EV2"]);
    expect((events[0].data as LogEventData["ALERT_RAISED"]).message).toBe("Buddy too far — close up");
    s = applyEvents(s, events);
    expect(buddyTick(s, ctx(s)).events).toEqual([]);
  });

  it("no buddy alert at buddy_max_m or closer", () => {
    const s = apart(v.buddy_max_m);
    expect(buddyTick(s, ctx(s)).events).toEqual([]);
  });

  it("clears once the crew are back within buddy_max_m (decided 2026-11-07)", () => {
    let s = apart(v.buddy_max_m + 1);
    s = applyEvents(s, buddyTick(s, ctx(s)).events);
    s = apart(v.buddy_max_m, s);
    const events = buddyTick(s, ctx(s)).events;
    expect(events.map((e) => e.kind)).toEqual(["ALERT_CLEARED"]);
    expect((events[0].data as LogEventData["ALERT_CLEARED"]).alert_id).toBe(s.alerts[0].alert_id);
  });

  it("clears when fewer than two crew are out on the EVA", () => {
    let s = apart(v.buddy_max_m + 1);
    s = applyEvents(s, buddyTick(s, ctx(s)).events);
    s = withCrew(s, "EV2", { activity: "IN_HAB" });
    expect(buddyTick(s, ctx(s)).events.map((e) => e.kind)).toEqual(["ALERT_CLEARED"]);
  });

  it("every threshold comes from the alert ParamSet", () => {
    const s = apart(v.buddy_max_m + 1);
    expect(buddyTick(s, ctx(s, scenarioWith({ buddy_max_m: v.buddy_max_m * 2 }))).events).toEqual([]);
    const low = o2Margin(v.o2_caution_margin);
    expect(consumablesTick(low, ctx(low, scenarioWith({ o2_caution_margin: v.o2_caution_margin / 2, o2_warning_margin: v.o2_caution_margin / 4 }))).events).toEqual([]);
  });
});

describe("alert order (02 §D.14)", () => {
  it("alerts are evaluated in the fixed order radiation → consumables → haven time → comm link → buddy distance", () => {
    const order = [radiationTick, consumablesTick, havenTick, linksTick, buddyTick].map((m) => MODULE_ORDER.indexOf(m));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

// ---------------------------------------------------------------------------------------------
// tick (T22.09): crew motion, dwell, O₂ and dose through compute, seqs, stub guard, determinism
// ---------------------------------------------------------------------------------------------

const stepO2Spy = vi.mocked(compute.stepO2);
const integrateDoseSpy = vi.mocked(compute.integrateDose);
beforeEach(() => {
  stepO2Spy.mockClear();
  integrateDoseSpy.mockClear();
});

/** What the session's `stepOnce` does: sim time + 1 s, then tick with the next free seq. */
function step(state: EngineState, scenario: LoadedScenario = fake): ReturnType<typeof tick> {
  const stepped = at(state, Date.parse(state.session.clock.sim_time) + 1000);
  return tick(stepped, scenario, 1, state.session.last_seq + 1);
}

/** `states[n]`, `events[n]` and `deltas[n]` are the state after tick n and that tick's output; index 0 is the start. */
interface Trace {
  states: EngineState[];
  events: PendingEvent[][];
  deltas: StateChange[][];
}

function run(start: EngineState, ticks: number, scenario: LoadedScenario = fake): Trace {
  const trace: Trace = { states: [start], events: [[]], deltas: [[]] };
  for (let n = 1; n <= ticks; n++) {
    const r = step(trace.states[n - 1], scenario);
    trace.states.push(r.state);
    trace.events.push(r.events);
    trace.deltas.push(r.deltas);
  }
  return trace;
}

const memo = <T,>(make: () => T): (() => T) => {
  let value: T | undefined;
  return () => (value ??= make());
};

// Plan constants, all from the fixture.
const plan = fake.scenario.plan!;
const okLegs = plan.result.legs.map((l): OkLeg => {
  if (l.status !== "OK") throw new Error("the fixture's legs are all OK");
  return l;
});
const legSeconds = (l: OkLeg): number => l.walk_time_min * 60;
const dwell_s = plan.scenario.dwell_min_per_stop * 60;
const stopIds = plan.waypoints.filter((w) => w.role === "stop").map((w) => w.id);
const startWp = plan.waypoints.find((w) => w.role === "start")!;

/** Phases of the walk in order, with their cumulative start and end times (seconds since the walk began). */
interface Phase {
  kind: "leg" | "dwell";
  leg: number;
  start: number;
  end: number;
}
const phases: Phase[] = [];
{
  let acc = 0;
  okLegs.forEach((l, i) => {
    phases.push({ kind: "leg", leg: i, start: acc, end: (acc += legSeconds(l)) });
    if (stopIds.includes(l.to)) phases.push({ kind: "dwell", leg: i, start: acc, end: (acc += dwell_s) });
  });
}
/** The tick on which the end of phase k is first reached (`delay_s` = a start offset). */
const tickOf = (k: number, delay_s = 0): number => Math.ceil(phases[k].end + delay_s);
const END_TICK = tickOf(phases.length - 1);

/** Test-side interpolation along a polyline by arc-length fraction (projected metres). */
function along(geometry: [number, number][], f: number): [number, number] {
  const lengths = geometry.slice(1).map((p, i) => Math.hypot(p[0] - geometry[i][0], p[1] - geometry[i][1]));
  let d = Math.min(Math.max(f, 0), 1) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] || i === lengths.length - 1) {
      const g = lengths[i] === 0 ? 1 : Math.min(d / lengths[i], 1);
      return [geometry[i][0] + (geometry[i + 1][0] - geometry[i][0]) * g, geometry[i][1] + (geometry[i + 1][1] - geometry[i][1]) * g];
    }
    d -= lengths[i];
  }
  return geometry[0];
}

/** Where a crew member who started walking `t` seconds ago must be on the fixture's plan. */
function expectedPosition(t: number): [number, number] {
  const phase = phases.find((p) => t < p.end) ?? phases[phases.length - 1];
  const geometry = okLegs[phase.leg].geometry;
  if (phase.kind === "dwell" || t >= phase.end) return geometry[geometry.length - 1];
  return along(geometry, (t - phase.start) / (phase.end - phase.start));
}

const crewOf = (s: EngineState, id: CrewId) => s.crew.find((c) => c.crew_id === id)!;
const pos = (s: EngineState, id: CrewId): [number, number] => [crewOf(s, id).x_m, crewOf(s, id).y_m];
const expectPosition = (actualPos: [number, number], expected: [number, number], label: string): void => {
  expect(actualPos[0], `${label} x_m`).toBeCloseTo(expected[0], 6);
  expect(actualPos[1], `${label} y_m`).toBeCloseTo(expected[1], 6);
};

/** Events of one kind (for one crew member) with the tick they came on. */
function eventsOf(trace: Trace, kind: LogEventKind, crew_id?: CrewId): { tick: number; event: PendingEvent }[] {
  return trace.events.flatMap((list, n) =>
    list.filter((e) => e.kind === kind && (crew_id === undefined || (e.data as { crew_id?: string }).crew_id === crew_id)).map((event) => ({ tick: n, event })),
  );
}

const baseRun = memo(() => run(onEva(), END_TICK + 5));
const CREW: CrewId[] = ["EV1", "EV2"];

describe("tick: crew motion, dwell, O₂ and dose through compute (T22.09)", () => {
  it("crew position follows the planned path by cumulative leg time (fixture legs' walk_time_min)", () => {
    const { states } = baseRun();
    // Mid-leg and leg boundaries, named, then every tick of the whole walk.
    for (const k of [0, 2, 4]) {
      const mid = Math.floor((phases[k].start + phases[k].end) / 2);
      expectPosition(pos(states[mid], "EV1"), expectedPosition(mid), `mid-leg phase ${k}`);
    }
    expectPosition(pos(states[tickOf(0)], "EV1"), okLegs[0].geometry.at(-1)!, "arrival at stop 1");
    expectPosition(pos(states[END_TICK], "EV1"), okLegs.at(-1)!.geometry.at(-1)!, "back at the start");
    for (let n = 0; n < states.length; n++) {
      for (const id of CREW) expectPosition(pos(states[n], id), n === 0 ? [startWp.x_m, startWp.y_m] : expectedPosition(n), `tick ${n} ${id}`);
      expect(pos(states[n], "EV1"), `tick ${n}: EV1 and EV2 have the same position`).toEqual(pos(states[n], "EV2"));
    }
  });

  it("crew dwell dwell_min_per_stop at each stop; ARRIVED_STOP and LEFT_STOP fire once each", () => {
    const trace = baseRun();
    const dwells = phases.map((p, k) => ({ p, k })).filter(({ p }) => p.kind === "dwell");
    expect(dwells).toHaveLength(stopIds.length);
    for (const id of CREW) {
      const arrived = eventsOf(trace, "ARRIVED_STOP", id);
      const left = eventsOf(trace, "LEFT_STOP", id);
      expect(arrived.map((a) => a.tick)).toEqual(dwells.map(({ k }) => tickOf(k - 1)));
      expect(left.map((a) => a.tick)).toEqual(dwells.map(({ k }) => tickOf(k)));
      const data = stopIds.map((stop_id, i) => ({ crew_id: id, stop_id, stop_index: i + 1 }));
      expect(arrived.map((a) => a.event.data)).toEqual(data);
      expect(left.map((a) => a.event.data)).toEqual(data);
      expect(arrived.every((a) => a.event.actor === "system")).toBe(true);
      expect(arrived.map((a) => a.event.sim_time)).toEqual(arrived.map((a) => trace.states[a.tick].session.clock.sim_time));
      // Between ARRIVED_STOP and LEFT_STOP the crew member is AT_STOP and stands still.
      for (const { k } of dwells) {
        const stopPos = okLegs[phases[k].leg].geometry.at(-1)!;
        for (let n = tickOf(k - 1); n < tickOf(k); n++) {
          expect(crewOf(trace.states[n], id).activity, `tick ${n} ${id}`).toBe("AT_STOP");
          expect(pos(trace.states[n], id), `tick ${n} ${id}`).toEqual(stopPos);
        }
        expect(crewOf(trace.states[tickOf(k)], id).activity).toBe("WALKING");
      }
    }
    // The dwell lasts dwell_min_per_stop: the gap between the two events is that long to within one step.
    for (const { k } of dwells) expect(Math.abs(tickOf(k) - tickOf(k - 1) - dwell_s)).toBeLessThan(1);
  });

  it("at the end of a loop route the crew are back at the start, sheltered in the hab once, IN_HAB, and stop moving", () => {
    const trace = baseRun();
    for (const id of CREW) {
      const sheltered = eventsOf(trace, "CREW_SHELTERED", id);
      expect(sheltered.map((s) => s.tick)).toEqual([END_TICK]);
      const end = trace.states[END_TICK];
      expect(sheltered[0].event.data).toEqual({
        crew_id: id,
        haven_kind: "hab",
        dose_event_ugy: crewOf(end, id).dose_event_ugy,
        dose_event_unsheltered_ugy: crewOf(end, id).dose_event_unsheltered_ugy,
      });
      expect(sheltered[0].event.actor).toBe("system");
      expect(crewOf(trace.states[END_TICK - 1], id).activity).toBe("WALKING");
      expect(crewOf(end, id)).toMatchObject({ activity: "IN_HAB", x_m: startWp.x_m, y_m: startWp.y_m, haven: expect.objectContaining({ kind: "hab" }) });
      // Frozen afterwards: position, O₂ and elapsed time stop (the doses keep adding up at the hab factor).
      const last = trace.states[trace.states.length - 1];
      expect(crewOf(last, id)).toMatchObject({ activity: "IN_HAB", x_m: crewOf(end, id).x_m, y_m: crewOf(end, id).y_m, o2_frac: crewOf(end, id).o2_frac, eva_elapsed_s: crewOf(end, id).eva_elapsed_s });
      expect(crewOf(end, id).eva_elapsed_s).toBe(END_TICK);
    }
  });

  it("start_offset_s delays a crew member's walk by its offset", () => {
    const offset = Math.ceil(legSeconds(okLegs[0]) / 2);
    const delayed: LoadedScenario = { ...fake, scenario: { ...fake.scenario, crew: fake.scenario.crew.map((c) => (c.crew_id === "EV2" ? { ...c, start_offset_s: offset } : c)) } };
    const trace = run(onEva(), END_TICK + offset + 5, delayed);
    for (let n = 1; n < trace.states.length; n++) {
      expectPosition(pos(trace.states[n], "EV1"), expectedPosition(n), `EV1 tick ${n}`);
      expectPosition(pos(trace.states[n], "EV2"), n <= offset ? [startWp.x_m, startWp.y_m] : expectedPosition(n - offset), `EV2 tick ${n}`);
    }
    // Waiting at the start uses no O₂; the first step of the walk does.
    expect(crewOf(trace.states[offset], "EV2").o2_frac).toBe(1);
    expect(crewOf(trace.states[offset + 1], "EV2").o2_frac).toBeLessThan(1);
    expect(crewOf(trace.states[offset], "EV1").o2_frac).toBeLessThan(1);
    expect(eventsOf(trace, "ARRIVED_STOP", "EV1")[0].tick).toBe(tickOf(0));
    expect(eventsOf(trace, "ARRIVED_STOP", "EV2")[0].tick).toBe(tickOf(0, offset));
    expect(eventsOf(trace, "CREW_SHELTERED", "EV2").map((e) => e.tick)).toEqual([tickOf(phases.length - 1, offset)]);
  });

  it("O₂ fraction changes only through compute stepO2: one call per crew per tick on the EVA, none in the hab", () => {
    const trace = run(onEva(), END_TICK + 5);
    const suitParams = fake.params[fake.scenario.crew[0].suit_param_set];
    const expected: unknown[][] = [];
    const folded: Record<string, number> = { EV1: 1, EV2: 1 };
    for (let n = 1; n < trace.states.length; n++) {
      for (const id of CREW) {
        const activity = crewOf(trace.states[n - 1], id).activity;
        if (activity === "IN_HAB") continue; // no O₂ in the hab
        const mode = activity === "AT_STOP" ? "resting" : "walking";
        expected.push([folded[id], mode, 1, suitParams]);
        folded[id] = actual.stepO2(folded[id], mode, 1, suitParams);
      }
    }
    expect(stepO2Spy.mock.calls).toEqual(expected);
    expect(expected.length).toBe(2 * END_TICK);
    for (const id of CREW) expect(crewOf(trace.states.at(-1)!, id).o2_frac).toBe(folded[id]);
    expect(folded.EV1).toBeLessThan(1);
  });

  it("event dose changes only through compute integrateDose (received and unsheltered): one step per call", () => {
    const trace = run(onEva(), END_TICK + 5);
    const shielding = Object.values(fake.params).find((p) => p.kind === "shielding")!;
    const schedule: Record<string, { t_utc: string; dt_s: number; shelter: "suit" | "hab" }[]> = { EV1: [], EV2: [] };
    for (let n = 1; n < trace.states.length; n++) {
      for (const id of CREW) {
        const activity = crewOf(trace.states[n - 1], id).activity;
        schedule[id].push({ t_utc: iso(Date.parse(trace.states[n].session.clock.sim_time) - 1000), dt_s: 1, shelter: activity === "IN_HAB" ? "hab" : "suit" });
      }
    }
    expect(integrateDoseSpy).toHaveBeenCalledTimes(2 * (trace.states.length - 1));
    for (const [series, steps, set] of integrateDoseSpy.mock.calls) {
      expect(steps).toHaveLength(1);
      // From the press (series_start_utc) the scenario's series; before it the constant background series (02 §D.17).
      if (Date.parse(steps[0].t_utc) >= SERIES_START_MS) expect(series).toBe(fake.dose);
      else expect(series.samples.map(([, r]) => r)).toEqual([fake.dose.background_rate]);
      expect(set).toBe(shielding);
    }
    const called = integrateDoseSpy.mock.calls.map(([, steps]) => steps[0]);
    expect(called).toEqual(trace.states.slice(1).flatMap((_, i) => CREW.map((id) => schedule[id][i])));
    for (const id of CREW) {
      const total = actual.integrateDose(fake.dose, schedule[id], shielding);
      const end = crewOf(trace.states.at(-1)!, id);
      expect(end.dose_event_ugy).toBeCloseTo(total.received_ugy, 10);
      expect(end.dose_event_unsheltered_ugy).toBeCloseTo(total.unsheltered_ugy, 10);
      expect(total.received_ugy).toBeGreaterThan(0);
      expect(total.unsheltered_ugy).toBeGreaterThan(total.received_ugy);
    }
  });

  it("per-tick positions are STATE_DELTAs, never LogEvents", () => {
    const trace = baseRun();
    const allowed: LogEventKind[] = ["ARRIVED_STOP", "LEFT_STOP", "CREW_SHELTERED", "EVA_ENDED", "ALERT_RAISED", "ALERT_CLEARED"];
    for (const events of trace.events) for (const e of events) expect(allowed).toContain(e.kind);
    // The first tick moves both crew by a delta carrying the new value, and logs nothing.
    expect(trace.events[1]).toEqual([]);
    for (const id of CREW) expect(trace.deltas[1]).toContainEqual({ path: `crew/${id}/x_m`, value: crewOf(trace.states[1], id).x_m });
    // A delta is sent only when the value changed: standing in a dwell moves nothing but O₂, time and dose, and the two margins
    // that follow them (O₂ time left and the ETA to the next stop; the bearing and distance to it stay, T32.31, BD-95).
    const inDwell = tickOf(0) + 10;
    const dwellPaths = CREW.flatMap((id) => [`crew/${id}/dose_event_ugy`, `crew/${id}/dose_event_unsheltered_ugy`, `crew/${id}/eva_elapsed_s`, `crew/${id}/o2_frac`, `crew/${id}/o2_remaining_min`, `crew/${id}/next_stop_eta_s`]);
    expect(trace.deltas[inDwell].map((d) => d.path).sort()).toEqual(dwellPaths.sort());
    // The fake scenario has no Site, so the conditions feed (T22.16, BD-127) has no solar fields: the first tick reports the two
    // dose rates, and later ticks only the event series time once START_EVENT has played (and a rate when it steps).
    const conditionPaths = trace.deltas.map((ds) => ds.filter((d) => d.path.startsWith("conditions/")).map((d) => d.path));
    expect(conditionPaths[1].sort()).toEqual(["conditions/dose_rate_background_ugy_h", "conditions/dose_rate_event_ugy_h"]);
    expect(conditionPaths[2]).toEqual([]);
    expect(conditionPaths.flat().every((p) => ["conditions/dose_rate_background_ugy_h", "conditions/dose_rate_event_ugy_h", "conditions/event_series_utc"].includes(p))).toBe(true);
    // The fake scenario's one Earth-link row has a Sun-Earth-Mars angle of 0 degrees, inside `conjunction_deg`, so the first tick
    // reports `earth/blackout` and `earth/link_state` once (T26.04, BD-129, BD-156); light time (0 s) and next pass (none) are unchanged.
    expect(trace.deltas.flat().filter((d) => d.path.startsWith("earth/"))).toEqual([{ path: "earth/blackout", value: true }, { path: "earth/link_state", value: "BLACKOUT" }]);
    expect(trace.deltas.flat().filter((d) => !d.path.startsWith("conditions/") && !d.path.startsWith("earth/")).every((d) => /^crew\/(EV1|EV2)\/(x_m|y_m|o2_frac|eva_elapsed_s|dose_event_ugy|dose_event_unsheltered_ugy|o2_remaining_min|next_stop_bearing_deg|next_stop_distance_m|next_stop_eta_s)$/.test(d.path))).toBe(true);
    // Applying the deltas to the start reproduces the end state (what a client does).
    const folded = new Map<string, unknown>();
    for (const d of trace.deltas.flat()) folded.set(d.path, d.value);
    for (const id of CREW) {
      const end = crewOf(trace.states.at(-1)!, id);
      const start = crewOf(trace.states[0], id);
      for (const key of ["x_m", "y_m", "o2_frac", "eva_elapsed_s", "dose_event_ugy", "dose_event_unsheltered_ugy"] as const) {
        expect(folded.get(`crew/${id}/${key}`) ?? start[key], `${id} ${key}`).toBe(end[key]);
      }
    }
  });

  it("after PLAN_REVISED a TO_HAVEN crew follows the revised legs from its current position, with no LEFT_STOP", () => {
    const stopTick = tickOf(0) + 10;
    const before = run(onEva(), stopTick).states[stopTick];
    expect(crewOf(before, "EV1").activity).toBe("AT_STOP");
    const [wp0, wp1] = plan.waypoints;
    const leg0 = okLegs[0];
    const back: OkLeg = { ...leg0, from: wp1.id, to: wp0.id, geometry: [...leg0.geometry].reverse() };
    const back_s = legSeconds(back);
    const send = (s: EngineState, e: { kind: LogEventKind; data: object }): EngineState =>
      reduce(s, logged({ ...e, sim_time: s.session.clock.sim_time, actor: "system", provenance: {} } as PendingEvent, s.session.last_seq + 1));
    let revised = send(before, {
      kind: "OPTIONS_PROPOSED",
      data: {
        alert_id: "a-abort",
        options: [{ option_id: "o-abort", alert_id: "a-abort", kind: "ABORT_TO_HAB", crew_ids: CREW, eta_shelter_min: back.walk_time_min, expected_dose_ugy: 0, stops_dropped: [2], violations: [], rank: 1, path_preview: back.geometry, rendezvous: null }],
      },
    });
    revised = send(revised, { kind: "PLAN_REVISED", data: { plan_revision: 2, option_id: "o-abort", stops_dropped: [2], waypoints: [wp0, wp1], legs: [leg0, back] } });
    expect(CREW.map((id) => crewOf(revised, id).activity)).toEqual(["TO_HAVEN", "TO_HAVEN"]);

    const trace = run(revised, Math.ceil(back_s) + 5);
    expect(eventsOf(trace, "LEFT_STOP")).toEqual([]);
    expect(eventsOf(trace, "ARRIVED_STOP")).toEqual([]);
    const half = Math.ceil(back_s / 2);
    for (const id of CREW) {
      expectPosition(pos(trace.states[half], id), along(back.geometry, half / back_s), `midpoint of the way back ${id}`);
      expect(crewOf(trace.states[half], id).activity).toBe("TO_HAVEN");
      expect(eventsOf(trace, "CREW_SHELTERED", id).map((e) => e.tick)).toEqual([Math.ceil(back_s)]);
      expect(eventsOf(trace, "CREW_SHELTERED", id)[0].event.data).toMatchObject({ haven_kind: "hab" });
      // ToHaven → Sheltered (03 §E.8), not InHab: that step is for a crew member who walked the plan to its end.
      expect(crewOf(trace.states.at(-1)!, id)).toMatchObject({ activity: "SHELTERED", x_m: wp0.x_m, y_m: wp0.y_m, haven: expect.objectContaining({ kind: "hab" }) });
    }
  });

  it("tick events and module events get consecutive seqs from next_seq and are already reduced into the state", () => {
    // Shift the clock so that the radiation trigger (RAISE_AT) falls on the tick where the crew reach stop 1.
    const start = at(onEva(), RAISE_AT - tickOf(0) * 1000);
    const n = tickOf(0);
    const trace = run(start, n);
    const prev = trace.states[n - 1];
    const next_seq = prev.session.last_seq + 1;
    const events = trace.events[n];
    expect(events.map((e) => [e.kind, (e.data as { crew_id?: string; code?: string }).crew_id ?? (e.data as { code?: string }).code])).toEqual([
      ["ARRIVED_STOP", "EV1"],
      ["ARRIVED_STOP", "EV2"],
      ["ALERT_RAISED", "RADIATION_ALERT"],
    ]);
    const state = trace.states[n];
    expect(state.session.last_seq).toBe(next_seq + events.length - 1);
    expect((events[2].data as LogEventData["ALERT_RAISED"]).alert_id).toBe(`a-${next_seq + 2}`);
    expect(state.alerts).toEqual([expect.objectContaining({ alert_id: `a-${next_seq + 2}`, raised_seq: next_seq + 2, code: "RADIATION_ALERT" })]);
    expect(CREW.map((id) => crewOf(state, id).activity)).toEqual(["AT_STOP", "AT_STOP"]);
    // The session appends these events with the same seqs; folding them over the previous state agrees.
    const folded = events.reduce((s, e, i) => reduce(s, logged(e, next_seq + i)), prev);
    expect(folded.session.last_seq).toBe(state.session.last_seq);
    expect(folded.alerts).toEqual(state.alerts);
  });

  it("a module that is still a T22.01 stub is skipped; any other module error propagates", () => {
    const s = onEva();
    const earth = vi.mocked(earthTick);
    // The guard skips a module whose body is still the T22.01 stub (earth.ts and links.ts are real since package 18; the mock stands in).
    earth.mockImplementationOnce(() => {
      throw new Error("TODO(TASK-26): T26.04 not implemented");
    });
    expect(() => step(s)).not.toThrow();
    earth.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() => step(s)).toThrow("boom");
    // The guard is narrow: a stub-looking message with other text, or another prefix, is a real error.
    earth.mockImplementationOnce(() => {
      throw new Error("TODO(TASK-26): T26.04 not implemented yet");
    });
    expect(() => step(s)).toThrow(/not implemented yet/);
    earth.mockImplementationOnce(() => {
      throw new Error("FIXME: T26.04 not implemented");
    });
    expect(() => step(s)).toThrow(/FIXME/);
    // Skipped on every call, nothing cached: the guard still works afterwards.
    expect(() => step(s)).not.toThrow();
  });

  it("the same input gives the same events and deltas (determinism, NFR-06)", () => {
    const start = at(onEva(), RAISE_AT - tickOf(0) * 1000);
    const a = run(start, tickOf(0) + 30);
    const b = run(start, tickOf(0) + 30);
    expect(canonicalJson(b.events)).toBe(canonicalJson(a.events));
    expect(canonicalJson(b.deltas)).toBe(canonicalJson(a.deltas));
    expect(canonicalJson(b.states.at(-1))).toBe(canonicalJson(a.states.at(-1)));
    expect(a.events.flat().length).toBeGreaterThan(0);
  });

  it("a JSON round trip of the state mid-run gives the same later events, byte for byte (snapshot and resume)", () => {
    for (const mid of [Math.floor(legSeconds(okLegs[0]) / 2), tickOf(0) + 100, tickOf(1) + 100]) {
      const live = run(onEva(), mid).states[mid];
      const restored: EngineState = JSON.parse(JSON.stringify(live));
      expect(restored, `tick ${mid}: nothing lost in JSON (no undefined, NaN, Infinity or -0)`).toStrictEqual(live);
      const ahead = tickOf(1) - mid + 60;
      const a = run(live, ahead);
      const b = run(restored, ahead);
      expect(canonicalJson(b.events)).toBe(canonicalJson(a.events));
      expect(canonicalJson(b.deltas)).toBe(canonicalJson(a.deltas));
      expect(canonicalJson(b.states.at(-1))).toBe(canonicalJson(a.states.at(-1)));
    }
  });

  it.todo("a SHELTERED crew member in a vehicle uses the pressurized_rover factor and no O₂; in a refuge, the suit factor at the resting rate (S9, with T23.05)");
});

// ---------------------------------------------------------------------------------------------
// Review fixes (T22.09, proposed 2026-11-07): EVA end, waiting crew, LEFT_STOP, holds, bad legs
// ---------------------------------------------------------------------------------------------

const wpStart = plan.waypoints[0];
const suitSet = fake.params[fake.scenario.crew[0].suit_param_set];
type AnyLeg = (typeof plan.result.legs)[number];
const send = (s: EngineState, kind: LogEventKind, data: object): EngineState =>
  reduce(s, logged({ kind, data, sim_time: s.session.clock.sim_time, actor: "system", provenance: {} } as PendingEvent, s.session.last_seq + 1));
const revise = (s: EngineState, waypoints: typeof plan.waypoints, legs: AnyLeg[], extra: object = {}): EngineState =>
  send(s, "PLAN_REVISED", { plan_revision: s.session.plan_revision + 1, option_id: null, stops_dropped: [], waypoints, legs, ...extra });

/** A scenario whose plan is `waypoints` and `legs` with this dwell; crew, ParamSets and dose stay the fixture's. */
function planOf(waypoints: typeof plan.waypoints, legs: AnyLeg[], dwell_min = plan.scenario.dwell_min_per_stop): LoadedScenario {
  return { ...fake, scenario: { ...fake.scenario, plan: { ...plan, waypoints, scenario: { ...plan!.scenario, dwell_min_per_stop: dwell_min }, result: { ...plan!.result, legs } } } };
}
/** An OK leg with this geometry; the test numbers are hand-picked so the speed is 1 m/s. */
const legOf = (from: string, to: string, geometry: [number, number][], walk_time_min: number): OkLeg => ({ ...okLegs[0], from, to, geometry, walk_time_min });
const noRoute = (from: string, to: string): AnyLeg => ({ from, to, status: "NO_ROUTE", reason: "DISCONNECTED_BY_SLOPE" });
const stopAt = (id: string, x_m: number, y_m: number) => ({ id, role: "stop" as const, x_m, y_m });

describe("tick: the EVA ends when every crew member is IN_HAB or SHELTERED (03 §E.6; proposed 2026-11-07)", () => {
  it("logs one system EVA_ENDED {crew_ids} after the CREW_SHELTERED events of that tick, then the session is ENDED", () => {
    const trace = baseRun();
    const ended = eventsOf(trace, "EVA_ENDED");
    expect(ended.map((e) => e.tick)).toEqual([END_TICK]);
    expect(ended[0].event).toMatchObject({ actor: "system", data: { crew_ids: ["EV1", "EV2"] }, sim_time: trace.states[END_TICK].session.clock.sim_time });
    expect(trace.events[END_TICK].map((e) => e.kind)).toEqual(["CREW_SHELTERED", "CREW_SHELTERED", "EVA_ENDED"]);
    expect(trace.states[END_TICK - 1].session.status).toBe("RUNNING");
    expect(trace.states[END_TICK].session.status).toBe("ENDED");
    expect(trace.states[END_TICK].session.last_seq).toBe(trace.states[END_TICK - 1].session.last_seq + 3);
  });

  it("waits for the last crew member: EV1 sheltered alone does not end it", () => {
    const offset = 100;
    const delayed: LoadedScenario = { ...fake, scenario: { ...fake.scenario, crew: fake.scenario.crew.map((c) => (c.crew_id === "EV2" ? { ...c, start_offset_s: offset } : c)) } };
    const trace = run(onEva(delayed), END_TICK + offset + 3, delayed);
    expect(eventsOf(trace, "CREW_SHELTERED", "EV1").map((e) => e.tick)).toEqual([END_TICK]);
    expect(eventsOf(trace, "EVA_ENDED").map((e) => e.tick)).toEqual([tickOf(phases.length - 1, offset)]);
    expect(trace.states[END_TICK + 1].session.status).toBe("RUNNING");
  });

  it("does not end a session that is not running (the EVA has not started)", () => {
    const loaded = initialState(fake, "s-0001");
    expect(loaded.crew.every((c) => c.activity === "IN_HAB")).toBe(true);
    expect(step(loaded).events.filter((e) => e.kind === "EVA_ENDED")).toEqual([]);
  });
});

describe("tick: a crew member waiting out start_offset_s is not out (S4; proposed 2026-11-07)", () => {
  const offset = 300;
  const delayed: LoadedScenario = { ...fake, scenario: { ...fake.scenario, crew: fake.scenario.crew.map((c) => (c.crew_id === "EV2" ? { ...c, start_offset_s: offset } : c)) } };

  it("no BUDDY_SEPARATION while EV2 waits and EV1 is walking beyond buddy_max_m; it fires once EV2 starts", () => {
    const trace = run(onEva(delayed), offset + 3, delayed);
    const [x, y] = pos(trace.states[offset - 1], "EV1");
    expect(Math.hypot(x - wpStart.x_m, y - wpStart.y_m), "EV1 is beyond buddy_max_m of the waiting EV2").toBeGreaterThan(v.buddy_max_m);
    // EV2 is out from the tick on which its offset has elapsed, not before.
    const buddy = eventsOf(trace, "ALERT_RAISED").filter((e) => (e.event.data as { code?: string }).code === "BUDDY_SEPARATION");
    expect(buddy.map((e) => e.tick)).toEqual([offset]);
  });

  it("eva_elapsed_s does not grow while waiting, and counts only the time after the offset in a long step", () => {
    const trace = run(onEva(delayed), offset + 2, delayed);
    expect(crewOf(trace.states[offset], "EV2").eva_elapsed_s).toBe(0);
    expect(crewOf(trace.states[offset], "EV1").eva_elapsed_s).toBe(offset);
    expect(crewOf(trace.states[offset + 2], "EV2").eva_elapsed_s).toBe(2);
    const start = onEva(delayed);
    const dt = 90;
    const short: LoadedScenario = { ...fake, scenario: { ...fake.scenario, crew: fake.scenario.crew.map((c) => (c.crew_id === "EV2" ? { ...c, start_offset_s: 30 } : c)) } };
    const r = tick(at(start, Date.parse(start.session.clock.sim_time) + dt * 1000), short, dt, start.session.last_seq + 1);
    expect(crewOf(r.state, "EV1").eva_elapsed_s).toBe(dt);
    expect(crewOf(r.state, "EV2").eva_elapsed_s).toBe(dt - 30);
  });

  it("the alert modules treat a waiting crew member as not out, with or without a motion record", () => {
    const base = onEva(delayed);
    const waiting = { plan_revision: 1, phase: "wait" as const, leg_index: 0, t_s: 0, last_wp_id: wpStart.id };
    const low = withCrew(base, "EV2", { o2_frac: (v.o2_warning_margin * 40 * 60) / O2_FULL_S, haven: { ...base.crew[1].haven, minutes: 40 } });
    for (const s of [low, { ...low, motion: { EV2: waiting } }]) {
      expect(consumablesTick(s, ctx(s, delayed)).events, "a waiting crew member is safe in the hab").toEqual([]);
      const apart = withCrew(withCrew(s, "EV1", { x_m: 0, y_m: 0 }), "EV2", { x_m: v.buddy_max_m + 1, y_m: 0 });
      expect(buddyTick(apart, ctx(apart, delayed)).events).toEqual([]);
    }
    // The same state without the offset: both are out, so the O2 alert applies.
    expect(raisedData(consumablesTick(low, ctx(low)).events)).toHaveLength(1);
  });
});

describe("tick: LEFT_STOP when a dwell ends, even if the plan dropped the stop (S8; proposed 2026-11-07)", () => {
  it("a CONTINUE_SKIP revision that drops the stop being dwelt at: LEFT_STOP carries the crew member's stop_index", () => {
    const stopTick = tickOf(0) + 10;
    const before = run(onEva(), stopTick).states[stopTick];
    expect(crewOf(before, "EV1")).toMatchObject({ activity: "AT_STOP", stop_index: 1 });
    const [wp0, , wp2] = plan.waypoints;
    let s = send(before, "OPTIONS_PROPOSED", {
      alert_id: "a-skip",
      options: [{ option_id: "o-skip", alert_id: "a-skip", kind: "CONTINUE_SKIP", crew_ids: CREW, eta_shelter_min: 0, expected_dose_ugy: 0, stops_dropped: [1], violations: [], rank: 1, path_preview: [], rendezvous: null }],
    });
    s = revise(s, [wp0, wp2], [okLegs[1], okLegs[2]], { option_id: "o-skip", stops_dropped: [1] });
    expect(CREW.map((id) => crewOf(s, id).activity)).toEqual(["AT_STOP", "AT_STOP"]);
    const trace = run(s, tickOf(2) - stopTick + 2);
    const left = eventsOf(trace, "LEFT_STOP").map((e) => ({ tick: e.tick + stopTick, data: e.event.data }));
    expect(left).toEqual(CREW.map((crew_id) => ({ tick: tickOf(1), data: { crew_id, stop_id: stopIds[0], stop_index: 1 } })));
    // The next stop is wp-2, now the only stop of the revised plan: index 1.
    expect(eventsOf(trace, "ARRIVED_STOP", "EV1").map((e) => ({ tick: e.tick + stopTick, data: e.event.data }))).toEqual([{ tick: tickOf(2), data: { crew_id: "EV1", stop_id: stopIds[1], stop_index: 1 } }]);
  });
});

describe("tick: holding rests, and a revision with a reachable next leg resumes the walk (S5, S7, S9; proposed 2026-11-07)", () => {
  const dwell_min = 0.5;
  const dwellEnd = (leg_s: number): number => Math.ceil(leg_s + dwell_min * 60);
  const wp1 = plan.waypoints[1];
  const wp2 = plan.waypoints[2];
  const blocked = planOf([wpStart, wp1, wp2], [okLegs[0], noRoute(wp1.id, wp2.id)], dwell_min);

  it("a crew member held behind a NO_ROUTE leg stays put with no event and rests (O₂ at the resting rate)", () => {
    const h = dwellEnd(legSeconds(okLegs[0]));
    const trace = run(onEva(blocked), h + 6, blocked);
    expect(eventsOf(trace, "LEFT_STOP", "EV1").map((e) => e.tick)).toEqual([h]);
    expect(trace.events.slice(h + 1).flat()).toEqual([]);
    for (let n = h + 1; n <= h + 6; n++) {
      for (const id of CREW) {
        expect(pos(trace.states[n], id)).toEqual([wp1.x_m, wp1.y_m]);
        expect(crewOf(trace.states[n], id).o2_frac, `tick ${n} ${id}`).toBe(actual.stepO2(crewOf(trace.states[n - 1], id).o2_frac, "resting", 1, suitSet));
      }
    }
  });

  it("a revision that replaces the NO_ROUTE leg with an OK one makes the held crew resume walking from where they stand", () => {
    const h = dwellEnd(legSeconds(okLegs[0]));
    const held = run(onEva(blocked), h + 4, blocked).states[h + 4];
    const resumed = revise(held, [wpStart, wp1, wp2], [okLegs[0], okLegs[1]]);
    const trace = run(resumed, 30);
    for (const id of CREW) {
      for (const k of [1, 10, 30]) expectPosition(pos(trace.states[k], id), along(okLegs[1].geometry, k / legSeconds(okLegs[1])), `resumed ${id} +${k}`);
      expect(crewOf(trace.states[1], id).activity).toBe("WALKING");
    }
    // A revision that leaves the leg blocked keeps them held.
    const still = run(revise(held, [wpStart, wp1, wp2], [okLegs[0], noRoute(wp1.id, wp2.id)]), 5);
    for (const id of CREW) expect(pos(still.states[5], id)).toEqual([wp1.x_m, wp1.y_m]);
  });

  it("the end of a non-loop route holds at the last waypoint with no event, and a revision there does not arrive again", () => {
    const oneWay = planOf([wpStart, wp1], [okLegs[0]], dwell_min);
    const h = dwellEnd(legSeconds(okLegs[0]));
    const trace = run(onEva(oneWay), h + 5, oneWay);
    expect(trace.events.slice(h + 1).flat()).toEqual([]);
    expect(eventsOf(trace, "CREW_SHELTERED")).toEqual([]);
    expect(eventsOf(trace, "EVA_ENDED")).toEqual([]);
    const again = run(revise(trace.states[h + 5], [wpStart, wp1], [okLegs[0]]), 5);
    expect(again.events.flat()).toEqual([]);
    expect(pos(again.states[5], "EV1")).toEqual([wp1.x_m, wp1.y_m]);
    expect(crewOf(again.states[5], "EV1").activity).toBe("WALKING");
  });

  it("a TO_HAVEN crew member waiting at a rendezvous (the route ends away from the start) rests and is not sheltered by tick", () => {
    const stopTick = tickOf(0) + 10;
    const before = run(onEva(), stopTick).states[stopTick];
    const rendezvous = legOf(wp1.id, "wp-r", [[wp1.x_m, wp1.y_m], [wp1.x_m - 100, wp1.y_m]], 0.5);
    let s = send(before, "OPTIONS_PROPOSED", {
      alert_id: "a-pr",
      options: [{ option_id: "o-pr", alert_id: "a-pr", kind: "RENDEZVOUS_PR", crew_ids: CREW, eta_shelter_min: 1, expected_dose_ugy: 0, stops_dropped: [2], violations: [], rank: 1, path_preview: rendezvous.geometry, rendezvous: null }],
    });
    s = revise(s, [wpStart, wp1], [okLegs[0], rendezvous], { option_id: "o-pr", stops_dropped: [2] });
    expect(crewOf(s, "EV1").activity).toBe("TO_HAVEN");
    const trace = run(s, 40);
    expect(eventsOf(trace, "CREW_SHELTERED")).toEqual([]);
    expect(eventsOf(trace, "EVA_ENDED")).toEqual([]);
    expect(pos(trace.states[40], "EV1")).toEqual([wp1.x_m - 100, wp1.y_m]);
    for (let n = 36; n <= 40; n++) expect(crewOf(trace.states[n], "EV1").o2_frac).toBe(actual.stepO2(crewOf(trace.states[n - 1], "EV1").o2_frac, "resting", 1, suitSet));
  });
});

describe("tick: a plan error throws instead of arriving instantly (S11; proposed 2026-11-07)", () => {
  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])("walk_time_min %s on the leg being walked", (walk_time_min) => {
    const bad = planOf(plan.waypoints, [{ ...okLegs[0], walk_time_min }, okLegs[1], okLegs[2]]);
    expect(() => step(onEva(bad), bad)).toThrow(/walk_time_min/);
  });

  it("zero stays an instant arrival (S2)", () => {
    const zero = planOf(plan.waypoints, [{ ...okLegs[0], walk_time_min: 0 }, okLegs[1], okLegs[2]]);
    const r = step(onEva(zero), zero);
    expect(r.events.map((e) => e.kind)).toEqual(["ARRIVED_STOP", "ARRIVED_STOP"]);
    expect(pos(r.state, "EV1")).toEqual([okLegs[0].geometry.at(-1)![0], okLegs[0].geometry.at(-1)![1]]);
  });
});

describe("tick: interpolation and re-anchoring pinned by hand-computed geometry", () => {
  const origin = { ...wpStart, x_m: 0, y_m: 0 };

  it("a zig-zag leg of 20 + 30 + 10 m walked in 1 min (1 m/s) puts the crew at the hand-computed points", () => {
    const zig: [number, number][] = [[0, 0], [20, 0], [20, 30], [10, 30]];
    const sc = planOf([origin, stopAt("wp-1", 10, 30)], [legOf("wp-0", "wp-1", zig, 1)]);
    const trace = run(onEva(sc), 60, sc);
    const expected: [number, [number, number]][] = [
      [1, [1, 0]],
      [10, [10, 0]],
      [20, [20, 0]],
      [21, [20, 1]],
      [35, [20, 15]],
      [50, [20, 30]],
      [55, [15, 30]],
      [60, [10, 30]],
    ];
    for (const [n, point] of expected) expectPosition(pos(trace.states[n], "EV1"), point, `tick ${n}`);
    expect(eventsOf(trace, "ARRIVED_STOP", "EV1").map((e) => e.tick)).toEqual([60]);
  });

  it("a zero-length segment inside a leg is stepped over without a NaN", () => {
    const geometry: [number, number][] = [[0, 0], [10, 0], [10, 0], [10, 20]];
    const sc = planOf([origin, stopAt("wp-1", 10, 20)], [legOf("wp-0", "wp-1", geometry, 0.5)]);
    const trace = run(onEva(sc), 30, sc);
    const expected: [number, [number, number]][] = [[5, [5, 0]], [10, [10, 0]], [11, [10, 1]], [20, [10, 10]], [30, [10, 20]]];
    for (const [n, point] of expected) expectPosition(pos(trace.states[n], "EV1"), point, `tick ${n}`);
    for (const s of trace.states) for (const id of CREW) expect(Number.isFinite(crewOf(s, id).x_m + crewOf(s, id).y_m)).toBe(true);
  });

  it("a leg of zero length is walked in no time: arrival, dwell and the next leg in the same step", () => {
    const sc = planOf(
      [origin, stopAt("wp-1", 0, 0), stopAt("wp-2", 0, 30)],
      [legOf("wp-0", "wp-1", [[0, 0], [0, 0]], 1), legOf("wp-1", "wp-2", [[0, 0], [0, 30]], 0.5)],
      0,
    );
    const r = step(onEva(sc), sc);
    const kinds = r.events.filter((e) => e.data && (e.data as { crew_id?: string }).crew_id === "EV1").map((e) => [e.kind, (e.data as { stop_id: string }).stop_id]);
    expect(kinds).toEqual([["ARRIVED_STOP", "wp-1"], ["LEFT_STOP", "wp-1"]]);
    expectPosition(pos(r.state, "EV1"), [0, 1], "one second into the 30 m, 30 s leg");
  });

  /** Both crew mid-walk on the fixture, standing at (x, y) when the plan is revised to `legs`; EV1's position after the next tick. */
  function snapTo(x: number, y: number, legs: AnyLeg[]): [number, number] {
    const walking = run(onEva(), 1).states[1];
    const placed = { ...walking, crew: walking.crew.map((c) => ({ ...c, x_m: x, y_m: y })) };
    return pos(step(revise(placed, plan.waypoints, legs)).state, "EV1");
  }

  it("closest() over several segments: the crew snap to the nearest segment, and the arc length to it carries on", () => {
    // A U of 10 + 10 + 10 m in 30 s (1 m/s). (12, 7) is 2 m from the middle segment, 7.28 m from the first and 3.6 m from the last: arc length 17, so 18 m one second later.
    const u: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expectPosition(snapTo(12, 7, [legOf("wp-0", "wp-1", u, 0.5)]), [10, 8], "middle segment");
  });

  it("closest() ties go to the earliest segment, then the earliest leg; a strictly closer later leg wins", () => {
    const u: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    // (5, 5) is 5 m from all three segments: the first wins (arc length 5, then 6 m on).
    expectPosition(snapTo(5, 5, [legOf("wp-0", "wp-1", u, 0.5)]), [6, 0], "first of three equal segments");
    // Two legs 5 m from (5, 5): the first leg (10 m in 30 s: arc 5 is t = 15 s, one second on is 16/30 of 10 m).
    const a = legOf("wp-0", "wp-1", [[0, 0], [10, 0]], 0.5);
    const b = legOf("wp-1", "wp-2", [[0, 10], [10, 10]], 0.5);
    expectPosition(snapTo(5, 5, [a, b]), [(16 / 30) * 10, 0], "first of two equal legs");
    // (5, 8) is 2 m from the second leg and 8 m from the first.
    expectPosition(snapTo(5, 8, [a, b]), [(16 / 30) * 10, 10], "the strictly closer later leg");
  });

  it("a revision while WALKING keeps the crew where they are and walks the revised leg, then dwells at the stop", () => {
    const mid = Math.floor(legSeconds(okLegs[0]) / 2);
    const walking = run(onEva(), mid).states[mid];
    const slower: OkLeg = { ...okLegs[0], walk_time_min: okLegs[0].walk_time_min * 2 };
    const revised = revise(walking, plan.waypoints, [slower, okLegs[1], okLegs[2]]);
    expect(CREW.map((id) => crewOf(revised, id).activity)).toEqual(["WALKING", "WALKING"]);
    const newLeg = legSeconds(slower);
    const arrive = Math.ceil(newLeg - 2 * mid);
    const trace = run(revised, arrive + 3);
    for (const k of [1, Math.floor(arrive / 2), arrive - 1]) {
      for (const id of CREW) expectPosition(pos(trace.states[k], id), along(slower.geometry, (2 * mid + k) / newLeg), `+${k} ${id}`);
    }
    expect(eventsOf(trace, "ARRIVED_STOP", "EV1").map((e) => [e.tick, e.event.data])).toEqual([[arrive, { crew_id: "EV1", stop_id: stopIds[0], stop_index: 1 }]]);
    expect(crewOf(trace.states[arrive + 3], "EV1").activity).toBe("AT_STOP");
  });

  it("one 90-s step spanning the arrival, the dwell and the walk on gives the carried-over position", () => {
    const quick = planOf(plan.waypoints, okLegs, 0.5);
    const leg0_s = legSeconds(okLegs[0]);
    const n0 = Math.floor(leg0_s) - 10;
    const s0 = run(onEva(quick), n0, quick).states[n0];
    const dt = 90;
    stepO2Spy.mockClear();
    integrateDoseSpy.mockClear();
    const r = tick(at(s0, Date.parse(s0.session.clock.sim_time) + dt * 1000), quick, dt, s0.session.last_seq + 1);
    expect(r.events.map((e) => [e.kind, (e.data as { crew_id: string }).crew_id])).toEqual([["ARRIVED_STOP", "EV1"], ["LEFT_STOP", "EV1"], ["ARRIVED_STOP", "EV2"], ["LEFT_STOP", "EV2"]]);
    expect(r.state.session.last_seq).toBe(s0.session.last_seq + 4);
    const walked = dt - (leg0_s - n0) - quick.scenario.plan!.scenario.dwell_min_per_stop * 60;
    expect(walked).toBeGreaterThan(0);
    for (const id of CREW) {
      expectPosition(pos(r.state, id), along(okLegs[1].geometry, walked / legSeconds(okLegs[1])), `${id} after the long step`);
      expect(crewOf(r.state, id).activity).toBe("WALKING");
      expect(crewOf(r.state, id).eva_elapsed_s).toBe(n0 + dt);
    }
    expect(stepO2Spy.mock.calls.map((c) => [c[1], c[2]])).toEqual([["walking", dt], ["walking", dt]]);
    expect(integrateDoseSpy.mock.calls.map((c) => [c[1][0].dt_s, c[1][0].shelter])).toEqual([[dt, "suit"], [dt, "suit"]]);
  });
});
