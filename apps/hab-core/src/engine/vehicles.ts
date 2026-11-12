/**
 * Summon, rendezvous dispatch and vehicle motion (docs/specs/02 §D.9–§D.10; FR-40).
 * Owner T23.05 (TASK-23). Pure; sim time only, never wall-clock (NFR-06). No science here: every
 * time and path comes from @marswalk/compute.
 *
 * Exports:
 * - `handleSummon`: SUMMON_VEHICLE → `dispatchVehicle` → VEHICLE_DISPATCHED.
 * - `dispatchVehicle`: the shared dispatch helper; T23.07 (APPROVE_OPTION VEHICLE_RENDEZVOUS) reuses it.
 * - `vehiclesTick`: the pressurized rover's DISPATCHED → EN_ROUTE → ARRIVED motion and sheltering.
 * - `moveAlongPath`: the motion helper TASK-29 reuses for the utility rover (T29.03).
 *
 * Rules (Proposed 2026-11-08 — TODO(decision); listed in TASK-23 under T23.05):
 * - The crew field is bounded at L = `max_haven_min` × 60 s (02 §D.10 "limit L"; 02 §D.8 "the haven rule").
 * - The logged ETAs are whole seconds (Math.round; 05 Vehicle `eta_s` is an int).
 * - The path is not in VEHICLE_DISPATCHED (05 has no field for it), so on the first tick after the
 *   dispatch `vehiclesTick` re-derives it from logged state only: the vehicle's own position (it has
 *   not moved since it was PARKED) and the logged target. It never looks at where the crew are now.
 * - Motion: constant speed = remaining path length ÷ `eta_s`, so the vehicle arrives on tick `eta_s`;
 *   `eta_s` counts down as an integer. No path ⇒ no motion.
 */
import {
  crewTimeField,
  rendezvous,
  rendezvousPair,
  vehiclePassable,
  vehicleTimeField,
  type RendezvousOk,
} from "@marswalk/compute";
import {
  PROTOCOL_VERSION,
  type Command,
  type CommandResult,
  type LogEvent,
  type LogEventData,
  type ParamSet,
  type RejectCode,
  type Vehicle,
} from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { CommandOutcome, EngineState, PendingEvent, StateChange } from "./reducer";
import type { TickContext, TickResult } from "./tick";

/**
 * A crew member counts as "at the vehicle" within this distance (metres). TODO(decision): the value
 * is the T23.04 test header's proposal (summon.test.ts, "Sheltering"), standing for "same point".
 */
export const SHELTER_REACH_M = 1;

/** 02 §D.10 "two crew": at most two crew members per summon. */
const MAX_SUMMON_CREW = 2;

/** What `dispatchVehicle` needs besides the state and the scenario. */
export interface DispatchRequest {
  /** One or two distinct, known crew ids (02 §D.10). */
  crew_ids: readonly string[];
  /** Copied into VEHICLE_DISPATCHED when given; must name a proposed option with the same crew. */
  option_id?: string;
  /** The event's actor: the issuing role, or "system". */
  actor: LogEvent["actor"];
  /**
   * A rendezvous already computed by compute (T23.07: the approved option's own point, which its crew
   * route leads to). When given, the compute call is skipped and the point is logged verbatim, after
   * the same INVALID / BUSY / ParamSet checks; non-finite or negative numbers are INVALID. The reducer
   * rounds `eta_s` up to whole seconds. Added by the T23.07 rework, Proposed 2026-11-08.
   */
  rendezvous?: NonNullable<LogEventData["VEHICLE_DISPATCHED"]["rendezvous"]>;
}

/** `dispatchVehicle` result: the VEHICLE_DISPATCHED event (no `command_ref`), or a rejection. */
export type DispatchOutcome =
  | { ok: true; events: PendingEvent[] }
  | { ok: false; code: RejectCode; message: string };

const reject = (code: RejectCode, message: string): DispatchOutcome => ({ ok: false, code, message });

/** The rover ParamSet named by the vehicle itself (05 Vehicle `param_set`), or a reason it is unusable. */
function ownParams(scenario: LoadedScenario, vehicle: Vehicle): ParamSet | string {
  const params = scenario.params[vehicle.param_set];
  if (!params) return `ParamSet ${vehicle.param_set} of ${vehicle.vehicle_id} is not loaded`;
  if (params.kind !== vehicle.kind) return `ParamSet ${vehicle.param_set} is for ${params.kind}, not ${vehicle.kind}`;
  const speed = params.values.flat_speed_kmh;
  if (typeof speed !== "number" || !Number.isFinite(speed) || speed <= 0) {
    return `ParamSet ${vehicle.param_set} needs flat_speed_kmh > 0, got ${String(speed)}`;
  }
  return params;
}

