/**
 * T23.04: summon, rendezvous dispatch, vehicle motion and sheltering (docs/specs/02 §D.9, §D.10,
 * §D.14; 03 §E.5, §E.9; 05 Vehicle, LogEvent `data` by kind; FR-40, NFR-06). TASK-23.
 * Written before the code: these fail against the T22.01 stubs in `engine/vehicles.ts`, which
 * throw "not implemented", and pass once T23.05 is done. Runs on the fake scenario (F8, T22.02).
 *
 * Compute is a stub (TASK-05b): `crewTimeField`, `vehicleTimeField` and `rendezvous` throw. This
 * file replaces those three with stand-ins built from the fixture's declared shape (README "Value
 * sources"): a straight line on y = 0 sampled every STAND_IN_CELL_M, crew speed =
 * `suited_flat_speed_kmh` of the plan scenario, vehicle speed = `flat_speed_kmh` of the
 * pressurized-rover ParamSet, no slope. The stand-in `rendezvous` applies the 02 §D.10 rule
 * (argmin of max(T_crew, T_vehicle); tie-break min T_crew, then cell index) on those 1-D fields.
 * Every expected value below comes from the fixture or from the stand-in; nothing is typed in as a
 * science number. The engine part under test is the plumbing: which command becomes which event,
 * the event fields, how the vehicle moves, and when arrival and sheltering are logged.
 * The fake scenario has no site grid (`grid` is null), so the tests pass an opaque stand-in grid;
 * the mocked compute never looks inside it.
 *
 * Rules these tests fix for T23.05 (proposed 2026-11-07 by this test file where 02, 03 and 05 are
 * silent). Each is marked TODO(decision) until the team confirms it:
 * - TODO(decision) Compute calls: `handleSummon` builds the crew and vehicle time fields with
 *   `crewTimeField` and `vehicleTimeField` from the crew member's and the vehicle's positions and
 *   calls `rendezvous` (02 §D.10); it does no routing of its own.
 * - TODO(decision) Vehicle choice: the summoned vehicle is the scenario's `pressurized_rover`
 *   (PR1 in the fixture); the command names no vehicle. If it is not PARKED the result is BUSY,
 *   checked before any compute call.
 * - TODO(decision) Event data: bare summon logs `{vehicle_id, rendezvous}` with no `option_id`;
 *   with `args.option_id` the data adds it, and the reducer takes the option's crew for the SUMMON
 *   task. The event has no crew field, so a bare summon leaves `task.crew_ids` unset and only the
 *   option path is covered below. Provenance `{"data.rendezvous": "modelled"}` (05 §F.6).
 *   `eta_crew_s` and `eta_vehicle_s` may be rounded to whole seconds (05 Vehicle `eta_s` is an
 *   int); the tests accept ±0.5 s.
 * - TODO(decision) Single crew only: `args.crew` of two uses the 02 §D.10 visiting order
 *   (`rendezvousPair`); that case is an it.todo.
 * - TODO(decision) The event has no path, so `vehiclesTick` computes it on the first tick after
 *   the dispatch (03 §E.9 "path computed"): it calls `rendezvous` from the vehicle's position and
 *   the crew's current position, sets `state` EN_ROUTE and `path` (ending at the rendezvous point)
 *   directly in the state it returns, and logs nothing, because no LogEvent kind exists for it.
 *   The tests keep the crew still while the vehicle drives, so the path ends at the logged point.
 * - TODO(decision) Motion: each tick moves the vehicle `speed × dt_s` along its path (ParamSet
 *   `flat_speed_kmh`; the stand-in has no slope); the first tick may move it or only compute the
 *   path. The tick that would pass the end clamps to the rendezvous point and returns one
 *   VEHICLE_ARRIVED `{vehicle_id, x_m, y_m}` (actor `system`), so arrival is on tick
 *   ceil(eta_vehicle_s / dt_s), or the tick after if the first only computed the path. The module
 *   does not apply the event itself (tick.ts state rule); the reducer sets ARRIVED.
 * - TODO(decision) Sheltering: vehiclesTick returns one CREW_SHELTERED per crew member named in
 *   the SUMMON task's `crew_ids`, on the first tick where the vehicle is ARRIVED (already reduced,
 *   so on a later tick than VEHICLE_ARRIVED) and that crew member is at the vehicle (distance
 *   ≤ SHELTER_REACH_M, standing for "same point"; tick.ts clamps crew motion to the target).
 *   Data `{crew_id, haven_kind: "vehicle", dose_event_ugy, dose_event_unsheltered_ugy}` copies the
 *   two dose values from the crew state (tick.ts accumulates them; compute owns the integral).
 *   The PR1 `ingress_min` delay (02 §D.8) is not applied here. Crew who are not yet there, or who
 *   wait at the point before the vehicle arrives, are not sheltered.
 * - Cancelling a summon and the return to the hab (03 §E.9 Returning, Parked) are not in T23.04's
 *   steps; they are it.todo below.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { Command, CommandResult, ContingencyOption, CrewId, LogEvent, LogEventData, LogEventKind, Role } from "@marswalk/protocol";
import type { LoadedGrid } from "@marswalk/compute";
import { AcceptedCommands, handleCommand, type CommandContext } from "../src/commands";
import { handleSummon, vehiclesTick } from "../src/engine/vehicles";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import type { TickContext } from "../src/engine/tick";
import { readScenario, type LoadedScenario } from "../src/scenario";

/** Stand-in compute (see the header). Hoisted so the vi.mock factory can use it. */
const standIn = vi.hoisted(() => {
  /** Declared stand-in sampling of the fixture's straight line. */
  const STAND_IN_CELL_M = 10;
  interface LineField {
    cell_m: number;
    width: number;
    height: number;
    seconds: Float64Array;
    from_x_m: number;
    speed_ms: number;
  }
  const s = {
    CELL_M: STAND_IN_CELL_M,
    /** Set from the fixture plan once it is loaded: the largest waypoint x. */
    extent_m: 0,
    /** "none" makes `rendezvous` find no candidate (02 §D.10 NO_RENDEZVOUS). */
    mode: "ok" as "ok" | "none",
    rendezvousCalls: 0,
    field(from_x_m: number, speed_ms: number, limit_s: number): LineField {
      const width = Math.round(s.extent_m / STAND_IN_CELL_M) + 1;
      const seconds = new Float64Array(width);
      for (let i = 0; i < width; i++) {
        const t = Math.abs(i * STAND_IN_CELL_M - from_x_m) / speed_ms;
        seconds[i] = t <= limit_s ? t : Infinity;
      }
      return { cell_m: STAND_IN_CELL_M, width, height: 1, seconds, from_x_m, speed_ms };
    },
    crewTimeField(_grid: unknown, from: { x_m: number }, scenario: { suited_flat_speed_kmh: number }, limit_s: number): LineField {
      return s.field(from.x_m, scenario.suited_flat_speed_kmh / 3.6, limit_s);
    },
    vehicleTimeField(_grid: unknown, from: { x_m: number }, params: { values: Record<string, number | boolean> }): LineField {
      return s.field(from.x_m, (params.values.flat_speed_kmh as number) / 3.6, Infinity);
    },
    /** 02 §D.10 on the 1-D fields: argmin max(T_c, T_v), tie-break min T_c, then cell index. */
    solve(crew: LineField, vehicle: LineField) {
      let best = -1;
      for (let i = 0; i < crew.width; i++) {
        const tc = crew.seconds[i];
        const tv = vehicle.seconds[i];
        if (!Number.isFinite(tc) || !Number.isFinite(tv)) continue;
        if (best < 0) {
          best = i;
          continue;
        }
        const m = Math.max(tc, tv);
        const bm = Math.max(crew.seconds[best], vehicle.seconds[best]);
        if (m < bm || (m === bm && tc < crew.seconds[best])) best = i;
      }
      if (best < 0) return null;
      const x_m = best * STAND_IN_CELL_M;
      return {
        status: "OK" as const,
        x_m,
        y_m: 0,
        eta_crew_s: crew.seconds[best],
        eta_vehicle_s: vehicle.seconds[best],
        crew_path: [[crew.from_x_m, 0], [x_m, 0]] as [number, number][],
        vehicle_path: [[vehicle.from_x_m, 0], [x_m, 0]] as [number, number][],
      };
    },
    rendezvous(crew: LineField, vehicle: LineField, _passable: Uint8Array) {
      s.rendezvousCalls++;
      return (s.mode === "ok" && s.solve(crew, vehicle)) || { status: "NO_RENDEZVOUS" as const };
    },
  };
  return s;
});

