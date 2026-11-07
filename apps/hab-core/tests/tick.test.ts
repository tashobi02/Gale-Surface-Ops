/**
 * T22.08: tick — crew motion, dwell, consumables, dose and alert order (docs/specs/02 §D.13, §D.14;
 * FR-35, FR-37, FR-38). Runs on the fake scenario (F8, T22.02).
 *
 * Alert cases (real now, for T22.10): the alert modules are called directly. The radiation trigger
 * itself is science and lives in @marswalk/compute (`triggerState`, `rateAt`; T05b.15, still a
 * stub), so this file replaces those two functions with a schedule built from the fixture's
 * declared shape: the dose step starts at PHASE_S and lasts PHASE_S, samples every SAMPLE_STEP_S,
 * and 02 §D.13 needs 2 consecutive high samples to raise and `rad_clear_min` low minutes to clear.
 * The engine part under test is: raise once on the nominal → alert change, clear once on the change
 * back, and the event fields.
 *
 * Consumables (decided 2026-11-07): the O₂ alert compares the O₂ time left (the real compute
 * `o2RemainingS`, T05b.17) with the time to the nearest haven
 * (`crew.haven`, T23.03). The message says where to go: the hab, or a pressurized rover to restock.
 * Both the O₂ and the buddy alert clear once the condition is safe again.
 *
 * Crew-motion, consumables and dose cases (todo): they need tick.ts (T22.09), which is blocked on
 * the compute dose integral and consumables (T05b.15, T05b.17). Their expected values will come from
 * the fixture legs and the compute functions, never typed in by hand.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { AlertCode, CrewId, LogEventData, ParamSet } from "@marswalk/protocol";
import { o2RemainingS } from "@marswalk/compute";
import { buddyTick, consumablesTick, radiationTick } from "../src/engine/alerts";
import { havenTick } from "../src/engine/haven";
import { linksTick } from "../src/engine/links";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import { MODULE_ORDER, type TickContext } from "../src/engine/tick";
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

vi.mock("@marswalk/compute", async () => {
  const actual = await vi.importActual<typeof import("@marswalk/compute")>("@marswalk/compute");
  return {
    ...actual,
    rateAt: (series: { samples: [string, number | null][] }, t_utc: string) => {
      const t = Date.parse(t_utc);
      let rate: number | null = null;
      for (const [ts, r] of series.samples) if (Date.parse(ts) <= t) rate = r;
      return rate;
    },
    triggerState: (_series: unknown, t_utc: string) => {
      const t = Date.parse(t_utc);
      return t >= RAISE_AT && t < CLEAR_AT ? "alert" : "nominal";
    },
  };
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

function onEva(): EngineState {
  const s = initialState(fake, "s-0001");
  return reduce(s, { seq: 1, sim_time: fake.scenario.start_utc, kind: "EVA_STARTED", actor: "ops", data: { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, provenance: {}, command_ref: { client_id: "c-1", command_id: "k-1" } });
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

// Blocked on T22.09 (tick.ts), which needs the compute dose integral and consumables (T05b.15, T05b.17).
describe("tick: crew motion, dwell, consumables and dose (T22.09)", () => {
  it.todo("crew position follows the planned path by cumulative leg time (fixture legs' walk_time_min)");
  it.todo("crew dwell dwell_min_per_stop at each stop; ARRIVED_STOP and LEFT_STOP fire once each");
  it.todo("O₂ fraction changes only through compute stepO2 (consumables.ts)");
  it.todo("event dose changes only through compute integrateDose (eventDose.ts), received and unsheltered");
  it.todo("per-tick positions are STATE_DELTAs, never LogEvents");
});