/**
 * Dispatch the scenario's pressurized rover to the crew (02 §D.10). Shared by `handleSummon` and by
 * T23.07's APPROVE_OPTION for a VEHICLE_RENDEZVOUS option. Checks, in order: INVALID (no pressurized
 * rover; crew ids not 1–2 distinct known ids; a crew member already SHELTERED or IN_HAB;
 * unknown option, or crew that differ from the option's),
 * BUSY (the rover is not PARKED; before any compute call), INVALID (the rover's own ParamSet is
 * missing, of the wrong kind or has no positive `flat_speed_kmh`), then either the precomputed
 * `req.rendezvous` (INVALID if not finite or negative; no compute call, no grid needed) or
 * NO_RENDEZVOUS (no grid, or no candidate for any of the crew within L). Never changes state; returns one VEHICLE_DISPATCHED
 * `{vehicle_id, rendezvous, option_id?}` with provenance `{"data.rendezvous": "modelled"}`.
 *
 * Two crew: both rendezvous, then `rendezvousPair`; the event carries the first meeting point of the
 * chosen order. If `rendezvousPair` throws (the vehicle cannot drive between the two points) the one
 * with the earlier meeting, ties to the first named (Proposed 2026-11-08). The second meeting is not
 * driven yet: TODO(decision).
 * If only one of two crew has a rendezvous, the vehicle goes to that one: a rover reaching one person
 * in a storm is still useful (Proposed 2026-11-08). TODO(decision): the unreachable crew member is not
 * served, and the event cannot say so because T23.04 pins the VEHICLE_DISPATCHED data keys.
 * `eta_vehicle_s` is at least 1 s whenever the path from the vehicle has length, so the vehicle never
 * covers a path in zero time (Proposed 2026-11-08).
 */
