/**
 * Utility rover motion, battery, queue figures and relay revision (docs/specs/02 §D.9, §D.11; FR-41, FR-42).
 * T29.03 (backend package 19). Pure; sim time only, never wall-clock (NFR-06). Uses the shared motion helper from vehicles.ts
 * (`moveAlongPath`); TASK_ROVER validation stays in src/rover.ts.
 *
 * Rules (decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; BD-102, BD-112, BD-131):
 * - The utility rover stays `TASKED` while it drives its head task (the reducer's BD-102 rule: a new TASK_ROVER queues behind a
 *   TASKED head); `VEHICLE_ARRIVED` makes it ARRIVED, or promotes the next queued task to head (state TASKED, path empty).
 * - A TASKED rover with no path starts its head: the drive is planned once (`roverLeg`, compute) and stored in
 *   `state.rover_legs`; `path` and `eta_s` are set with it (whole seconds) and the rover moves for that tick. Moving is
 *   `moveAlongPath`: constant speed, arrival on the tick `eta_s` runs out.
 * - Battery: `battery_wh` starts at the ParamSet's `battery_wh` the first tick (it is null before) and falls with the 02 §D.9
 *   energy of the leg spread uniformly over the distance driven, so it equals the predicted `battery_wh_after` on arrival.
 * - `queue[].eta_s` (cumulative, whole seconds from now) and `battery_wh_after` are recomputed every tick from stored legs
 *   (arithmetic only; a leg is planned once, when the task is first seen).
 * - A RELAY rover parked on its target (state ARRIVED, task RELAY) gets `relay_coverage_rev`, a new number each time it parks
 *   (the last one is kept in `state.relay_revs`), and null again as soon as it is not parked as a relay. links.ts reads the
 *   parked relay as a node; `relayCoverageGrid` is the u8 grid behind `GET /api/relay-coverage/<vehicle_id>`.
 * - A rover that cannot be planned (off the grid, no route, a ParamSet without keys) stays where it is; the module never throws
 *   for it. Without a routing grid nothing is planned and nothing moves.
 */
import { RELAY_VIEWSHED_CELL_M, RELAY_VIEWSHED_RADIUS_M, viewshed } from "@marswalk/compute";
import type { ParamSet, QueuedRoverTask, Vehicle } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import { legEtaS, planChain, remainingM, roverLeg } from "../rover";
import type { EngineState, RoverLeg, StateChange } from "./reducer";
import type { TickContext, TickResult } from "./tick";
import { moveAlongPath } from "./vehicles";

/** Vehicle fields this module may change; each change goes out as one STATE_DELTA. */
const DELTA_KEYS = ["x_m", "y_m", "path", "eta_s", "battery_wh", "queue", "relay_coverage_rev"] as const;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const isParkedRelay = (v: Vehicle): boolean => v.kind === "utility_rover" && v.state === "ARRIVED" && v.task?.kind === "RELAY";

const replaceVehicle = (state: EngineState, next: Vehicle): EngineState => ({ ...state, vehicles: state.vehicles.map((v) => (v.vehicle_id === next.vehicle_id ? next : v)) });

/** Move `utility_rover` vehicles only, subtract battery (02 §D.9), fill the queue figures, number a parked relay. */
export function roversTick(state: EngineState, ctx: TickContext): TickResult {
  let current = state;
  const events: TickResult["events"] = [];
  const deltas: StateChange[] = [];
  const scenario = ctx.scenario;

  for (const { vehicle_id } of state.vehicles) {
    const before = current.vehicles.find((x) => x.vehicle_id === vehicle_id)!;
    if (before.kind !== "utility_rover") continue;
    const params: ParamSet | undefined = scenario.params[before.param_set];
    if (params === undefined) continue;

    let next = initBattery(before, params);
    let legs: Record<string, RoverLeg> = { ...(current.rover_legs ?? {}) };
    let revs = current.relay_revs;
    let working: EngineState = replaceVehicle(current, next);

    if (scenario.grid !== null) {
      // 1. Start the head, or keep driving it.
      const started = startHead(scenario, next, params, legs);
      if (started !== null) {
        legs = started.legs;
        next = started.vehicle;
        working = replaceVehicle(working, next);
      }
      if (next.state === "TASKED" && next.path.length > 0) {
        const leg = legs[next.task_id ?? "head"];
        const rem0 = remainingM(next);
        const moved = moveAlongPath(working, vehicle_id, ctx);
        events.push(...moved.events);
        working = moved.state;
        const after = working.vehicles.find((x) => x.vehicle_id === vehicle_id)!;
        // Energy ∝ distance driven (uniform spread of the leg's 02 §D.9 energy), so the battery meets the prediction on arrival.
        const used = leg !== undefined && leg.length_m > 0 ? (leg.energy_wh * Math.max(0, rem0 - remainingM(after))) / leg.length_m : 0;
        next = { ...after, battery_wh: after.battery_wh === null ? null : Math.max(0, after.battery_wh - used) };
        working = replaceVehicle(working, next);
      }
      // 2. Queue figures (cumulative eta, battery after) from stored legs; plan a leg the first time a task is seen.
      const filled = fillQueue({ ...working, rover_legs: legs }, scenario, next, params, legs);
      next = filled.vehicle;
      legs = filled.legs;
      working = replaceVehicle(working, next);
    }

    // 3. Relay revision.
    const parked = isParkedRelay(next);
    if (parked && (next.relay_coverage_rev ?? null) === null) {
      const rev = (revs?.[vehicle_id] ?? 0) + 1;
      revs = { ...(revs ?? {}), [vehicle_id]: rev };
      next = { ...next, relay_coverage_rev: rev };
    } else if (!parked && (next.relay_coverage_rev ?? null) !== null) {
      next = { ...next, relay_coverage_rev: null };
    }
    working = replaceVehicle(working, next);

    for (const key of DELTA_KEYS) {
      if (!same(before[key], next[key]) && !(before[key] === undefined && next[key] === null)) deltas.push({ path: `vehicles/${vehicle_id}/${key}`, value: next[key] });
    }
    current = { ...working, rover_legs: pruneLegs(legs, next), ...(revs === undefined ? {} : { relay_revs: revs }) };
  }
  return { state: current, events, deltas };
}