vi.mock("@marswalk/compute", async () => {
  const actual = await vi.importActual<typeof import("@marswalk/compute")>("@marswalk/compute");
  return {
    ...actual,
    crewTimeField: standIn.crewTimeField,
    vehicleTimeField: standIn.vehicleTimeField,
    rendezvous: standIn.rendezvous,
  };
});

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const T0 = fake.scenario.start_utc;
const T0_MS = Date.parse(T0);
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

const waypoints = fake.scenario.plan.waypoints;
standIn.extent_m = Math.max(...waypoints.map((w) => w.x_m));
const stop1 = waypoints.find((w) => w.id === "wp-1")!;
const pr1Params = Object.values(fake.params).find((p) => p.kind === "pressurized_rover")!;
const PR1 = fake.scenario.vehicles.find((v) => v.kind === "pressurized_rover")!;
const VEHICLE_MS = (pr1Params.values.flat_speed_kmh as number) / 3.6;
const DT_S = 1;
/** Crew count as "at the vehicle" within this distance (header, Sheltering). */
const SHELTER_REACH_M = 1;

/** The fixture has no site grid; the mocked compute ignores this opaque stand-in. */
const W = Math.round(standIn.extent_m / standIn.CELL_M) + 1;
const standInGrid = {
  meta: { cell_m: standIn.CELL_M, width: W, height: 1, origin_m: [0, 0], row_order: "north_up" },
  elevation: new Float32Array(W),
  slopeP90: new Uint8Array(W),
  slopeMax: new Uint8Array(W),
  flags: new Uint8Array(W),
  commHab: new Uint8Array(W),
} as unknown as LoadedGrid;
const scenario: LoadedScenario = { ...fake, grid: standInGrid };

