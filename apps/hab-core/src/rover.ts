/**
 * TASK_ROVER handler for the utility rover (docs/specs/01 FR-41; 02 §D.9, §E.4, §E.6; 05 Vehicle). TASK-29, backend package 19.
 * Goal-level tasks SCOUT, CARRY, RELAY, RETURN: the rover routes itself, battery is its consumable, tasks queue
 * (FIFO) and show ETA and the battery left after each. RELAY parks the rover so it extends L-surf coverage (FR-42, links.ts).
 *
 * No science here: the drive comes from compute's vehicle time field (`vehicleTimeField`, `pathTo`, `timeAt`: the rover's own
 * 02 §D.9 speed-vs-slope cost on the 10 m lattice) and the energy from `roverEnergyWh` (02 §D.9 energy form).
 * Sim time only, never wall-clock (NFR-06).
 *
 * Rules (decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; BD-102, BD-131):
 * - Checks, in order: arguments (INVALID), then the engine state (BUSY, commands.ts), then the vehicle and the plan of the drive
 *   (INVALID: not a utility rover, no terrain grid, no route, battery).
 * - One accepted task is one `VEHICLE_DISPATCHED {vehicle_id, task, target, item?, task_id}`, `task_id` `rt-<seq of that event>`.
 *   The event has no ETA or battery field; `roversTick` fills `Vehicle.eta_s`, `queue[].eta_s` and `battery_wh_after`.
 * - A task starts where the previous one ends: the rover's position for the first, then each previous target. RETURN's target is
 *   the rover's start point (the scenario's `start_x_m`, `start_y_m`), logged as the event's `target`; one given with RETURN is ignored.
 * - The battery check is cumulative: the battery now, minus the rest of the current drive, minus each queued leg, minus the new
 *   leg, must not be below 0.
 */
import { pathTo, roverEnergyWh, timeAt, vehicleTimeField, type LoadedGrid } from "@marswalk/compute";
import {
  PROTOCOL_VERSION,
  type Command,
  type CommandResult,
  type ParamSet,
  type RoverTaskKind,
  type TaskRoverArgs,
  type Vehicle,
} from "@marswalk/protocol";
import type { CommandOutcome, EngineState, PendingEvent, RoverLeg } from "./engine/reducer";
import type { LoadedScenario } from "./scenario";

export type { TaskRoverArgs };

type Point = { x_m: number; y_m: number };

const TASKS: readonly RoverTaskKind[] = ["SCOUT", "CARRY", "RELAY", "RETURN"];

/** Why the arguments of a TASK_ROVER are not usable, or null. Shape only: the vehicle and the drive are checked by the handler. */
export function taskRoverArgsError(args: Record<string, unknown> | undefined): string | null {
  const a = args ?? {};
  if (typeof a.vehicle_id !== "string" || a.vehicle_id.length === 0) return "TASK_ROVER needs args.vehicle_id";
  if (typeof a.task !== "string" || !TASKS.includes(a.task as RoverTaskKind)) return "TASK_ROVER args.task must be SCOUT, CARRY, RELAY or RETURN";
  if (a.item !== undefined && typeof a.item !== "string") return "TASK_ROVER args.item must be text";
  if (a.task !== "RETURN") {
    const t = a.target as Record<string, unknown> | undefined | null;
    if (t === undefined || t === null || typeof t !== "object") return `${a.task} needs args.target {x_m, y_m}`;
    if (typeof t.x_m !== "number" || typeof t.y_m !== "number" || !Number.isFinite(t.x_m) || !Number.isFinite(t.y_m)) return "TASK_ROVER args.target needs finite numbers x_m and y_m";
  }
  return null;
}

/** The rover's start point, where RETURN drives (BD-131). */
export function homeOf(scenario: LoadedScenario, vehicle_id: string): Point | null {
  const v = scenario.scenario.vehicles.find((x) => x.vehicle_id === vehicle_id);
  return v === undefined ? null : { x_m: v.start_x_m, y_m: v.start_y_m };
}

