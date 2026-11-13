/**
 * RIDE_VEHICLE: a crew member rides the pressurized rover to a later stop of the plan (QoL Q3; 02 §D.10, §E.6;
 * 05 Command, Vehicle, LogEvent `data` by kind; FR-40). Proposed 2026-11-13, decided by Sadman Shaharier Mahim; the small
 * choices are docs/plan/qol/decisions.md QD-008 to QD-013, decided by the orchestrator (Claude) under his authority.
 * Pure; sim time only, never wall-clock (NFR-06). No science here: the route and its time come from compute's vehicle time
 * field (`vehicleTimeField`, `timeAt`), the speed from the vehicle's own ParamSet; the drive itself is `vehiclesTick`'s.
 *
 * Exports:
 * - `handleRide`: RIDE_VEHICLE → CREW_BOARDED, then the VEHICLE_DISPATCHED of the drive (same event as a summon's, with
 *   the stop as its rendezvous point and `eta_crew_s` 0).
 * - `rideTick`: after `vehiclesTick`, a rider takes the vehicle's position; when the vehicle has ARRIVED the rider steps
 *   out: CREW_DISMOUNTED, then ARRIVED_STOP (so the stop timing, tasks and the report see an ordinary arrival).
 *
 * Rules:
 * - Only the scenario's pressurized rover carries crew (a utility rover is INVALID). It must be PARKED (else BUSY).
 * - QD-014: a crew member SHELTERED in (or HOLDING at) the pressurized rover that has ARRIVED at them after a summon can ride
 *   from there; boarding counts as already aboard, and a held crew member steps to the rendezvous point (no distance check).
 *   The rover then drives on with the RIDE task.
 * - The rider is WALKING (out of the waiting at the start), AT_STOP or HOLDING, and in the same routing-grid cell as the
 *   vehicle (the ParamSet has no boarding distance; "same cell" is the README's own wording). Otherwise INVALID.
 * - The stop is a stop waypoint of the plan in force, later than the rider's last stop, and some leg ends at it.
 * - The cabin is pressurized: while RIDING the shielding is the `pressurized_rover` factor and no suit O2 is used
 *   (tick.ts `stepMode`, as for a crew member sheltered in the vehicle).
 * - On arrival the rider dwells at the stop and then walks on from the next leg (the motion record is rebuilt here, because
 *   tick.ts drops it while the rider is not walking).
 */
import { timeAt, vehicleTimeField } from "@marswalk/compute";
import { PROTOCOL_VERSION, type Command, type CommandResult, type Crew, type LogEventData, type RejectCode, type Vehicle } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { CommandOutcome, CrewMotion, EngineState, PendingEvent, StateChange } from "./reducer";
import type { TickContext, TickResult } from "./tick";

const RIDEABLE: readonly string[] = ["WALKING", "AT_STOP", "HOLDING"];

const fail = (command: Command, code: RejectCode, message: string): CommandOutcome => ({
  result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code, message },
  events: [],
});

/** The 1-based index of a stop among the plan's stop waypoints (as tick.ts counts), or null. */
function stopIndexOf(state: EngineState, stop_id: string): number | null {
  const i = (state.plan?.waypoints ?? []).filter((w) => w.role === "stop").findIndex((w) => w.id === stop_id);
  return i < 0 ? null : i + 1;
}

/** True when two points fall in the same cell of the routing grid (row 0 north, `origin_m` the top-left corner). */
function sameCell(scenario: LoadedScenario, a: { x_m: number; y_m: number }, b: { x_m: number; y_m: number }): boolean {
  const meta = scenario.grid?.meta;
  if (!meta) return false;
  const col = (x: number): number => Math.floor((x - meta.origin_m[0]) / meta.cell_m);
  const row = (y: number): number => Math.floor((meta.origin_m[1] - y) / meta.cell_m);
  return col(a.x_m) === col(b.x_m) && row(a.y_m) === row(b.y_m);
}