export function dispatchVehicle(state: EngineState, scenario: LoadedScenario, req: DispatchRequest): DispatchOutcome {
  const vehicle = state.vehicles.find((v) => v.kind === "pressurized_rover");
  if (!vehicle) return reject("INVALID", "the scenario has no pressurized rover");

  const ids = req.crew_ids;
  if (ids.length < 1 || ids.length > MAX_SUMMON_CREW) return reject("INVALID", `a summon names 1 or ${MAX_SUMMON_CREW} crew, got ${ids.length}`);
  if (new Set(ids).size !== ids.length) return reject("INVALID", "a crew id is named twice");
  const crew = ids.map((id) => state.crew.find((c) => c.crew_id === id));
  const unknown = ids.filter((_, i) => crew[i] === undefined);
  if (unknown.length > 0) return reject("INVALID", `unknown crew ${unknown.join(", ")}`);
  const safe = crew.filter((c) => c!.activity === "SHELTERED" || c!.activity === "IN_HAB");
  if (safe.length > 0) return reject("INVALID", safe.map((c) => `${c!.crew_id} is already ${c!.activity}`).join(", "));

  if (req.option_id !== undefined) {
    const option = state.options.find((o) => o.option_id === req.option_id);
    if (!option) return reject("INVALID", `no proposed option ${req.option_id}`);
    const same = option.crew_ids.length === ids.length && option.crew_ids.every((id) => ids.includes(id));
    if (!same) return reject("INVALID", `option ${req.option_id} is for ${option.crew_ids.join(", ")}`);
  }

  if (vehicle.state !== "PARKED") return reject("BUSY", `${vehicle.vehicle_id} is ${vehicle.state}`);

  const params = ownParams(scenario, vehicle);
  if (typeof params === "string") return reject("INVALID", params);

  if (req.rendezvous !== undefined) {
    const rv = req.rendezvous;
    const nums = [rv.x_m, rv.y_m, rv.eta_crew_s, rv.eta_vehicle_s];
    if (!nums.every((x) => typeof x === "number" && Number.isFinite(x)) || rv.eta_crew_s < 0 || rv.eta_vehicle_s < 0) {
      return reject("INVALID", "the precomputed rendezvous needs finite coordinates and ETAs >= 0");
    }
    return { ok: true, events: [dispatchedEvent(state, req, vehicle.vehicle_id, { ...rv })] };
  }

  const mission = (state.plan ?? scenario.scenario.plan)?.scenario;
  if (!mission) return reject("INVALID", "no plan is published, so there is no mission scenario to find a rendezvous for");
  const plan = mission;
  const limit_s = plan.max_haven_min * 60;
  if (!(Number.isFinite(limit_s) && limit_s >= 0)) return reject("INVALID", `max_haven_min must be a number >= 0, got ${plan.max_haven_min}`);
  const grid = scenario.grid;
  if (!grid) return reject("NO_RENDEZVOUS", "no terrain grid is loaded for the rendezvous");

  // A compute RangeError (the rover or a crew member off the grid, a malformed rover ParamSet) answers
  // NO_RENDEZVOUS instead of stopping the engine; other errors propagate (T23.07 rework, Proposed 2026-11-08).
  const found: RendezvousOk[] = [];
  try {
    const passable = vehiclePassable(grid, params);
    const fromVehicle = vehicleTimeField(grid, { x_m: vehicle.x_m, y_m: vehicle.y_m }, params);
    for (const c of crew) {
      const rv = rendezvous(crewTimeField(grid, { x_m: c!.x_m, y_m: c!.y_m }, plan, limit_s), fromVehicle, passable);
      if (rv.status === "OK") found.push(rv);
    }
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    return reject("NO_RENDEZVOUS", `compute could not search for a rendezvous: ${err.message}`);
  }
  if (found.length === 0) return reject("NO_RENDEZVOUS", "no cell both the crew and the vehicle can reach within the haven limit");

  let first = found[0]!;
  if (found.length === 2) {
    const [a, b] = found as [RendezvousOk, RendezvousOk];
    try {
      const pair = rendezvousPair(a, b, vehicleTimeField(grid, a, params), vehicleTimeField(grid, b, params));
      first = pair.order[0] === 0 ? a : b;
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
      const meet = (r: RendezvousOk): number => Math.max(r.eta_crew_s, r.eta_vehicle_s);
      first = meet(b) < meet(a) ? b : a;
    }
  }

  // The drive starts at the vehicle itself, then follows the compute path (cell centres, then the point).
  let pathLength = 0;
  let from: readonly [number, number] = [vehicle.x_m, vehicle.y_m];
  for (const p of first.vehicle_path) {
    pathLength += Math.hypot(p[0] - from[0], p[1] - from[1]);
    from = p;
  }
  const etaVehicle = Math.round(first.eta_vehicle_s);

  return {
    ok: true,
    events: [
      dispatchedEvent(state, req, vehicle.vehicle_id, {
        x_m: first.x_m,
        y_m: first.y_m,
        eta_crew_s: Math.round(first.eta_crew_s),
        eta_vehicle_s: pathLength > 0 ? Math.max(1, etaVehicle) : etaVehicle,
      }),
    ],
  };
}

/** The one VEHICLE_DISPATCHED `{vehicle_id, rendezvous, option_id?}` of a dispatch (no `command_ref`). */
function dispatchedEvent(
  state: EngineState,
  req: DispatchRequest,
  vehicle_id: string,
  rendezvous: NonNullable<LogEventData["VEHICLE_DISPATCHED"]["rendezvous"]>,
): PendingEvent {
  const data: LogEventData["VEHICLE_DISPATCHED"] = {
    vehicle_id,
    rendezvous,
    ...(req.option_id === undefined ? {} : { option_id: req.option_id }),
  };
  return {
    kind: "VEHICLE_DISPATCHED",
    actor: req.actor,
    sim_time: state.session.clock.sim_time,
    data: data as Record<string, unknown>,
    provenance: { "data.rendezvous": "modelled" },
  };
}