/** The point a queued or active task drives to: its target, or home for a RETURN that has none (logs written before BD-131). */
export function targetOf(task: { kind: RoverTaskKind; target: Point | null }, home: Point): Point {
  return task.target ?? home;
}

/** Whole seconds a leg takes, at least 1 when it has length (05 Vehicle `eta_s` is an int; as vehicles.ts). */
export function legEtaS(leg: RoverLeg): number {
  return leg.length_m > 0 ? Math.max(1, Math.round(leg.time_s)) : 0;
}

const polylineLength = (from: Point, path: readonly (readonly [number, number])[]): number => {
  let length = 0;
  let prev: readonly [number, number] = [from.x_m, from.y_m];
  for (const p of path) {
    length += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return length;
};

/** Metres left on a vehicle's path from where it is. */
export function remainingM(v: Vehicle): number {
  return polylineLength(v, v.path);
}

/**
 * The drive of a utility rover from `from` to `to` (02 §D.9): compute's time field of the rover over its own cost, the
 * back-pointer path (cell centres of the 10 m lattice, the start cell's centre dropped and the last replaced by `to`), the time
 * at `to`, and the energy. Or a reason there is none: the target is off the grid, impassable or cut off, or the rover is.
 */
export function roverLeg(grid: LoadedGrid, params: ParamSet, from: Point, to: Point): RoverLeg | { error: string } {
  try {
    const field = vehicleTimeField(grid, from, params);
    const time_s = timeAt(field, to.x_m, to.y_m);
    if (!Number.isFinite(time_s)) return { error: `the utility rover has no passable route to (${to.x_m}, ${to.y_m})` };
    const centres = pathTo(field, to.x_m, to.y_m).reverse();
    const path: [number, number][] = [...centres.slice(1, -1), [to.x_m, to.y_m]];
    const energy_wh = roverEnergyWh([[from.x_m, from.y_m], ...path], time_s, params, grid);
    return { path, time_s, length_m: polylineLength(from, path), energy_wh };
  } catch (err) {
    if (err instanceof RangeError) return { error: err.message };
    throw err;
  }
}

/** One task of the chain with its drive and what it leaves in the battery. */
export interface PlannedTask {
  task_id: string;
  kind: RoverTaskKind;
  target: Point;
  /** Seconds from now until it is done, cumulative over the chain. */
  eta_s: number;
  battery_wh_after: number;
  leg: RoverLeg;
}

/**
 * The chain of a utility rover: the active task (its rest, or its whole drive if it has not started), the queue, then `extra`
 * (a task being added). Legs come from `state.rover_legs` when planned, else from compute from the previous target. Returns
 * the tasks in order, or the reason the chain cannot be planned. Never changes the state.
 */
export function planChain(
  state: EngineState,
  scenario: LoadedScenario,
  v: Vehicle,
  params: ParamSet,
  extra?: { task_id: string; kind: RoverTaskKind; target: Point },
): { ok: true; tasks: PlannedTask[]; battery_start_wh: number } | { ok: false; message: string } {
  const grid = scenario.grid;
  if (grid === null) return { ok: false, message: "no terrain grid is loaded, so the utility rover cannot plan a route" };
  const home = homeOf(scenario, v.vehicle_id);
  if (home === null) return { ok: false, message: `${v.vehicle_id} is not in the scenario's vehicle list` };
  const capacity = (params.values as Record<string, unknown>).battery_wh;
  const battery_start_wh = v.battery_wh ?? (typeof capacity === "number" ? capacity : Number.NaN);
  if (!Number.isFinite(battery_start_wh)) return { ok: false, message: `ParamSet ${params.param_set_id} has no battery_wh` };

  const items: { task_id: string; kind: RoverTaskKind; target: Point; started: boolean }[] = [];
  if (v.state === "TASKED" && v.task !== null) {
    items.push({ task_id: v.task_id ?? "head", kind: v.task.kind as RoverTaskKind, target: { ...v.task.target }, started: v.path.length > 0 });
  }
  for (const q of v.queue ?? []) items.push({ task_id: q.task_id, kind: q.kind, target: targetOf(q, home), started: false });
  if (extra) items.push({ ...extra, started: false });

  const tasks: PlannedTask[] = [];
  let at: Point = { x_m: v.x_m, y_m: v.y_m };
  let battery = battery_start_wh;
  let eta = 0;
  for (const item of items) {
    const stored = state.rover_legs?.[item.task_id];
    const leg = stored ?? roverLeg(grid, params, at, item.target);
    if ("error" in leg) return { ok: false, message: leg.error };
    if (item.started && tasks.length === 0) {
      // The head is already driving: what is left of it, in the same uniform spread the tick uses (energy ∝ distance).
      const share = leg.length_m > 0 ? Math.min(1, remainingM(v) / leg.length_m) : 0;
      eta += v.eta_s ?? legEtaS(leg);
      battery -= leg.energy_wh * share;
    } else {
      eta += legEtaS(leg);
      battery -= leg.energy_wh;
    }
    tasks.push({ task_id: item.task_id, kind: item.kind, target: item.target, eta_s: eta, battery_wh_after: battery, leg });
    at = item.target;
  }
  return { ok: true, tasks, battery_start_wh };
}

/**
 * Validate and queue a TASK_ROVER command. Called by handleCommand after the role, link and state checks. Never changes the
 * state; returns one VEHICLE_DISPATCHED or an INVALID result. `next_seq` is the seq the event will get (its `task_id`).
 */
export function handleTaskRover(state: EngineState, scenario: LoadedScenario, command: Command, next_seq: number): CommandOutcome {
  const fail = (message: string): CommandOutcome => ({
    result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code: "INVALID", message },
    events: [],
  });
  const bad = taskRoverArgsError(command.args);
  if (bad !== null) return fail(bad);
  const args = command.args as unknown as TaskRoverArgs;

  const v = state.vehicles.find((x) => x.vehicle_id === args.vehicle_id);
  if (v === undefined) return fail(`unknown vehicle ${args.vehicle_id}`);
  if (v.kind !== "utility_rover") return fail(`${v.vehicle_id} is not a utility rover; only the utility rover takes TASK_ROVER`);
  const params = scenario.params[v.param_set];
  if (params === undefined) return fail(`ParamSet ${v.param_set} of ${v.vehicle_id} is not loaded`);
  if (params.kind !== "utility_rover") return fail(`ParamSet ${v.param_set} is for ${params.kind}, not utility_rover`);

  const home = homeOf(scenario, v.vehicle_id);
  if (home === null) return fail(`${v.vehicle_id} is not in the scenario's vehicle list`);
  const target: Point = args.task === "RETURN" ? home : { x_m: args.target!.x_m, y_m: args.target!.y_m };
  const task_id = `rt-${next_seq}`;

  const chain = planChain(state, scenario, v, params, { task_id, kind: args.task, target });
  if (!chain.ok) return fail(chain.message);
  const last = chain.tasks[chain.tasks.length - 1]!;
  if (last.battery_wh_after < 0) {
    return fail(`the battery cannot complete ${args.task}: ${last.battery_wh_after.toFixed(1)} Wh would be left after the queue (battery now ${chain.battery_start_wh.toFixed(1)} Wh)`);
  }

  const data = { vehicle_id: v.vehicle_id, task: args.task, target, ...(args.item === undefined || args.task !== "CARRY" ? {} : { item: args.item }), task_id };
  const event: PendingEvent = {
    sim_time: state.session.clock.sim_time,
    kind: "VEHICLE_DISPATCHED",
    actor: command.role,
    data,
    provenance: { "data.target": "assumed" },
  };
  // event_seq and command_ref are filled in by handleCommand (commands.ts).
  const result: CommandResult = { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: 0 };
  return { result, events: [event] };
}