/** RIDE_VEHICLE `{crew_id, vehicle_id, to_stop_id}`. Args are checked before state (commands.ts hands over after `requireState`). */
export function handleRide(state: EngineState, scenario: LoadedScenario, command: Command): CommandOutcome {
  const a = command.args ?? {};
  if (typeof a.crew_id !== "string" || typeof a.vehicle_id !== "string" || typeof a.to_stop_id !== "string") {
    return fail(command, "INVALID", "RIDE_VEHICLE needs args.crew_id, args.vehicle_id and args.to_stop_id, all text");
  }
  const crew = state.crew.find((c) => c.crew_id === a.crew_id);
  if (!crew) return fail(command, "INVALID", `unknown crew ${a.crew_id}`);
  const vehicle = state.vehicles.find((v) => v.vehicle_id === a.vehicle_id);
  if (!vehicle) return fail(command, "INVALID", `unknown vehicle ${a.vehicle_id}`);
  if (vehicle.kind !== "pressurized_rover") return fail(command, "INVALID", `${vehicle.vehicle_id} is a ${vehicle.kind}; only the pressurized rover carries crew`);
  const stop_index = stopIndexOf(state, a.to_stop_id);
  const stop = state.plan?.waypoints.find((w) => w.id === a.to_stop_id);
  if (stop_index === null || !stop) return fail(command, "INVALID", `${a.to_stop_id} is not a stop of the plan in force`);
  if (!state.plan!.result.legs.some((l) => l.to === stop.id)) return fail(command, "INVALID", `no leg of the plan ends at ${stop.id}`);
  if (stop_index <= (crew.stop_index ?? 0)) return fail(command, "INVALID", `${crew.crew_id} has already reached ${stop.id}`);

  if (crew.activity === "RIDING") return fail(command, "BUSY", `${crew.crew_id} is already riding`);
  // QD-014: the rover has arrived at the rider after a summon (SUMMON task naming them), so boarding counts as already aboard.
  // A SUMMON_VEHICLE without an option names no crew in the task, so a HOLDING crew member counts as the one it came for.
  const named = vehicle.task?.crew_ids ?? [];
  const arrivedAtRider = vehicle.state === "ARRIVED" && vehicle.task?.kind === "SUMMON" && (named.includes(crew.crew_id) || (named.length === 0 && crew.activity === "HOLDING"));
  const aboard = crew.activity === "SHELTERED" && arrivedAtRider;
  if (!RIDEABLE.includes(crew.activity) && !aboard) return fail(command, "INVALID", `${crew.crew_id} is ${crew.activity}; a rider must be walking, at a stop or holding (or sheltered in the rover that has arrived at them)`);
  if (crew.activity === "WALKING" && state.motion[crew.crew_id]?.phase === "wait") return fail(command, "INVALID", `${crew.crew_id} has not left the hab yet`);
  if (vehicle.state !== "PARKED" && !arrivedAtRider) return fail(command, "BUSY", `${vehicle.vehicle_id} is ${vehicle.state}`);
  if (arrivedAtRider) {
    const waiting = named.filter((id) => id !== crew.crew_id && !["SHELTERED", "IN_HAB"].includes(state.crew.find((c) => c.crew_id === id)?.activity ?? "IN_HAB"));
    if (waiting.length > 0) return fail(command, "BUSY", `${vehicle.vehicle_id} is still serving ${waiting.join(", ")}`);
  }
  if (!scenario.grid) return fail(command, "INVALID", "no terrain grid is loaded, so there is no vehicle route");
  // An arrived summon is the meeting: a held crew member steps to the rendezvous (QD-014), so no distance check there.
  if (!arrivedAtRider && !sameCell(scenario, crew, vehicle)) return fail(command, "INVALID", `${crew.crew_id} is not at ${vehicle.vehicle_id}; walk to it or hold beside it`);

  const params = scenario.params[vehicle.param_set];
  if (!params || params.kind !== vehicle.kind) return fail(command, "INVALID", `ParamSet ${vehicle.param_set} of ${vehicle.vehicle_id} is not a loaded ${vehicle.kind} set`);
  let time_s: number;
  try {
    time_s = timeAt(vehicleTimeField(scenario.grid, { x_m: vehicle.x_m, y_m: vehicle.y_m }, params), stop.x_m, stop.y_m);
  } catch (err) {
    if (err instanceof RangeError) return fail(command, "INVALID", `compute could not route ${vehicle.vehicle_id}: ${err.message}`);
    throw err;
  }
  if (!Number.isFinite(time_s)) return fail(command, "INVALID", `${vehicle.vehicle_id} has no passable route to ${stop.id}`);

  const length = Math.hypot(stop.x_m - vehicle.x_m, stop.y_m - vehicle.y_m);
  const eta_vehicle_s = length > 0 ? Math.max(1, Math.round(time_s)) : 0;
  const sim_time = state.session.clock.sim_time;
  const boarded: LogEventData["CREW_BOARDED"] = { crew_id: crew.crew_id, vehicle_id: vehicle.vehicle_id, to_stop_id: stop.id };
  const dispatched: LogEventData["VEHICLE_DISPATCHED"] = { vehicle_id: vehicle.vehicle_id, rendezvous: { x_m: stop.x_m, y_m: stop.y_m, eta_crew_s: 0, eta_vehicle_s } };
  const events: PendingEvent[] = [
    { sim_time, kind: "CREW_BOARDED", actor: command.role, data: boarded as Record<string, unknown>, provenance: {} },
    { sim_time, kind: "VEHICLE_DISPATCHED", actor: command.role, data: dispatched as Record<string, unknown>, provenance: { "data.rendezvous": "modelled" } },
  ];
  const result: CommandResult = { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: 0 };
  return { result, events };
}

