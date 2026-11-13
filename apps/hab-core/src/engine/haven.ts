/**
 * Haven per tick and HAVEN_TIME_EXCEEDED (docs/specs/02 §D.8 live form; 01 FR-39; 05 Crew `haven`). T23.03 (backend
 * package 05, BD-57). Pure; sim time only, never wall-clock (NFR-06). No science here: every time and path comes from
 * @marswalk/compute (`habTimeField`, `crewTimeField`, `vehicleTimeField`, `vehiclePassable`, `liveHaven`,
 * `habIngressS`); this module picks the inputs and copies the result into `crew[].haven`, labelled `modelled`
 * (the SNAPSHOT provenance map in session.ts).
 *
 * Rules (Proposed 2026-11-12, backend package 05; decisions of the orchestrator under the product & systems lead's
 * authority, BD-57):
 * - A crew member is evaluated while on EVA: WALKING, AT_STOP or TO_HAVEN and not waiting out `start_offset_s`.
 *   Their `haven` is the live form for their own position: minutes = `haven_s` / 60, `kind` and `target_*` from
 *   `liveHaven`. A haven that cannot be reached (`liveHaven` null) is minutes Infinity (alerts.ts reads it as
 *   "no haven", and JSON carries it as null), kind `hab`, target the hab. A crew member IN_HAB, SHELTERED or waiting is
 *   at their haven: minutes 0, kind and target as they were.
 * - The hab is the current plan's `role: "start"` waypoint (contingencyOps.ts uses the same point); a session with
 *   no plan, no grid or no start waypoint changes nothing.
 * - Hab ingress is each crew member's suit ParamSet `hab_ingress_min` x 60 (compute `habIngressS`); a ParamSet without
 *   the key is a scenario error and throws, naming the key. The vehicle's ingress is the rover ParamSet `ingress_min`
 *   x 60. The vehicle branch needs `vehicle_available` in the plan's MissionScenario and a PARKED pressurized rover with
 *   a usable ParamSet, as contingencyOps.ts; a compute RangeError on the vehicle side (rover off the grid) means no
 *   vehicle branch, never a stopped engine.
 * - Caching (BD-57, BD-146): the hab field is rebuilt only when the grid, the plan's slope limits, suited speed and
 *   `max_haven_min`, the hab position, the data version or the chosen hab candidate change; the rover's field and
 *   passable mask only when the grid, the rover's ParamSet or its position change. The memo is a `HavenCache` that the
 *   session owns and hands in through `TickContext.haven_cache`: it is not engine state (the typed arrays are not
 *   JSON-safe and engine state is snapshotted) and not module state either (two sessions in one process must not
 *   share it). It only memoises a pure function, so the results do not depend on it; a context without one memoises
 *   nothing between calls. `HavenCache.clear()` empties it (SELECT_HAB_SITE, RESET_SESSION, LOAD_SCENARIO, tests).
 * - HAVEN_TIME_EXCEEDED is a `caution` (04 §A: "the band beyond the haven rule gets a caution hatch"), subject the
 *   crew member, raised once when `haven.minutes` is above the plan's `max_haven_min` and cleared when it is at or under
 *   it, or when the crew member is no longer out. Data: `haven_min` (null when unreachable, `modelled`) and
 *   `haven_kind`; the limit is the plan's own `scenario.max_haven_min`, which a client already has, so no new field.
 *   Wording is action first, at most 60 characters (04 §D.2).
 *   Decided (BD-57, orchestrator, 13 Nov 2026): the caution level and the two wordings are this package's; 02 §D.13 names none.
 */
import { cellIndex, crewTimeField, habIngressS, habTimeField, liveHaven, vehiclePassable, vehicleTimeField, type LiveHaven, type LoadedGrid, type TimeField } from "@marswalk/compute";
import type { Alert, Crew, LogEventData, MissionScenario, ParamSet, Vehicle } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import { isWaiting, type EngineState, type PendingEvent, type StateChange } from "./reducer";
import type { TickContext, TickResult } from "./tick";

const MESSAGES = {
  hab: "Haven too far — head back toward the hab",
  vehicle: "Haven too far — close on the rover",
} as const;

interface HabEntry {
  grid: LoadedGrid;
  key: string;
  field: TimeField;
}
interface VehicleEntry {
  grid: LoadedGrid;
  params: ParamSet;
  x_m: number;
  y_m: number;
  field: TimeField;
  passable: Uint8Array;
}
/**
 * The live haven of one crew member, kept for the cell they stand in (BD-145). `liveHaven` reads the crew position only
 * through the cell that contains it (`timeAt`, `pathTo` and the start of the crew field are all cell-level), so the result
 * is the same for every position in one cell; on the real 5 m grid the 30 min crew field costs about 25 ms, which at one
 * evaluation per second made a six-hour replay take about 18 minutes. The entry is valid while the grid, the cell, the hab
 * and rover fields (by identity: they are themselves cached on their inputs), the passable mask, the two ingress times and
 * the limit are the same objects and numbers.
 */
