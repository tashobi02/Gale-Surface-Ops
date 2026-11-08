/**
 * T23.06: contingency options, APPROVE_OPTION and ABORT (docs/specs/02 §D.15; 03 §E.5, §E.7, §E.8;
 * FR-44). Pairs with T23.07 (`engine/contingencyOps.ts`); red against the stubs. Runs on the fake
 * scenario (F8, T22.02): waypoints wp-0 (start), wp-1 (stop 1), wp-2 (stop 2) and the loop legs.
 *
 * Compute is replaced. Option building and ranking is `proposeOptions` in @marswalk/compute
 * (T05b.19), still a stub, and so are the time fields and the rendezvous it consumes. This file
 * mocks them with declared stand-ins (`standIn` below). The stand-in builds the options from fixture
 * values only: the crew stand at stop 1, the way home is the reverse of the fixture's first leg
 * (its geometry and `walk_time_min`), the rendezvous point is the middle of that way, the dose rate
 * is the fixture's step rate, the dose is rate × ETA, and the dropped stops are the stops after the
 * crew's stop. Nothing here is a computed number of the real science; every expectation below is
 * read from the fixture or from the stand-in's output. What the engine adds is under test.
 *
 * Decided 2026-11-07 (PLAN_REVISED, 05 "LogEvent `data` by kind", 02 §D.15):
 * - `PLAN_REVISED.data` = `{plan_revision, option_id, stops_dropped, waypoints, legs}`: `waypoints`
 *   are the plan's minus the option's `stops_dropped` (stop_index = position among the waypoints
 *   with `role: "stop"`, so wp-1 is stop 1); `legs` are the revised legs (the kept legs between
 *   remaining consecutive waypoints, plus a new leg built from the option's route).
 * - For a rendezvous option VEHICLE_DISPATCHED is logged before PLAN_REVISED.
 *
 * Rules fixed here for T23.07 where the specs are silent (proposed 2026-11-07, not yet in the specs):
 * TODO(decision): options per alert, not per crew. One OPTIONS_PROPOSED per new warning, with
 *   `alert_id`; every option's `crew_ids` is the crew on the alert who are still out (activity
 *   WALKING or AT_STOP; not IN_HAB, TO_HAVEN or SHELTERED). The module hands `proposeOptions` exactly
 *   those crew, the alert id and the sim time, and logs its options verbatim in rank order (the
 *   reducer drops all of an alert's options when one is executed, so per-crew options would lose
 *   the buddy's).
 * TODO(decision): "a new warning" = an alert of level `warning` that has no OPTIONS_PROPOSED
 *   answering it. A caution or advisory gets none. The module is pure, so it detects "new" from the
 *   state: options standing for the alert, or its crew already on the way to a haven (after an
 *   option was executed), mean "already answered". Provenance keys for the option fields are not
 *   fixed here (05 labels `eta_shelter_min` and `expected_dose_ugy` `modelled`).
 * TODO(decision): stale option = the `option_id` is not in `state.options` (never proposed, or
 *   removed when an option of that alert was executed), or its alert has been cleared. Both are
 *   INVALID. Whether a PUBLISH_PLAN after the proposal also makes options stale is open (an option
 *   carries no plan_revision).
 * TODO(decision): APPROVE_OPTION needs `args.option_id`. ABORT needs `args.crew` (a non-empty list
 *   of crew ids, like SUMMON_VEHICLE); an EVA role may abort only for a list that includes itself
 *   (02 §E.4 "self"; FORBIDDEN_ROLE otherwise), ops for any crew; an unknown crew id is INVALID.
 *   Either place (commands.ts or handleAbort) may enforce the self rule: these tests go through
 *   `handleCommand`.
 * TODO(decision): ABORT executes the ABORT_TO_HAB option that covers the listed crew, so it logs the
 *   same PLAN_REVISED as approving that option (its `option_id`, dropped stops and route) and never
 *   dispatches a vehicle. The option's whole crew goes TO_HAVEN (the buddies are not split). ABORT
 *   with no active alert (no option to execute) is not specified: left as `it.todo`.
 * TODO(decision): the new leg's `from` is the last remaining waypoint before the dropped stops, its
 *   `to` is the plan's start waypoint (the hab; the plan is a loop), `status` "OK", and its
 *   `geometry` is the option's `path_preview`. Its metrics are not asserted.
 *
 * Sim time only: events take `sim_time` from the state's clock, never wall-clock (NFR-06).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContingencyInputs, LoadedGrid } from "@marswalk/compute";
import type { Command, CommandResult, ContingencyOption, LogEvent, LogEventData, LogEventKind, Role, Waypoint } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand, type CommandContext } from "../src/commands";
import { contingencyTick, handleAbort, handleApproveOption } from "../src/engine/contingencyOps";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import type { TickContext } from "../src/engine/tick";
import { readScenario, type LoadedScenario } from "../src/scenario";

const here = dirname(fileURLToPath(import.meta.url));
/**
 * The fake scenario has no grid (null until TASK-05) and contingencyTick proposes nothing without one
 * (T23.07 review, 8 Nov). Compute is replaced below, so the grid is an opaque stand-in that only the
 * mocked functions receive (fixture shape added 2026-11-08 by the T23.07 rework; no assertion changed).
 */