let n = 0;
function cmd(role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command {
  return { command_id: `k-${++n}`, role, kind, args };
}

const ctxFor = (state: EngineState, client_id = "c-1"): CommandContext => ({ scenario, client_id, next_seq: state.session.last_seq + 1, accepted: new AcceptedCommands() });
const tickCtx = (state: EngineState): TickContext => ({ scenario, dt_s: DT_S, next_seq: state.session.last_seq + 1 });

function at(state: EngineState, ms: number): EngineState {
  return { ...state, session: { ...state.session, clock: { ...state.session.clock, sim_time: iso(ms) } } };
}

/** Reduce a module's or command's events the way the session does (seqs from last_seq + 1). */
function applyEvents(state: EngineState, events: PendingEvent[]): EngineState {
  return events.reduce((s, e) => reduce(s, logged(e, s.session.last_seq + 1)), state);
}

function apply(state: EngineState, kind: LogEventKind, data: LogEventData[LogEventKind], actor: Role | "system" = "system"): EngineState {
  const event: LogEvent = { seq: state.session.last_seq + 1, sim_time: state.session.clock.sim_time, kind, actor, data: data as Record<string, unknown>, provenance: {}, command_ref: null };
  return reduce(state, event);
}

const withCrew = (s: EngineState, id: CrewId, patch: Partial<EngineState["crew"][number]>): EngineState => ({
  ...s,
  crew: s.crew.map((c) => (c.crew_id === id ? { ...c, ...patch } : c)),
});

/** EVA running, EV1 at the first stop (so the crew and the vehicle at the hab are apart), option o1 proposed for EV1. */
const OPTION: ContingencyOption = {
  option_id: "o1",
  alert_id: "a-2",
  kind: "VEHICLE_RENDEZVOUS",
  crew_ids: ["EV1"],
  // Unused by summon: the dispatch computes its own rendezvous (placeholders).
  eta_shelter_min: 0,
  expected_dose_ugy: 0,
  stops_dropped: [],
  violations: [],
  rank: 1,
  path_preview: [],
  rendezvous: null,
};
function onEva(): EngineState {
  let s = initialState(scenario, "s-0001");
  s = apply(s, "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops");
  s = withCrew(s, "EV1", { x_m: stop1.x_m, y_m: stop1.y_m, activity: "AT_STOP", stop_index: 1 });
  return apply(s, "OPTIONS_PROPOSED", { alert_id: OPTION.alert_id, options: [OPTION] });
}

const pr1 = (s: EngineState) => s.vehicles.find((v) => v.vehicle_id === PR1.vehicle_id)!;

/** The ETAs may be rounded to whole seconds (header); accept ±0.5 s. */
const expectEta = (actual: number, expected: number): void => {
  expect(Math.abs(actual - expected), `eta ${actual} vs ${expected}`).toBeLessThanOrEqual(0.5);
};

/** What the stand-in rendezvous gives for EV1 at `crew_x_m` and PR1 at its start. */
function expectedRendezvous(crew_x_m: number, vehicle_x_m: number) {
  const r = standIn.solve(
    standIn.crewTimeField(null, { x_m: crew_x_m }, fake.scenario.plan.scenario, Infinity),
    standIn.vehicleTimeField(null, { x_m: vehicle_x_m }, pr1Params),
  );
  if (!r) throw new Error("fixture has no stand-in rendezvous");
  return r;
}

const SUMMON_ARGS = { crew: ["EV1"], option_id: OPTION.option_id };

/** Summon through handleCommand; returns the handled command and the state with its events reduced. */
function summon(state: EngineState, args: Record<string, unknown> = SUMMON_ARGS, role: Role = "eva:EV1") {
  const command = cmd(role, "SUMMON_VEHICLE", args);
  const ctx = ctxFor(state);
  const handled = handleCommand(state, command, ctx);
  return { command, ctx, handled, state: applyEvents(state, handled.events) };
}

interface Step {
  /** 1-based tick number. */
  k: number;
  x_m: number;
  y_m: number;
  vehicle: string;
  events: PendingEvent[];
}

/** Run vehiclesTick `ticks` times at 1 s sim steps from T0, applying its events after each tick. */
function drive(start: EngineState, ticks: number): { state: EngineState; steps: Step[] } {
  let state = start;
  const steps: Step[] = [];
  for (let k = 1; k <= ticks; k++) {
    const s = at(state, T0_MS + k * DT_S * 1000);
    const r = vehiclesTick(s, tickCtx(s));
    // A module returns events and does not apply them (tick.ts state rule).
    if (pr1(s).state !== "ARRIVED") expect(pr1(r.state).state, "vehiclesTick must not apply VEHICLE_ARRIVED itself").not.toBe("ARRIVED");
    expect(r.state.crew.map((c) => c.activity), "vehiclesTick must not apply CREW_SHELTERED itself").toEqual(s.crew.map((c) => c.activity));
    state = applyEvents(r.state, r.events);
    const v = pr1(state);
    steps.push({ k, x_m: v.x_m, y_m: v.y_m, vehicle: v.state, events: r.events });
  }
  return { state, steps };
}

const kinds = (events: PendingEvent[]): string[] => events.map((e) => e.kind);


/**
 * Red until T23.05: while the module is still the T22.01 stub (it throws "not implemented"), these
 * suites are skipped so `make test` stays green on main; they run by themselves once T23.05 lands.
 * To see them fail now: `PENDING_RED=1 npm --workspace @marswalk/hab-core test -- summon`.
 */
const PENDING = (() => {
  if (process.env.PENDING_RED) return false;
  try {
    handleSummon(undefined as never, undefined as never, undefined as never);
    return false;
  } catch (err) {
    return /not implemented/.test(String(err));
  }
})();

describe.skipIf(PENDING)("SUMMON_VEHICLE → VEHICLE_DISPATCHED (02 §D.10; FR-40)", () => {
  it("logs VEHICLE_DISPATCHED with the rendezvous point and both ETAs", () => {
    const before = onEva();
    const callsBefore = standIn.rendezvousCalls;
    const { command, ctx, handled, state } = summon(before);
    const expected = expectedRendezvous(stop1.x_m, PR1.start_x_m);

    expect(handled.result).toEqual({ v: 1, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: ctx.next_seq });
    expect(handled.events).toHaveLength(1);
    const [event] = handled.events;
    expect(event).toMatchObject({
      kind: "VEHICLE_DISPATCHED",
      actor: "eva:EV1",
      sim_time: before.session.clock.sim_time,
      command_ref: { client_id: "c-1", command_id: command.command_id },
      provenance: { "data.rendezvous": "modelled" },
    });
    const data = event.data as LogEventData["VEHICLE_DISPATCHED"];
    expect(data.vehicle_id).toBe(PR1.vehicle_id);
    expect(data.rendezvous).toEqual({ x_m: expected.x_m, y_m: expected.y_m, eta_crew_s: expect.any(Number), eta_vehicle_s: expect.any(Number) });
    expectEta(data.rendezvous!.eta_crew_s, expected.eta_crew_s);
    expectEta(data.rendezvous!.eta_vehicle_s, expected.eta_vehicle_s);
    expect(standIn.rendezvousCalls, "the rendezvous comes from @marswalk/compute").toBeGreaterThan(callsBefore);

    // The reducer turns it into a dispatched vehicle heading for the point (03 §E.9 Parked → Dispatched).
    expect(pr1(before).state).toBe("PARKED");
    expect(pr1(state)).toMatchObject({ state: "DISPATCHED", task: { kind: "SUMMON", target: { x_m: expected.x_m, y_m: expected.y_m } } });
    expectEta(pr1(state).eta_s!, expected.eta_vehicle_s);
  });

  it("a summon from an option carries its option_id and the option's crew", () => {
    const { handled, state } = summon(onEva());
    expect((handled.events[0].data as LogEventData["VEHICLE_DISPATCHED"]).option_id).toBe(OPTION.option_id);
    expect(pr1(state).task?.crew_ids).toEqual(OPTION.crew_ids);
  });

  it("a bare summon (no option) logs only vehicle_id and rendezvous", () => {
    const { handled } = summon(onEva(), { crew: ["EV1"] });
    expect(Object.keys(handled.events[0].data).sort()).toEqual(["rendezvous", "vehicle_id"]);
  });
});

describe.skipIf(PENDING)("the vehicle follows its path (03 §E.9; 02 §D.9)", () => {
  it("goes EN_ROUTE on the first tick after the dispatch, with a path that ends at the rendezvous point", () => {
    const { state: dispatched } = summon(onEva());
    const target = pr1(dispatched).task!.target;
    const { state, steps } = drive(dispatched, 1);
    expect(steps[0].events.filter((e) => e.kind === "VEHICLE_ARRIVED")).toEqual([]);
    expect(pr1(state).state).toBe("EN_ROUTE");
    expect(pr1(state).path.length).toBeGreaterThan(0);
    expect(pr1(state).path.at(-1)).toEqual([target.x_m, target.y_m]);
  });

  it("moves at the ParamSet speed along the path, one dt_s step per tick, ETA falling", () => {
    const { state: dispatched } = summon(onEva());
    const target = pr1(dispatched).task!.target;
    const eta0 = pr1(dispatched).eta_s!;
    const arriveTick = Math.ceil(eta0 / DT_S);
    expect(arriveTick, "the stand-in rendezvous is far enough for a few ticks of motion").toBeGreaterThan(4);

    const { steps } = drive(dispatched, arriveTick - 1);
    const xs = [PR1.start_x_m, ...steps.map((s) => s.x_m)];
    for (const s of steps) {
      expect(s.y_m).toBe(PR1.start_y_m);
      expect(s.events, `tick ${s.k} is before the arrival`).toEqual([]);
      expect(s.x_m).toBeLessThan(target.x_m);
    }
    // The first tick may only compute the path; every later one moves speed × dt_s (tolerance for float sums).
    for (let k = 1; k < xs.length; k++) {
      const step = xs[k] - xs[k - 1];
      expect(step, `tick ${k} never moves backwards or faster than the ParamSet speed`).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThanOrEqual(VEHICLE_MS * DT_S + 1e-6);
      if (k >= 2) expect(step).toBeCloseTo(VEHICLE_MS * DT_S, 6);
    }
    const { state: mid } = drive(dispatched, 5);
    expect(Math.abs(pr1(mid).eta_s! - (eta0 - 5 * DT_S)), "eta_s falls with the remaining path").toBeLessThanOrEqual(DT_S + 1);
  });
});

describe.skipIf(PENDING)("VEHICLE_ARRIVED (03 §E.9 EnRoute → Arrived)", () => {
  it("logs one VEHICLE_ARRIVED at the rendezvous point when the path is covered, then stops", () => {
    const { state: dispatched } = summon(onEva());
    const target = pr1(dispatched).task!.target;
    const arriveTick = Math.ceil(pr1(dispatched).eta_s! / DT_S);
    const { state, steps } = drive(dispatched, arriveTick + 3);

    const arrived = steps.flatMap((s) => s.events.filter((e) => e.kind === "VEHICLE_ARRIVED").map((e) => ({ k: s.k, e })));
    expect(arrived).toHaveLength(1);
    expect(arrived[0].k, "first tick the path is covered, or the one after if tick 1 only computed the path").toBeGreaterThanOrEqual(arriveTick);
    expect(arrived[0].k).toBeLessThanOrEqual(arriveTick + 1);
    expect(arrived[0].e).toMatchObject({
      kind: "VEHICLE_ARRIVED",
      actor: "system",
      sim_time: iso(T0_MS + arrived[0].k * DT_S * 1000),
      data: { vehicle_id: PR1.vehicle_id, x_m: target.x_m, y_m: target.y_m },
    });
    expect(pr1(state)).toMatchObject({ state: "ARRIVED", x_m: target.x_m, y_m: target.y_m, eta_s: 0 });
    // No further motion or events once it is there.
    expect(steps.filter((s) => s.k > arrived[0].k).flatMap((s) => kinds(s.events))).toEqual([]);
  });
});

/** The state with PR1 ARRIVED at the rendezvous point (summon, then ticks), and that point. */
function arrivedState(): { state: EngineState; point: { x_m: number; y_m: number } } {
  const { state: dispatched } = summon(onEva());
  const point = pr1(dispatched).task!.target;
  const { state } = drive(dispatched, Math.ceil(pr1(dispatched).eta_s! / DT_S) + 1);
  expect(pr1(state).state, "set-up: the vehicle has arrived").toBe("ARRIVED");
  return { state, point };
}

describe.skipIf(PENDING)("CREW_SHELTERED (03 §E.5 step 9, §E.8; FR-37)", () => {
  // Opaque dose values taken from the fixture; they are copied through, never recomputed here.
  const dose = { dose_event_ugy: fake.dose.background_rate, dose_event_unsheltered_ugy: fake.dose.integral_check.computed_ugy };

  it("logs CREW_SHELTERED once when the crew reach the arrived vehicle, with the doses from the crew state", () => {
    const { state: arrived, point } = arrivedState();
    const reached = withCrew(arrived, "EV1", { x_m: point.x_m, y_m: point.y_m, activity: "TO_HAVEN", ...dose });
    const { state, steps } = drive(reached, 3);

    const sheltered = steps.flatMap((s) => s.events.filter((e) => e.kind === "CREW_SHELTERED"));
    expect(sheltered).toHaveLength(1);
    expect(sheltered[0]).toMatchObject({ actor: "system", data: { crew_id: "EV1", haven_kind: "vehicle", ...dose } });
    expect(Object.keys(sheltered[0].data).sort()).toEqual(["crew_id", "dose_event_ugy", "dose_event_unsheltered_ugy", "haven_kind"]);
    expect(state.crew.find((c) => c.crew_id === "EV1")).toMatchObject({ activity: "SHELTERED", haven: { kind: "vehicle" }, ...dose });
    // EV2 is not in the option and stays where it was.
    expect(state.crew.find((c) => c.crew_id === "EV2")!.activity).not.toBe("SHELTERED");
    // The vehicle is already ARRIVED, so it is logged on the first tick, and only then.
    expect(steps.map((s) => kinds(s.events))).toEqual([["CREW_SHELTERED"], [], []]);
  });

  it("does not shelter crew who have not reached the vehicle yet", () => {
    const { state: arrived, point } = arrivedState();
    const away = withCrew(arrived, "EV1", { x_m: point.x_m - 10 * standIn.CELL_M, y_m: point.y_m, activity: "TO_HAVEN", ...dose });
    expect(10 * standIn.CELL_M).toBeGreaterThan(SHELTER_REACH_M);
    const { state, steps } = drive(away, 5);
    expect(steps.flatMap((s) => kinds(s.events))).toEqual([]);
    expect(state.crew.find((c) => c.crew_id === "EV1")!.activity).toBe("TO_HAVEN");
  });

  it("does not shelter crew waiting at the point before the vehicle arrives; arrival comes first", () => {
    const { state: dispatched } = summon(onEva());
    const point = pr1(dispatched).task!.target;
    const waiting = withCrew(dispatched, "EV1", { x_m: point.x_m, y_m: point.y_m, activity: "TO_HAVEN", ...dose });
    const arriveTick = Math.ceil(pr1(dispatched).eta_s! / DT_S);
    const { steps } = drive(waiting, arriveTick + 3);
    const order = steps.flatMap((s) => s.events.map((e) => ({ k: s.k, kind: e.kind })));
    expect(order.map((o) => o.kind)).toEqual(["VEHICLE_ARRIVED", "CREW_SHELTERED"]);
    expect(order[1].k, "sheltering is logged on a later tick than the arrival").toBeGreaterThan(order[0].k);
  });

  it.todo("two crew in one summon: the vehicle visits them in the order that minimises the later arrival (02 §D.10 rendezvousPair)");
  it.todo("the PR1 ingress_min delay (02 §D.8) before CREW_SHELTERED, once the team decides it applies");
  it.todo("a cancelled summon returns PR1 from EN_ROUTE to PARKED (03 §E.9)");
  it.todo("with the crew aboard PR1 returns to the hab: RETURNING, then PARKED, and the crew are IN_HAB (03 §E.8, §E.9)");
});

describe.skipIf(PENDING)("rejections: NO_RENDEZVOUS and BUSY (02 §D.10, §E.6)", () => {
  it("returns NO_RENDEZVOUS when no cell is reachable by both, and changes nothing", () => {
    const before = onEva();
    standIn.mode = "none";
    try {
      const command = cmd("eva:EV1", "SUMMON_VEHICLE", SUMMON_ARGS);
      // The handler itself logs nothing and answers NO_RENDEZVOUS.
      const direct = handleSummon(before, scenario, command);
      expect(direct.result).toMatchObject({ type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code: "NO_RENDEZVOUS" });
      expect(direct.events).toEqual([]);

      // Through handleCommand the rejection is logged as COMMAND_REJECTED only (05 Command); no vehicle event.
      const handled = handleCommand(before, cmd("eva:EV1", "SUMMON_VEHICLE", SUMMON_ARGS), ctxFor(before));
      const result = handled.result as Extract<CommandResult, { ok: false }>;
      expect(result.ok).toBe(false);
      expect(result.code).toBe("NO_RENDEZVOUS");
      expect(handled.events).toHaveLength(1);
      expect(handled.events[0]).toMatchObject({ kind: "COMMAND_REJECTED", actor: "eva:EV1", data: { code: "NO_RENDEZVOUS" } });

      const after = applyEvents(before, handled.events);
      expect(pr1(after).state).toBe("PARKED");
      expect(after.options).toEqual(before.options);
      expect(after.alerts).toEqual(before.alerts);
      expect(after.plan).toEqual(before.plan);
      expect(after.crew).toEqual(before.crew);
      expect(after.vehicles).toEqual(before.vehicles);
    } finally {
      standIn.mode = "ok";
    }
  });

  it("returns BUSY for a second summon while the vehicle is dispatched or en route, and changes nothing", () => {
    const { state: dispatched } = summon(onEva());
    const { state: enRoute } = drive(dispatched, 3);
    expect(pr1(enRoute).state, "set-up: PR1 is on its way").toBe("EN_ROUTE");

    for (const state of [dispatched, enRoute]) {
      const callsBefore = standIn.rendezvousCalls;
      const command = cmd("ops", "SUMMON_VEHICLE", { crew: ["EV1"] });
      const direct = handleSummon(state, scenario, command);
      expect(direct.result).toMatchObject({ type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code: "BUSY" });
      expect(direct.events).toEqual([]);
      expect(standIn.rendezvousCalls, "BUSY is decided before any compute call").toBe(callsBefore);

      const handled = handleCommand(state, cmd("ops", "SUMMON_VEHICLE", { crew: ["EV1"] }), ctxFor(state));
      expect((handled.result as Extract<CommandResult, { ok: false }>).code).toBe("BUSY");
      expect(handled.events).toHaveLength(1);
      expect(handled.events[0]).toMatchObject({ kind: "COMMAND_REJECTED", actor: "ops", data: { code: "BUSY" } });
      const after = applyEvents(state, handled.events);
      expect(after.vehicles).toEqual(state.vehicles);
      expect(after.crew).toEqual(state.crew);
    }
  });
});