interface LiveEntry {
  grid: LoadedGrid;
  cell: number;
  hab: TimeField;
  vehicle: TimeField | null;
  passable: Uint8Array | null;
  hab_s: number;
  vehicle_s: number;
  limit_s: number;
  live: LiveHaven | null;
}
/** The memo of one session: the hab field, the rover's field and passable mask, and each crew member's live haven. */
export class HavenCache {
  hab: HabEntry | null = null;
  vehicle: VehicleEntry | null = null;
  readonly live = new Map<string, LiveEntry>();

  /** Forget everything (the next tick rebuilds it). */
  clear(): void {
    this.hab = null;
    this.vehicle = null;
    this.live.clear();
  }
}

/** The hab field for the plan's start waypoint, cached on the key of BD-57 plus everything else the field reads. */
function habField(cache: HavenCache, state: EngineState, grid: LoadedGrid, hab: { x_m: number; y_m: number }, mission: MissionScenario): TimeField {
  const key = JSON.stringify([
    state.session.data_version,
    state.session.hab_candidate_id,
    mission.hard_slope_limit_deg,
    mission.caution_slope_deg,
    mission.suited_flat_speed_kmh,
    mission.max_haven_min,
    hab.x_m,
    hab.y_m,
  ]);
  if (cache.hab !== null && cache.hab.grid === grid && cache.hab.key === key) return cache.hab.field;
  const field = habTimeField(grid, hab, mission);
  cache.hab = { grid, key, field };
  return field;
}

/**
 * The hab walking-time field of the current plan, from the memo the tick uses (N-100, N-120: the ops and EVA maps draw the
 * 10/20/30 min isochrones from it). `key` names the inputs it was built from. Null with no plan, no grid, no start waypoint,
 * or a hab outside the grid.
 */
export function currentHabField(cache: HavenCache, state: EngineState, scenario: LoadedScenario): { field: TimeField; key: string } | null {
  const grid = scenario.grid;
  const plan = state.plan;
  const hab = plan?.waypoints.find((w) => w.role === "start");
  if (grid === null || plan === null || plan === undefined || hab === undefined) return null;
  const field = unlessRangeError(() => habField(cache, state, grid, hab, plan.scenario));
  return field === null || cache.hab === null ? null : { field, key: cache.hab.key };
}

/** `f()`, or null when it throws a RangeError (compute's "bad input" error); any other error propagates. */
function unlessRangeError<T>(f: () => T): T | null {
  try {
    return f();
  } catch (err) {
    if (err instanceof RangeError) return null;
    throw err;
  }
}

/** The vehicle branch inputs: a PARKED pressurized rover with a usable ParamSet, or null. */
function vehicleInputs(cache: HavenCache, state: EngineState, scenario: LoadedScenario, grid: LoadedGrid, mission: MissionScenario): { field: TimeField; passable: Uint8Array; vehicle_s: number } | null {
  if (!mission.vehicle_available) return null;
  const vehicle: Vehicle | undefined = state.vehicles.find((v) => v.kind === "pressurized_rover");
  if (!vehicle || vehicle.state !== "PARKED") return null;
  const params = scenario.params[vehicle.param_set];
  const ingressMin = params?.values.ingress_min;
  if (!params || params.kind !== vehicle.kind || typeof ingressMin !== "number" || !(Number.isFinite(ingressMin) && ingressMin >= 0)) return null;
  const c = cache.vehicle;
  if (c !== null && c.grid === grid && c.params === params && c.x_m === vehicle.x_m && c.y_m === vehicle.y_m) {
    return { field: c.field, passable: c.passable, vehicle_s: ingressMin * 60 };
  }
  const built = unlessRangeError(() => ({ field: vehicleTimeField(grid, { x_m: vehicle.x_m, y_m: vehicle.y_m }, params), passable: vehiclePassable(grid, params) }));
  if (built === null) return null;
  cache.vehicle = { grid, params, x_m: vehicle.x_m, y_m: vehicle.y_m, ...built };
  return { ...built, vehicle_s: ingressMin * 60 };
}

const openAlerts = (state: EngineState, crew_id: Crew["crew_id"]): Alert[] =>
  state.alerts.filter((a) => a.code === "HAVEN_TIME_EXCEEDED" && a.cleared_seq === null && a.subjects.includes(crew_id));