const STAND_IN_GRID = Object.freeze({}) as unknown as LoadedGrid;
const fake: LoadedScenario = { ...readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null }), grid: STAND_IN_GRID };
const plan = fake.scenario.plan;
const legs = plan.result.legs;
const T0 = fake.scenario.start_utc;
const T_ALERT = new Date(Date.parse(T0) + 3600_000).toISOString().replace(".000Z", "Z");
const PR_ID = fake.scenario.vehicles.find((v) => v.kind === "pressurized_rover")!.vehicle_id;

/** Position among the plan's `role: "stop"` waypoints, from 1 (wp-1 is stop 1; 05 PLAN_REVISED). */
const stopNo = (id: string): number => plan.waypoints.filter((w) => w.role === "stop").findIndex((w) => w.id === id) + 1;
const without = (dropped: number[]): Waypoint[] => plan.waypoints.filter((w) => w.role !== "stop" || !dropped.includes(stopNo(w.id)));
const wp = (id: string): Waypoint => plan.waypoints.find((w) => w.id === id)!;

// ---- compute stand-ins (T05b.19 and its inputs are stubs) ------------------------------------------------

const calls = vi.hoisted(() => [] as unknown[]);

/** Fixture-derived stand-in for `proposeOptions` (see the header). Ignores every input but these two. */
function standIn(inputs: Pick<ContingencyInputs, "alert_id" | "crew">): ContingencyOption[] {
  const crew_ids = inputs.crew.map((c) => c.crew_id);
  const atStop = Math.min(...inputs.crew.map((c) => c.stop_index ?? 0));
  const stops_dropped = plan.waypoints.filter((w) => w.role === "stop" && stopNo(w.id) > atStop).map((w) => stopNo(w.id));
  const out = legs[0];
  if (out.status !== "OK") throw new Error("fixture: the first leg must be OK");
  const home = [...out.geometry].reverse() as [number, number][];
  const eta_min = out.walk_time_min;
  const rate = Math.max(...fake.dose.samples.map(([, r]) => r ?? 0));
  const meet: [number, number] = [(home[0][0] + home[1][0]) / 2, (home[0][1] + home[1][1]) / 2];
  const half_s = (eta_min * 60) / 2;
  const options = [
    { option_id: "o-abort", kind: "ABORT_TO_HAB", eta_shelter_min: eta_min, expected_dose_ugy: (rate * eta_min) / 60, path_preview: home, rendezvous: null },
    {
      option_id: "o-meet",
      kind: "VEHICLE_RENDEZVOUS",
      eta_shelter_min: eta_min / 2,
      expected_dose_ugy: (rate * eta_min) / 120,
      path_preview: [home[0], meet],
      rendezvous: { x_m: meet[0], y_m: meet[1], eta_crew_s: half_s, eta_vehicle_s: half_s },
    },
  ] as const;
  return [...options]
    .sort((a, b) => a.expected_dose_ugy - b.expected_dose_ugy || a.eta_shelter_min - b.eta_shelter_min)
    .map((o, i): ContingencyOption => ({ ...o, path_preview: [...o.path_preview] as [number, number][], alert_id: inputs.alert_id, crew_ids, stops_dropped, violations: [], rank: i + 1 }));
}