/** SUMMON_VEHICLE `{crew, option_id?}`: checks the arg types, then `dispatchVehicle` (02 §D.10, §E.6). */
export function handleSummon(state: EngineState, scenario: LoadedScenario, command: Command): CommandOutcome {
  const fail = (code: RejectCode, message: string): CommandOutcome => ({
    result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code, message },
    events: [],
  });
  const args = command.args ?? {};
  const crew: unknown = args.crew;
  if (!Array.isArray(crew) || !crew.every((id): id is string => typeof id === "string")) {
    return fail("INVALID", "SUMMON_VEHICLE needs args.crew, a list of crew ids");
  }
  const option_id: unknown = args.option_id;
  if (option_id !== undefined && typeof option_id !== "string") return fail("INVALID", "args.option_id must be a string");

  const out = dispatchVehicle(state, scenario, { crew_ids: crew, actor: command.role, ...(option_id === undefined ? {} : { option_id }) });
  if (!out.ok) return fail(out.code, out.message);
  // event_seq and command_ref are filled in by handleCommand (commands.ts).
  const result: CommandResult = { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: 0 };
  return { result, events: out.events };
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/** Vehicle fields a tick may change; each change goes out as one STATE_DELTA. */
const DELTA_KEYS = ["state", "x_m", "y_m", "path", "eta_s"] as const;

function vehicleDeltas(before: Vehicle, after: Vehicle): StateChange[] {
  const out: StateChange[] = [];
  for (const key of DELTA_KEYS) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out.push({ path: `vehicles/${after.vehicle_id}/${key}`, value: after[key] });
  }
  return out;
}

function replaceVehicle(state: EngineState, next: Vehicle): EngineState {
  return { ...state, vehicles: state.vehicles.map((v) => (v.vehicle_id === next.vehicle_id ? next : v)) };
}

/**
 * Shared motion helper (reused by rovers.ts, T29.03): advance `vehicle_id` along `path` for `dt_s`.
 * `path` holds the vertices still ahead (not the current position) and ends at the target; `eta_s`
 * is the whole seconds left. Speed = remaining path length ÷ `eta_s`, so the vehicle reaches the last
 * vertex on the tick `eta_s` runs out, and `eta_s` counts down as an integer. Whoever sets `path`
 * sets `eta_s` with it. Without a path or a finite `eta_s` the vehicle does not move; with path left
 * and `eta_s` ≤ 0 it does not move or arrive either (no teleport; Proposed 2026-11-08). A path with no
 * length left arrives at once.
 * On reaching the end: `path` [], `eta_s` 0, one VEHICLE_ARRIVED `{vehicle_id, x_m, y_m}` (actor
 * system). It does not set `state` ARRIVED: the reducer does when the event is applied (tick.ts rule).
 * Returns the changed fields as STATE_DELTAs.
 */
export function moveAlongPath(state: EngineState, vehicle_id: string, ctx: TickContext): TickResult {
  const v = state.vehicles.find((x) => x.vehicle_id === vehicle_id);
  if (!v || v.path.length === 0 || v.eta_s === null || !Number.isFinite(v.eta_s)) return { state, events: [], deltas: [] };

  let cur: [number, number] = [v.x_m, v.y_m];
  const ahead = v.path;
  let i = 0;
  let remaining = 0;
  let prev = cur;
  for (const p of ahead) {
    remaining += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }

  if (remaining > 0 && v.eta_s <= 0) return { state, events: [], deltas: [] };
  let arrived = remaining === 0 || v.eta_s <= ctx.dt_s;
  if (!arrived) {
    let left = (remaining * ctx.dt_s) / v.eta_s;
    while (i < ahead.length) {
      const p = ahead[i]!;
      const seg = Math.hypot(p[0] - cur[0], p[1] - cur[1]);
      if (left >= seg) {
        left -= seg;
        cur = [p[0], p[1]];
        i++;
      } else {
        const f = left / seg;
        cur = [cur[0] + (p[0] - cur[0]) * f, cur[1] + (p[1] - cur[1]) * f];
        break;
      }
    }
    // Rounding can use up the path a moment early; that is the arrival.
    arrived = i >= ahead.length;
  }

  const end = ahead[ahead.length - 1]!;
  const next: Vehicle = arrived
    ? { ...v, x_m: end[0], y_m: end[1], path: [], eta_s: 0 }
    : { ...v, x_m: cur[0], y_m: cur[1], path: ahead.slice(i).map((p) => [p[0], p[1]] as [number, number]), eta_s: Math.max(0, Math.ceil(v.eta_s - ctx.dt_s)) };

  const events: PendingEvent[] = arrived
    ? [
        {
          kind: "VEHICLE_ARRIVED",
          actor: "system",
          sim_time: state.session.clock.sim_time,
          data: { vehicle_id: v.vehicle_id, x_m: end[0], y_m: end[1] },
          provenance: { "data.x_m": "simulated", "data.y_m": "simulated" },
        },
      ]
    : [];
  return { state: replaceVehicle(state, next), events, deltas: vehicleDeltas(v, next) };
}