/** Recompute `crew[].haven`; raise HAVEN_TIME_EXCEEDED past the plan's haven rule. */
export function havenTick(state: EngineState, ctx: TickContext): TickResult {
  const none: TickResult = { state, events: [], deltas: [] };
  const cache = ctx.haven_cache ?? new HavenCache();
  const grid = ctx.scenario.grid;
  const plan = state.plan;
  if (!grid || !plan) return none;
  const hab = plan.waypoints.find((w) => w.role === "start");
  if (!hab) return none;
  const mission = plan.scenario;
  const limit_s = mission.max_haven_min * 60;

  const events: PendingEvent[] = [];
  const deltas: StateChange[] = [];
  let hfield: TimeField | null = null;
  let vehicle: ReturnType<typeof vehicleInputs> | undefined;

  const crew = state.crew.map((c): Crew => {
    const entry = ctx.scenario.scenario.crew.find((x) => x.crew_id === c.crew_id);
    const out = c.activity === "WALKING" || c.activity === "AT_STOP" || c.activity === "TO_HAVEN" || c.activity === "HOLDING";
    const waiting = isWaiting(c, state.motion[c.crew_id], entry?.start_offset_s ?? 0);
    const mine = openAlerts(state, c.crew_id);

    if (!out || waiting) {
      for (const a of mine) events.push({ sim_time: state.session.clock.sim_time, kind: "ALERT_CLEARED", actor: "system", data: { alert_id: a.alert_id } satisfies LogEventData["ALERT_CLEARED"], provenance: {} });
      if (c.haven.minutes === 0) return c;
      const next: Crew = { ...c, haven: { ...c.haven, minutes: 0 } };
      deltas.push({ path: `crew/${c.crew_id}/haven`, value: next.haven });
      return next;
    }

    const suit = entry === undefined ? undefined : ctx.scenario.params[entry.suit_param_set];
    if (!suit) throw new Error(`havenTick: crew ${c.crew_id} has no suit ParamSet in the scenario (05 Scenario)`);
    const hab_s = habIngressS(suit); // a missing hab_ingress_min throws, naming the key (BD-57)
    hfield ??= habField(cache, state, grid, hab, mission);
    vehicle ??= vehicleInputs(cache, state, ctx.scenario, grid, mission);
    const cell = cellIndex(grid, c.x_m, c.y_m);
    const vehicle_s = vehicle?.vehicle_s ?? 0;
    const kept = cache.live.get(c.crew_id);
    let live: LiveHaven | null;
    if (kept !== undefined && cell !== null && kept.grid === grid && kept.cell === cell && kept.hab === hfield && kept.vehicle === (vehicle?.field ?? null) && kept.passable === (vehicle?.passable ?? null) && kept.hab_s === hab_s && kept.vehicle_s === vehicle_s && kept.limit_s === limit_s) {
      live = kept.live;
    } else {
      // The crew field is only read by the vehicle branch; without a vehicle the hab field (same geometry) stands in.
      const crewField = vehicle ? crewTimeField(grid, { x_m: c.x_m, y_m: c.y_m }, mission, limit_s) : hfield;
      live = liveHaven(hfield, crewField, vehicle?.field ?? null, vehicle?.passable ?? null, { hab_s, vehicle_s }, { x_m: c.x_m, y_m: c.y_m });
      if (cell !== null) cache.live.set(c.crew_id, { grid, cell, hab: hfield, vehicle: vehicle?.field ?? null, passable: vehicle?.passable ?? null, hab_s, vehicle_s, limit_s, live });
    }

    const haven: Crew["haven"] =
      live === null
        ? { minutes: Infinity, kind: "hab", target_x_m: hab.x_m, target_y_m: hab.y_m }
        : { minutes: live.haven_s / 60, kind: live.kind, target_x_m: live.target_x_m, target_y_m: live.target_y_m };
    if (Number.isNaN(haven.minutes)) throw new Error(`havenTick: crew ${c.crew_id} got a NaN haven time`);

    const exceeded = haven.minutes > mission.max_haven_min;
    if (exceeded && mine.length === 0) {
      const data: LogEventData["ALERT_RAISED"] = {
        alert_id: `a-${ctx.next_seq + events.length}`,
        code: "HAVEN_TIME_EXCEEDED",
        level: "caution",
        subjects: [c.crew_id],
        message: haven.kind === "vehicle" ? MESSAGES.vehicle : MESSAGES.hab,
        haven_min: Number.isFinite(haven.minutes) ? haven.minutes : null,
        haven_kind: haven.kind,
      };
      events.push({ sim_time: state.session.clock.sim_time, kind: "ALERT_RAISED", actor: "system", data, provenance: { "data.haven_min": "modelled" } });
    } else if (!exceeded) {
      for (const a of mine) events.push({ sim_time: state.session.clock.sim_time, kind: "ALERT_CLEARED", actor: "system", data: { alert_id: a.alert_id } satisfies LogEventData["ALERT_CLEARED"], provenance: {} });
    }

    const same = c.haven.minutes === haven.minutes && c.haven.kind === haven.kind && c.haven.target_x_m === haven.target_x_m && c.haven.target_y_m === haven.target_y_m;
    if (same) return c;
    deltas.push({ path: `crew/${c.crew_id}/haven`, value: haven });
    return { ...c, haven };
  });

  if (events.length === 0 && deltas.length === 0) return none;
  return { state: { ...state, crew }, events, deltas };
}