const field = {
  cell_m: 1,
  width: 1,
  height: 1,
  origin_m: [0, 0] as [number, number],
  seconds: new Float64Array(1),
  prev: new Int32Array(1),
};
vi.mock("@marswalk/compute", async () => {
  const actual = await vi.importActual<typeof import("@marswalk/compute")>("@marswalk/compute");
  return {
    ...actual,
    proposeOptions: (inputs: ContingencyInputs) => {
      calls.push(inputs);
      return standIn(inputs);
    },
    // Inputs of proposeOptions (T05b.04, T05b.07): opaque here, because the stand-in ignores them.
    habTimeField: () => field,
    crewTimeField: () => field,
    vehicleTimeField: () => field,
    vehiclePassable: () => new Uint8Array(1),
    rendezvous: () => ({ status: "NO_RENDEZVOUS" }),
  };
});

// ---- states -----------------------------------------------------------------------------------------------

let n = 0;
function cmd(role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command {
  return { command_id: `k-${++n}`, role, kind, args };
}
const cctx = (state: EngineState): CommandContext => ({ scenario: fake, client_id: "c-1", next_seq: state.session.last_seq + 1, accepted: new AcceptedCommands() });
const tctx = (state: EngineState): TickContext => ({ scenario: fake, dt_s: 1, next_seq: state.session.last_seq + 1 });

function apply(state: EngineState, kind: LogEventKind, data: LogEventData[LogEventKind], actor: Role | "system" = "system"): EngineState {
  const event: LogEvent = { seq: state.session.last_seq + 1, sim_time: state.session.clock.sim_time, kind, actor, data: data as Record<string, unknown>, provenance: {}, command_ref: null };
  return reduce(state, event);
}

/** Reduce pending events as the session does (seqs consecutive from the state's). */
const applyAll = (state: EngineState, events: PendingEvent[]): EngineState => events.reduce((s, e) => reduce(s, logged(e, s.session.last_seq + 1)), state);

const at = (state: EngineState, t: string): EngineState => ({ ...state, session: { ...state.session, clock: { ...state.session.clock, sim_time: t } } });

const running = apply(initialState(fake, "s-0001"), "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops");
const atStop1 = (["EV1", "EV2"] as const).reduce((s, id) => apply(s, "ARRIVED_STOP", { crew_id: id, stop_id: "wp-1", stop_index: 1 }), running);
const alerted = apply(at(atStop1, T_ALERT), "ALERT_RAISED", {
  alert_id: `a-${atStop1.session.last_seq + 1}`,
  code: "RADIATION_ALERT",
  level: "warning",
  subjects: ["EV1", "EV2"],
  message: "Radiation surge — shelter now",
});
const ALERT_ID = alerted.alerts[0].alert_id;
const proposed = apply(alerted, "OPTIONS_PROPOSED", { alert_id: ALERT_ID, options: standIn({ alert_id: ALERT_ID, crew: alerted.crew }) });
const rendezvousOpt = proposed.options.find((o) => o.kind === "VEHICLE_RENDEZVOUS")!;
const abortOpt = proposed.options.find((o) => o.kind === "ABORT_TO_HAB")!;

const dataOf = <K extends LogEventKind>(events: PendingEvent[], kind: K): LogEventData[K] => events.find((e) => e.kind === kind)!.data as LogEventData[K];

function rejected(result: CommandResult): Extract<CommandResult, { ok: false }>["code"] {
  expect(result.ok, JSON.stringify(result)).toBe(false);
  return (result as Extract<CommandResult, { ok: false }>).code;
}

beforeEach(() => {
  calls.length = 0;
});

// ---- contingencyTick: OPTIONS_PROPOSED --------------------------------------------------------------------


/**
 * Red until T23.07: while the module is still the T22.01 stub (it throws "not implemented"), these
 * suites are skipped so `make test` stays green on main; they run by themselves once T23.07 lands.
 * To see them fail now: `PENDING_RED=1 npm --workspace @marswalk/hab-core test -- contingencyOps`.
 */
const PENDING = !process.env.PENDING_RED && ([
  () => contingencyTick(undefined as never, undefined as never),
  () => handleApproveOption(undefined as never, undefined as never, undefined as never),
  () => handleAbort(undefined as never, undefined as never, undefined as never),
] as (() => unknown)[]).some((probe) => {
  try {
    probe();
    return false;
  } catch (err) {
    return /T23\.07 not implemented/.test(String(err));
  }
});

describe.skipIf(PENDING)("contingencyTick: options for a new warning (02 §D.15, 03 §E.5; FR-44)", () => {
  it("a RADIATION_ALERT produces one OPTIONS_PROPOSED for that alert, by system at the sim time", () => {
    const r = contingencyTick(alerted, tctx(alerted));
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ kind: "OPTIONS_PROPOSED", actor: "system", sim_time: T_ALERT });
    expect((r.events[0].data as LogEventData["OPTIONS_PROPOSED"]).alert_id).toBe(ALERT_ID);
  });

  it("the options cover each crew member on the alert, and compute is asked about those crew at the sim time", () => {
    const r = contingencyTick(alerted, tctx(alerted));
    const { options } = dataOf(r.events, "OPTIONS_PROPOSED");
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      expect(o.alert_id).toBe(ALERT_ID);
      expect(o.crew_ids).toEqual(["EV1", "EV2"]);
    }
    expect(calls).toHaveLength(1);
    const asked = calls[0] as ContingencyInputs;
    expect(asked.alert_id).toBe(ALERT_ID);
    expect(asked.crew.map((c) => c.crew_id)).toEqual(["EV1", "EV2"]);
    expect(asked.now_utc).toBe(T_ALERT);
  });

  it("a crew member on the alert who is already sheltered gets no options", () => {
    const sheltered = apply(alerted, "CREW_SHELTERED", { crew_id: "EV2", haven_kind: "vehicle", dose_event_ugy: 0, dose_event_unsheltered_ugy: 0 });
    const r = contingencyTick(sheltered, tctx(sheltered));
    const { options } = dataOf(r.events, "OPTIONS_PROPOSED");
    expect(options.every((o) => o.crew_ids.length === 1 && o.crew_ids[0] === "EV1")).toBe(true);
    expect((calls[0] as ContingencyInputs).crew.map((c) => c.crew_id)).toEqual(["EV1"]);
  });

  it("the options are logged in rank order, ranks 1..n, by expected dose then ETA", () => {
    const { options } = dataOf(contingencyTick(alerted, tctx(alerted)).events, "OPTIONS_PROPOSED");
    expect(options.map((o) => o.rank)).toEqual(options.map((_, i) => i + 1));
    for (let i = 1; i < options.length; i++) {
      const [a, b] = [options[i - 1], options[i]];
      expect(a.expected_dose_ugy < b.expected_dose_ugy || (a.expected_dose_ugy === b.expected_dose_ugy && a.eta_shelter_min <= b.eta_shelter_min)).toBe(true);
    }
    expect(options).toEqual(standIn({ alert_id: ALERT_ID, crew: alerted.crew }));
  });

  it("reduces to the alert's options in the state (OPTIONS_PROPOSED then reduce)", () => {
    const r = contingencyTick(alerted, tctx(alerted));
    expect(applyAll(r.state, r.events).options.map((o) => o.option_id)).toEqual(proposed.options.map((o) => o.option_id));
  });

  it("returns the event and leaves the state's options as they were (tick.ts state rule)", () => {
    const r = contingencyTick(alerted, tctx(alerted));
    expect(r.state.options).toEqual(alerted.options);
    expect(r.deltas).toEqual([]);
  });

  it("gives no options for a caution (only a new warning is answered)", () => {
    const caution = apply(running, "ALERT_RAISED", { alert_id: "a-9", code: "BUDDY_SEPARATION", level: "caution", subjects: ["EV1", "EV2"], message: "Buddy too far — close up" });
    expect(contingencyTick(caution, tctx(caution)).events).toEqual([]);
  });

  it("gives no events when there is no alert", () => {
    expect(contingencyTick(atStop1, tctx(atStop1)).events).toEqual([]);
  });

  it("does not propose again while the alert's options stand", () => {
    expect(contingencyTick(proposed, tctx(proposed)).events).toEqual([]);
  });

  it("does not propose again after an option was executed and the crew are on the way to a haven", () => {
    const executed = applyAll(proposed, handleCommand(proposed, cmd("ops", "APPROVE_OPTION", { option_id: abortOpt.option_id }), cctx(proposed)).events);
    expect(executed.options).toEqual([]);
    expect(contingencyTick(executed, tctx(executed)).events).toEqual([]);
  });

  it("is deterministic: the same state and context give the same events (NFR-06)", () => {
    expect(contingencyTick(alerted, tctx(alerted)).events).toEqual(contingencyTick(alerted, tctx(alerted)).events);
  });
});