/** The pressurized rover carrying `crew_id`, if any (its RIDE task names the rider). */
function carrier(state: EngineState, crew_id: string): Vehicle | undefined {
  return state.vehicles.find((v) => v.kind === "pressurized_rover" && v.task?.kind === "RIDE" && (v.task.crew_ids ?? []).includes(crew_id as Crew["crew_id"]));
}

/**
 * The rider's motion record at the stop: dwelling there before the leg that follows the one that ended at it (what tick.ts
 * writes on an ordinary arrival). A stop the plan no longer has gets a record from an old revision, so tick.ts re-anchors
 * the rider on the legs in force and the walk resumes from the closest point (its `reanchor`).
 */
function motionAtStop(state: EngineState, stop_id: string): CrewMotion {
  const legs = state.plan?.result.legs ?? [];
  const i = legs.findIndex((l) => l.to === stop_id);
  if (i < 0) return { plan_revision: -1, phase: "walk", leg_index: 0, t_s: 0, last_wp_id: "" };
  return { plan_revision: state.session.plan_revision, phase: "dwell", leg_index: i + 1, t_s: 0, last_wp_id: stop_id };
}

/** Riders take the vehicle's position; a rider whose vehicle has ARRIVED steps out at the stop. Runs after `vehiclesTick`. */
export function rideTick(state: EngineState, ctx: TickContext): TickResult {
  const riders = state.crew.filter((c) => c.activity === "RIDING");
  if (riders.length === 0) return { state, events: [], deltas: [] };

  const deltas: StateChange[] = [];
  const events: PendingEvent[] = [];
  const motion = { ...state.motion };
  const crew = state.crew.map((c): Crew => {
    if (c.activity !== "RIDING") return c;
    const v = carrier(state, c.crew_id);
    if (!v) return c;
    if (c.x_m !== v.x_m) deltas.push({ path: `crew/${c.crew_id}/x_m`, value: v.x_m });
    if (c.y_m !== v.y_m) deltas.push({ path: `crew/${c.crew_id}/y_m`, value: v.y_m });
    if (v.state === "ARRIVED") {
      const stop_id = v.task?.stop_id ?? "";
      const index = stopIndexOf(state, stop_id) ?? c.stop_index ?? 0;
      const dismounted: LogEventData["CREW_DISMOUNTED"] = { crew_id: c.crew_id, vehicle_id: v.vehicle_id, stop_id, stop_index: index, x_m: v.x_m, y_m: v.y_m };
      const sim_time = state.session.clock.sim_time;
      events.push(
        { sim_time, kind: "CREW_DISMOUNTED", actor: "system", data: dismounted as Record<string, unknown>, provenance: { "data.x_m": "simulated", "data.y_m": "simulated" } },
        { sim_time, kind: "ARRIVED_STOP", actor: "system", data: { crew_id: c.crew_id, stop_id, stop_index: index }, provenance: {} },
      );
      motion[c.crew_id] = motionAtStop(state, stop_id);
    }
    return { ...c, x_m: v.x_m, y_m: v.y_m };
  });
  void ctx;
  return { state: { ...state, crew, motion }, events, deltas };
}