/**
 * The path for a DISPATCHED vehicle, from logged state only: its own position and the logged target.
 * It asks compute for the rendezvous of a crew member standing at the target with a zero time limit,
 * so the only candidate is the target cell and the result is the compute `vehicle_path` to it (the
 * same field and back-pointers as the dispatch). Null if there is none, or it does not end at the target.
 */
function pathToTarget(state: EngineState, scenario: LoadedScenario, v: Vehicle): [number, number][] | null {
  const target = v.task?.target;
  const grid = scenario.grid;
  const params = ownParams(scenario, v);
  const mission = (state.plan ?? scenario.scenario.plan)?.scenario;
  if (!target || !grid || !mission || typeof params === "string") return null;
  const atTarget = crewTimeField(grid, target, mission, 0);
  const rv = rendezvous(atTarget, vehicleTimeField(grid, { x_m: v.x_m, y_m: v.y_m }, params), vehiclePassable(grid, params));
  if (rv.status !== "OK") return null;
  const last = rv.vehicle_path[rv.vehicle_path.length - 1];
  if (!last || last[0] !== target.x_m || last[1] !== target.y_m) return null;
  return rv.vehicle_path;
}

function shelterEvents(state: EngineState, v: Vehicle): PendingEvent[] {
  const events: PendingEvent[] = [];
  for (const id of v.task?.crew_ids ?? []) {
    const c = state.crew.find((x) => x.crew_id === id);
    if (!c || c.activity === "SHELTERED" || c.activity === "IN_HAB") continue;
    if (Math.hypot(c.x_m - v.x_m, c.y_m - v.y_m) > SHELTER_REACH_M) continue;
    events.push({
      kind: "CREW_SHELTERED",
      actor: "system",
      sim_time: state.session.clock.sim_time,
      data: { crew_id: c.crew_id, haven_kind: "vehicle", dose_event_ugy: c.dose_event_ugy, dose_event_unsheltered_ugy: c.dose_event_unsheltered_ugy },
      provenance: { "data.dose_event_ugy": "simulated", "data.dose_event_unsheltered_ugy": "simulated" },
    });
  }
  return events;
}

/**
 * Move `pressurized_rover` vehicles along their paths; VEHICLE_ARRIVED, CREW_SHELTERED. Skips
 * `utility_rover` (rovers.ts). DISPATCHED: derive the path to the logged target (no path, or no
 * logged `eta_s` ⇒ stays DISPATCHED and does not move), set EN_ROUTE and move for this tick. EN_ROUTE: move. ARRIVED: one
 * CREW_SHELTERED per SUMMON crew member within SHELTER_REACH_M. Returns events, never applies them.
 */
export function vehiclesTick(state: EngineState, ctx: TickContext): TickResult {
  let current = state;
  const events: PendingEvent[] = [];
  const deltas: StateChange[] = [];

  for (const { vehicle_id } of state.vehicles) {
    const v = current.vehicles.find((x) => x.vehicle_id === vehicle_id)!;
    if (v.kind !== "pressurized_rover") continue;

    if (v.state === "DISPATCHED" || v.state === "EN_ROUTE") {
      let moving = v;
      if (v.state === "DISPATCHED") {
        // No logged ETA (a VEHICLE_DISPATCHED without a rendezvous): nothing to time the drive by, so stay put.
        if (v.eta_s === null || !Number.isFinite(v.eta_s)) continue;
        const path = pathToTarget(state, ctx.scenario, v);
        // TODO(decision): with no path the vehicle stays DISPATCHED and the tick retries; no event exists for "cannot go".
        if (!path) continue;
        moving = { ...v, state: "EN_ROUTE", path };
      }
      const r = moveAlongPath(replaceVehicle(current, moving), vehicle_id, ctx);
      current = r.state;
      events.push(...r.events);
      deltas.push(...vehicleDeltas(v, current.vehicles.find((x) => x.vehicle_id === vehicle_id)!));
    } else if (v.state === "ARRIVED") {
      events.push(...shelterEvents(current, v));
    }
  }
  return { state: current, events, deltas };
}