// ---- APPROVE_OPTION -----------------------------------------------------------------------------------------

describe.skipIf(PENDING)("APPROVE_OPTION (02 §D.15, 03 §E.5; FR-44)", () => {
  it("ops approving the rendezvous option logs VEHICLE_DISPATCHED, then PLAN_REVISED with the next plan_revision, the dropped stops, the waypoints and the legs", () => {
    const command = cmd("ops", "APPROVE_OPTION", { option_id: rendezvousOpt.option_id });
    const out = handleCommand(proposed, command, cctx(proposed));
    expect(out.result).toMatchObject({ ok: true, command_id: command.command_id, event_seq: proposed.session.last_seq + 1 });
    expect(out.events.map((e) => e.kind)).toEqual(["VEHICLE_DISPATCHED", "PLAN_REVISED"]);
    for (const e of out.events) {
      expect(e).toMatchObject({ actor: "ops", sim_time: T_ALERT, command_ref: { client_id: "c-1", command_id: command.command_id } });
    }
    expect(dataOf(out.events, "VEHICLE_DISPATCHED")).toEqual({ vehicle_id: PR_ID, option_id: rendezvousOpt.option_id, rendezvous: rendezvousOpt.rendezvous });
    const revised = dataOf(out.events, "PLAN_REVISED");
    expect(revised).toMatchObject({ plan_revision: proposed.session.plan_revision + 1, option_id: rendezvousOpt.option_id, stops_dropped: rendezvousOpt.stops_dropped });
    expect(revised.stops_dropped).toEqual([2]);
    expect(revised.waypoints).toEqual(without(rendezvousOpt.stops_dropped));
    expect(revised.waypoints.map((w) => w.id)).toEqual(["wp-0", "wp-1"]);
    expect(revised.legs).toHaveLength(2);
    expect(revised.legs[0]).toEqual(legs[0]); // the kept leg wp-0 → wp-1
    expect(revised.legs[1]).toMatchObject({ from: "wp-1", to: "wp-0", status: "OK", geometry: rendezvousOpt.path_preview });
  });

  it("approving the abort option logs PLAN_REVISED alone, with the same dropped stops and the way home as the new leg", () => {
    const out = handleCommand(proposed, cmd("ops", "APPROVE_OPTION", { option_id: abortOpt.option_id }), cctx(proposed));
    expect(out.result.ok).toBe(true);
    expect(out.events.map((e) => e.kind)).toEqual(["PLAN_REVISED"]);
    const revised = dataOf(out.events, "PLAN_REVISED");
    expect(revised).toMatchObject({ plan_revision: 2, option_id: abortOpt.option_id, stops_dropped: abortOpt.stops_dropped });
    expect(revised.waypoints).toEqual(without(abortOpt.stops_dropped));
    expect(revised.legs.map((l) => [l.from, l.to])).toEqual([
      ["wp-0", "wp-1"],
      ["wp-1", "wp-0"],
    ]);
    expect(revised.legs[1]).toMatchObject({ status: "OK", geometry: abortOpt.path_preview });
  });

  it("the revision reduces to the new plan, the next plan_revision, no options, and the option's crew TO_HAVEN with the rover dispatched", () => {
    const out = handleCommand(proposed, cmd("ops", "APPROVE_OPTION", { option_id: rendezvousOpt.option_id }), cctx(proposed));
    const after = applyAll(proposed, out.events);
    expect(after.session.plan_revision).toBe(2);
    expect(after.plan!.waypoints).toEqual(without(rendezvousOpt.stops_dropped));
    expect(after.plan!.result.legs.map((l) => [l.from, l.to])).toEqual([
      ["wp-0", "wp-1"],
      ["wp-1", "wp-0"],
    ]);
    expect(after.options).toEqual([]);
    expect(after.crew.map((c) => c.activity)).toEqual(["TO_HAVEN", "TO_HAVEN"]);
    expect(after.vehicles.find((v) => v.vehicle_id === PR_ID)).toMatchObject({ state: "DISPATCHED", task: { kind: "SUMMON", crew_ids: ["EV1", "EV2"] } });
  });

  it("an option_id that was never proposed is INVALID and changes nothing", () => {
    const out = handleCommand(proposed, cmd("ops", "APPROVE_OPTION", { option_id: "o-nope" }), cctx(proposed));
    expect(rejected(out.result)).toBe("INVALID");
    expect(out.events.map((e) => e.kind)).toEqual(["COMMAND_REJECTED"]);
    expect(applyAll(proposed, out.events).options).toEqual(proposed.options);
  });

  it("approving without an option_id is INVALID", () => {
    expect(rejected(handleCommand(proposed, cmd("ops", "APPROVE_OPTION", {}), cctx(proposed)).result)).toBe("INVALID");
  });

  it("approving a stale option is INVALID: its alert's options were already executed", () => {
    const executed = applyAll(proposed, handleCommand(proposed, cmd("ops", "APPROVE_OPTION", { option_id: rendezvousOpt.option_id }), cctx(proposed)).events);
    expect(rejected(handleCommand(executed, cmd("ops", "APPROVE_OPTION", { option_id: abortOpt.option_id }), cctx(executed)).result)).toBe("INVALID");
    expect(rejected(handleCommand(executed, cmd("ops", "APPROVE_OPTION", { option_id: rendezvousOpt.option_id }), cctx(executed)).result)).toBe("INVALID");
  });

  it("approving a stale option is INVALID: its alert has been cleared", () => {
    const cleared = apply(proposed, "ALERT_CLEARED", { alert_id: ALERT_ID });
    expect(cleared.options.length).toBeGreaterThan(0); // the reducer keeps them; the handler must refuse
    expect(rejected(handleCommand(cleared, cmd("ops", "APPROVE_OPTION", { option_id: abortOpt.option_id }), cctx(cleared)).result)).toBe("INVALID");
  });
});