/** The battery starts full the first tick (it is null in the initial state, 05 Vehicle). */
function initBattery(v: Vehicle, params: ParamSet): Vehicle {
  if (v.battery_wh !== null) return v;
  const capacity = (params.values as Record<string, unknown>).battery_wh;
  return typeof capacity === "number" && Number.isFinite(capacity) ? { ...v, battery_wh: capacity } : v;
}

/** Keep only the legs of the tasks still active (head and queue). */
function pruneLegs(legs: Record<string, RoverLeg>, v: Vehicle): Record<string, RoverLeg> {
  const live = new Set<string>([...(v.state === "TASKED" && v.task !== null ? [v.task_id ?? "head"] : []), ...(v.queue ?? []).map((q) => q.task_id)]);
  return Object.fromEntries(Object.entries(legs).filter(([id]) => live.has(id)));
}

/** A TASKED rover with no path: plan its head from where it is and set `path` and `eta_s`. Null when there is nothing to start. */
function startHead(scenario: LoadedScenario, v: Vehicle, params: ParamSet, legs: Record<string, RoverLeg>): { vehicle: Vehicle; legs: Record<string, RoverLeg> } | null {
  if (v.state !== "TASKED" || v.task === null || v.path.length > 0 || scenario.grid === null) return null;
  const id = v.task_id ?? "head";
  const stored = legs[id];
  // A stored leg is from the previous target, which is where the rover is now; but plan again if it is not.
  const leg = stored ?? roverLeg(scenario.grid, params, { x_m: v.x_m, y_m: v.y_m }, v.task.target);
  if ("error" in leg) return null;
  return { vehicle: { ...v, path: leg.path.map((p) => [p[0], p[1]] as [number, number]), eta_s: legEtaS(leg) }, legs: { ...legs, [id]: leg } };
}

/** Fill `queue[].eta_s` and `battery_wh_after`, planning (and storing) the leg of any queued task not yet seen. */
function fillQueue(state: EngineState, scenario: LoadedScenario, v: Vehicle, params: ParamSet, legs: Record<string, RoverLeg>): { vehicle: Vehicle; legs: Record<string, RoverLeg> } {
  const queue = v.queue ?? [];
  if (queue.length === 0 || scenario.grid === null) return { vehicle: v, legs };
  const chain = planChain(state, scenario, v, params);
  if (!chain.ok) return { vehicle: v, legs };
  const byId = new Map(chain.tasks.map((t) => [t.task_id, t]));
  const filled: QueuedRoverTask[] = queue.map((q) => {
    const t = byId.get(q.task_id);
    return t === undefined ? q : { ...q, eta_s: t.eta_s, battery_wh_after: t.battery_wh_after };
  });
  const stored = { ...legs };
  for (const t of chain.tasks) stored[t.task_id] = t.leg;
  return { vehicle: { ...v, queue: filled }, legs: stored };
}

// ---- Relay coverage (FR-42, N-11) --------------------------------------------------------------------------------------

/**
 * The u8 coverage grid of a utility rover parked as a relay, in the layout of the routing grid's `comm_hab` (same width, height,
 * origin and cell; row 0 north): 1 where the cell is within the rover range (`range_rover_m` of the link ParamSet) and in line of
 * sight of the rover's antenna from a suit antenna, from compute's `viewshed` (20 m cells within 4 km, resampled to the grid), else
 * 0. Null when the vehicle is not a parked relay or there is no routing grid. Pure; `derived`, line of sight only.
 */
export function relayCoverageGrid(scenario: LoadedScenario, v: Vehicle): { width: number; height: number; data: Uint8Array } | null {
  const grid = scenario.grid;
  if (grid === null || !isParkedRelay(v)) return null;
  const params = scenario.params[v.param_set];
  const link = Object.values(scenario.params).find((p) => p.kind === "link");
  const suit = Object.values(scenario.params).find((p) => p.kind === "suit");
  if (params === undefined || link === undefined || suit === undefined) return null;
  const num = (p: ParamSet, key: string): number => {
    const x = (p.values as Record<string, unknown>)[key];
    if (typeof x !== "number" || !Number.isFinite(x)) throw new Error(`rovers: ParamSet ${p.param_set_id} has no number ${key}`);
    return x;
  };
  const range = num(link, "range_rover_m");
  const cov = viewshed(grid, { x_m: v.x_m, y_m: v.y_m, height_m: num(params, "antenna_m") }, num(suit, "antenna_m"), RELAY_VIEWSHED_RADIUS_M, RELAY_VIEWSHED_CELL_M);
  const { width, height, origin_m, cell_m } = grid.meta;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < height; i++) {
    const y = origin_m[1] - (i + 0.5) * cell_m;
    for (let j = 0; j < width; j++) {
      const x = origin_m[0] + (j + 0.5) * cell_m;
      if (Math.hypot(x - v.x_m, y - v.y_m) > range) continue;
      const r = Math.floor((cov.origin_m[1] - y) / cov.cell_m);
      const c = Math.floor((x - cov.origin_m[0]) / cov.cell_m);
      if (r >= 0 && r < cov.height && c >= 0 && c < cov.width && cov.visible[r * cov.width + c] === 1) data[i * width + j] = 1;
    }
  }
  return { width, height, data };
}