// ---- ABORT --------------------------------------------------------------------------------------------------

describe.skipIf(PENDING)("ABORT (02 §D.15, §E.4; FR-44)", () => {
  it("an EVA role aborting for itself logs the abort-to-haven revision: the ABORT_TO_HAB option's PLAN_REVISED, no vehicle", () => {
    const command = cmd("eva:EV1", "ABORT", { crew: ["EV1"] });
    const out = handleCommand(proposed, command, cctx(proposed));
    expect(out.result).toMatchObject({ ok: true, event_seq: proposed.session.last_seq + 1 });
    expect(out.events.map((e) => e.kind)).toEqual(["PLAN_REVISED"]);
    expect(out.events[0]).toMatchObject({ actor: "eva:EV1", sim_time: T_ALERT, command_ref: { client_id: "c-1", command_id: command.command_id } });
    const revised = dataOf(out.events, "PLAN_REVISED");
    expect(revised).toMatchObject({ plan_revision: 2, option_id: abortOpt.option_id, stops_dropped: abortOpt.stops_dropped });
    expect(revised.waypoints).toEqual(without(abortOpt.stops_dropped));
    expect(revised.legs[0]).toEqual(legs[0]);
    expect(revised.legs[1]).toMatchObject({ from: "wp-1", to: "wp-0", status: "OK", geometry: abortOpt.path_preview });
  });

  it("the abort sends the option's whole crew TO_HAVEN and clears the alert's options; the rover stays parked", () => {
    const out = handleCommand(proposed, cmd("eva:EV1", "ABORT", { crew: ["EV1"] }), cctx(proposed));
    const after = applyAll(proposed, out.events);
    expect(after.crew.map((c) => c.activity)).toEqual(["TO_HAVEN", "TO_HAVEN"]);
    expect(after.options).toEqual([]);
    expect(after.session.plan_revision).toBe(2);
    expect(after.vehicles.find((v) => v.vehicle_id === PR_ID)!.state).toBe("PARKED");
  });

  it("ops may abort for any crew", () => {
    const out = handleCommand(proposed, cmd("ops", "ABORT", { crew: ["EV1", "EV2"] }), cctx(proposed));
    expect(out.result.ok).toBe(true);
    expect(out.events.map((e) => e.kind)).toEqual(["PLAN_REVISED"]);
    expect(out.events[0].actor).toBe("ops");
    expect(dataOf(out.events, "PLAN_REVISED").option_id).toBe(abortOpt.option_id);
  });

  it("an EVA role aborting for a crew list without itself is FORBIDDEN_ROLE", () => {
    expect(rejected(handleCommand(proposed, cmd("eva:EV1", "ABORT", { crew: ["EV2"] }), cctx(proposed)).result)).toBe("FORBIDDEN_ROLE");
  });

  it("ABORT without a crew list, or for an unknown crew id, is INVALID", () => {
    expect(rejected(handleCommand(proposed, cmd("ops", "ABORT", {}), cctx(proposed)).result)).toBe("INVALID");
    expect(rejected(handleCommand(proposed, cmd("ops", "ABORT", { crew: [] }), cctx(proposed)).result)).toBe("INVALID");
    expect(rejected(handleCommand(proposed, cmd("ops", "ABORT", { crew: ["EV9"] }), cctx(proposed)).result)).toBe("INVALID");
  });

  it("approving an option after an abort is INVALID (the abort made the alert's options stale)", () => {
    const aborted = applyAll(proposed, handleCommand(proposed, cmd("eva:EV1", "ABORT", { crew: ["EV1"] }), cctx(proposed)).events);
    expect(rejected(handleCommand(aborted, cmd("ops", "APPROVE_OPTION", { option_id: rendezvousOpt.option_id }), cctx(aborted)).result)).toBe("INVALID");
  });

  // TODO(decision): no alert means no option to execute, and the reducer sends crew TO_HAVEN only via an option.
  it.todo("ABORT with no active alert (no ABORT_TO_HAB option) revises the plan and sends the crew to the hab");
});
