/**
 * Contingency options, APPROVE_OPTION and ABORT (docs/specs/02 §D.15; FR-44).
 * Owner T23.07 (TASK-23). Pure; sim time only, never wall-clock (NFR-06). No science here: every
 * time, dose and path comes from @marswalk/compute; this module only picks inputs and copies results.
 * Approval and abort log PLAN_REVISED; tasks.ts (T31.04) reacts to it for dropped stops.
 * PLAN_REVISED carries the revised `waypoints` (the plan's minus `stops_dropped`) and `legs` (the
 * kept legs plus a new leg built from the option's route), which replace the plan's in the reducer
 * (decided 2026-11-07).
 *
 * Rules (decided by the orchestrator under Sadman Shaharier Mahim's authority, 12 Nov 2026, BD-59; listed in TASK-23 under T23.07):
 * - An alert is answered once: one OPTIONS_PROPOSED per `warning` alert, ever (`proposed_alerts`,
 *   reduced from OPTIONS_PROPOSED). So an approved CONTINUE_SKIP, whose crew stay WALKING, is not
 *   proposed again on the next tick. A new alert is answered again.
 * - No grid, no shielding ParamSet or no start waypoint: no options and no events (the scenario
 *   loader gives a null grid until TASK-05).
 * - Inputs: hab = the plan's `role: "start"` waypoint; ingress = {the suit ParamSet `hab_ingress_min` × 60
 *   (compute `habIngressS`; the largest over the alert's crew, the conservative one), the rover's own
 *   ParamSet `ingress_min` × 60}; crew fields bounded at L = `max_haven_min` × 60 s (02 §D.10, as
 *   in vehicles.ts); the vehicle field starts at the rover's position. A vehicle option needs a
 *   PARKED rover with a usable ParamSet; for two crew with OK rendezvous `pair` is `rendezvousPair`,
 *   and if that throws RangeError there is no vehicle option.
 * - Options with a non-finite number are dropped before logging and the rest re-ranked 1..n.
 * - The new leg: `walk_time_min` excludes ingress (ETA − the hab ingress; for a rendezvous the crew's
 *   walk `eta_crew_s`), `distance_m` is the polyline length in projected metres, `geometry` is the
 *   option's path. Climb, descent, max slope and profile come from compute (no slope or elevation
 *   maths here, CLAUDE.md §2), labelled `derived`, only when the grid is there (no grid: INVALID).
 *   BD-59 (first proposed 2026-11-09):
 *   - ABORT_TO_HAB / VEHICLE_RENDEZVOUS: `path_preview` is a cell-centre path; its cells (repeats
 *     collapsed) go to `toLeg` and the four fields are copied. A path off the grid's cell centres
 *     (`toLeg`'s distance differs from the path's own length: a field of another `cell_m`), an error
 *     from compute, a path leaving the grid, a non-finite result or an empty path keeps 0 and an empty
 *     profile, all `assumed`, for that leg and the revision proceeds (the metrics step is contained;
 *     geometry, legs and waypoints errors still surface).
 *   - CONTINUE_SKIP: `path_preview` is a display polyline, so compute's `cellsAlongPath` maps it to the
 *     cells it passes through and `toLeg` gives climb, descent and max slope, `derived`; `profile` is
 *     `sampleProfile` of the polyline (`derived`).
 *   - A hab-bound leg (ABORT_TO_HAB, CONTINUE_SKIP) ends on the start waypoint: the start waypoint's cell is
 *     appended to the cell path before `toLeg` when the path stops in another cell, so compute measures
 *     and times the last hop; `walk_time_min` adds that hop's time to the ETA's walk. Where the path
 *     already ends in the start cell the hop is 0.
 * - A hab-bound new leg ends on the start waypoint; a VEHICLE_RENDEZVOUS leg ends at the meeting
 *   point (tick rule S5 then holds the crew there, and vehiclesTick shelters them in the vehicle).
 * - APPROVE_OPTION for VEHICLE_RENDEZVOUS dispatches through `dispatchVehicle` with the option's point.
 * - Events carry `command_ref: null` / `event_seq: 0` placeholders here; handleCommand (commands.ts)
 *   fills in both.
 */
import {
  crewTimeField,
  habTimeField,
  habIngressS,
  proposeOptions,
  rendezvous,
  rendezvousPair,
  sampleProfile,
  toLeg,
  vehiclePassable,
  vehicleTimeField,
  cellIndex,
  cellsAlongPath,
  type ContingencyInputs,
  type LoadedGrid,
  type RendezvousOk,
  type RendezvousPair,
  type RendezvousResult,
} from "@marswalk/compute";
import {
  PROTOCOL_VERSION,
  type Command,
  type ContingencyOption,
  type Crew,
  type CrewId,
  type Leg,
  type LegProfile,
  type LogEventData,
  type MissionScenario,
  type OkLeg,
  type PlanExport,
  type Provenance,
  type ProvenanceMap,
  type RejectCode,
  type Waypoint,
} from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import { doseAt } from "./liveEvents";
import type { CommandOutcome, EngineState, PendingEvent } from "./reducer";
import type { TickContext, TickResult } from "./tick";
import { dispatchVehicle } from "./vehicles";

type Point = [number, number];

function reject(command: Command, code: RejectCode, message: string): CommandOutcome {
  return { result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code, message }, events: [] };
}

/** Accepted; `event_seq` is a placeholder that handleCommand replaces (commands.ts). */
function accepted(command: Command, events: PendingEvent[]): CommandOutcome {
  return { result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: 0 }, events };
}

/** True when every number in the value is finite, so it goes on the wire as JSON unchanged. */
function allFinite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (value !== null && typeof value === "object") return Object.values(value).every(allFinite);
  return true;
}

function polylineLength(path: readonly Point[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  return s;
}

/** The plan in force: the state's (published or revised), else the scenario's reference plan; null in a plan-less session (T32.07). */
const currentPlan = (state: EngineState, scenario: LoadedScenario): PlanExport | null => state.plan ?? scenario.scenario.plan ?? null;
const startOf = (plan: PlanExport): Waypoint | undefined => plan.waypoints.find((w) => w.role === "start");

// ---------------------------------------------------------------------------
// contingencyTick
// ---------------------------------------------------------------------------

interface VehicleInputs {
  rendezvous: Partial<Record<CrewId, RendezvousResult>>;
  pair?: RendezvousPair;
  vehicle_s: number;
}

/**
 * The rendezvous inputs of 02 §D.10 for `crew`. No vehicle option (empty map; `vehicle_s` NaN, which
 * compute never uses without a rendezvous) when there is no PARKED pressurized rover, its own ParamSet
 * is missing or has no `ingress_min` ≥ 0, or `rendezvousPair` throws RangeError for two crew.
 */
const NO_VEHICLE: VehicleInputs = Object.freeze({ rendezvous: Object.freeze({}), vehicle_s: Number.NaN });

/** `f()`, or null when it throws a RangeError (compute's "bad input" error); any other error propagates. */
function unlessRangeError<T>(f: () => T): T | null {
  try {
    return f();
  } catch (err) {
    if (err instanceof RangeError) return null;
    throw err;
  }
}

function vehicleInputs(state: EngineState, scenario: LoadedScenario, grid: LoadedGrid, crew: Crew[], plan: MissionScenario): VehicleInputs {
  const none = NO_VEHICLE;
  const vehicle = state.vehicles.find((v) => v.kind === "pressurized_rover");
  if (!vehicle || vehicle.state !== "PARKED") return none;
  const params = scenario.params[vehicle.param_set];
  const ingressMin = params?.values.ingress_min;
  if (!params || params.kind !== vehicle.kind || typeof ingressMin !== "number" || !(Number.isFinite(ingressMin) && ingressMin >= 0)) return none;
  const limit_s = plan.max_haven_min * 60;
  if (!(Number.isFinite(limit_s) && limit_s >= 0)) return none;

  const passable = vehiclePassable(grid, params);
  const fromVehicle = vehicleTimeField(grid, { x_m: vehicle.x_m, y_m: vehicle.y_m }, params);
  const map: Partial<Record<CrewId, RendezvousResult>> = {};
  for (const c of crew) map[c.crew_id] = rendezvous(crewTimeField(grid, { x_m: c.x_m, y_m: c.y_m }, plan, limit_s), fromVehicle, passable);

  const oks = crew.map((c) => map[c.crew_id]).filter((r): r is RendezvousOk => r?.status === "OK");
  if (crew.length === 2 && oks.length === 2) {
    const [a, b] = oks as [RendezvousOk, RendezvousOk];
    try {
      const pair = rendezvousPair(a, b, vehicleTimeField(grid, a, params), vehicleTimeField(grid, b, params));
      return { rendezvous: map, pair, vehicle_s: ingressMin * 60 };
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
      return none;
    }
  }
  return { rendezvous: map, vehicle_s: ingressMin * 60 };
}

/** Keys spelled as in 05 §F.6 (`data.options[].<field>`), which the EVA options sheet reads. */
const OPTIONS_PROVENANCE: ProvenanceMap = {
  "data.options[].eta_shelter_min": "modelled",
  "data.options[].expected_dose_ugy": "modelled",
  "data.options[].rendezvous": "modelled",
};

/** On a new warning, build options with @marswalk/compute and log OPTIONS_PROPOSED (once per alert). */
export function contingencyTick(state: EngineState, ctx: TickContext): TickResult {
  const none: TickResult = { state, events: [], deltas: [] };
  const grid = ctx.scenario.grid;
  if (!grid) return none;
  const shielding = Object.values(ctx.scenario.params).find((p) => p.kind === "shielding");
  if (!shielding) return none;
  const plan = currentPlan(state, ctx.scenario);
  if (!plan) return none;
  const start = startOf(plan);
  if (!start) return none;

  const answered = new Set(state.proposed_alerts ?? []);
  let hab: ContingencyInputs["hab"] | null = null;
  const events: PendingEvent[] = [];
  // The expected dose reads the series the press maps this sim second to; the background before it (T32.12, 02 §D.17).
  const dose = doseAt(state, ctx.scenario, state.session.clock.sim_time);

  for (const alert of state.alerts) {
    if (alert.level !== "warning" || alert.cleared_seq !== null) continue;
    if (answered.has(alert.alert_id) || state.options.some((o) => o.alert_id === alert.alert_id)) continue;
    const crew = state.crew.filter((c) => alert.subjects.includes(c.crew_id) && (c.activity === "WALKING" || c.activity === "AT_STOP"));
    if (crew.length === 0) continue;

    // A compute RangeError (hab or rover off the grid, a malformed ParamSet) never stops the engine:
    // no options at all if the hab side throws, no vehicle option if the vehicle side throws, and an
    // alert whose options throw is skipped this tick (Proposed 2026-11-08). Other errors propagate.
    hab ??= unlessRangeError(() => habTimeField(grid, { x_m: start.x_m, y_m: start.y_m }, plan.scenario));
    if (hab === null) return none;
    const habField = hab;
    const v = unlessRangeError(() => vehicleInputs(state, ctx.scenario, grid, crew, plan.scenario)) ?? NO_VEHICLE;
    const proposed = unlessRangeError(() => proposeOptions({
      alert_id: alert.alert_id,
      crew,
      now_utc: dose.t_utc,
      hab: habField,
      rendezvous: v.rendezvous,
      ingress: { hab_s: crewHabIngressS(ctx.scenario, crew.map((c) => c.crew_id)), vehicle_s: v.vehicle_s },
      ...(v.pair ? { pair: v.pair } : {}),
      plan: { waypoints: plan.waypoints, legs: plan.result.legs },
      scenario: plan.scenario,
      series: dose.series,
      shielding,
    }));
    if (proposed === null) continue;
    const options = proposed.filter(allFinite).map((o, i): ContingencyOption => ({ ...o, rank: i + 1 }));

    const data: LogEventData["OPTIONS_PROPOSED"] = { alert_id: alert.alert_id, options };
    events.push({ kind: "OPTIONS_PROPOSED", actor: "system", sim_time: state.session.clock.sim_time, data: data as Record<string, unknown>, provenance: { ...OPTIONS_PROVENANCE } });
  }
  return events.length === 0 ? none : { state, events, deltas: [] };
}

// ---------------------------------------------------------------------------
// Plan revision
// ---------------------------------------------------------------------------

/**
 * Seconds of hab ingress for `crew_ids`: the largest suit ParamSet `hab_ingress_min` × 60 among them (BD-57; the
 * conservative choice when two suits differ). A missing key is a compute RangeError naming it.
 */
function crewHabIngressS(scenario: LoadedScenario, crew_ids: readonly CrewId[]): number {
  const values = crew_ids.map((id) => {
    const set = scenario.scenario.crew.find((c) => c.crew_id === id)?.suit_param_set;
    const suit = set === undefined ? undefined : scenario.params[set];
    if (!suit) throw new RangeError(`crew ${id} has no suit ParamSet in the scenario, so its hab ingress is unknown`);
    return habIngressS(suit);
  });
  return Math.max(...values);
}

/** Seconds the crew walk on the option's route: the ETA without the ingress (02 §D.8), or the rendezvous walk. */
function walkSeconds(option: ContingencyOption, hab_ingress_s: number): number {
  if (option.kind === "VEHICLE_RENDEZVOUS") return option.rendezvous ? option.rendezvous.eta_crew_s : Number.NaN;
  // Math.max only absorbs float rounding when the walk is zero; compute's ETA is walk + the hab ingress.
  return Math.max(0, option.eta_shelter_min * 60 - hab_ingress_s);
}

/** The four 05 Leg fields that come from compute, with the label each carries, and the time of a final hop. */
interface LegMetrics {
  climb_m: number;
  descent_m: number;
  max_slope_deg: number;
  profile: LegProfile;
  /** Minutes compute gives the appended hop to the start waypoint's cell; 0 where there is none (BD-59). */
  hop_min: number;
  labels: { climb_m: Provenance; descent_m: Provenance; max_slope_deg: Provenance; profile: Provenance };
}

/** No derivable value: 0 and an empty profile, all `assumed` (05 Leg; never blocks a safety abort). */
const assumedMetrics = (): LegMetrics => ({
  climb_m: 0,
  descent_m: 0,
  max_slope_deg: 0,
  profile: { dist_m: [], elev_m: [], slope_class: [] },
  hop_min: 0,
  labels: { climb_m: "assumed", descent_m: "assumed", max_slope_deg: "assumed", profile: "assumed" },
});

/**
 * Climb, descent, max slope and profile of the new leg, from compute only (no slope or elevation maths
 * here, CLAUDE.md §2). Built when a plan is revised, never per tick. A path not on the grid's cell
 * centres, a non-finite value or an error from compute gives `assumedMetrics()`: a display metric never
 * blocks a safety command (BD-59). Only this step is contained.
 */
function computeLegMetrics(grid: LoadedGrid, option: ContingencyOption, from: string, to: string, geometry: Point[], scenario: MissionScenario, start: Waypoint): LegMetrics {
  const habBound = option.kind !== "VEHICLE_RENDEZVOUS";
  const startCell = habBound ? cellIndex(grid, start.x_m, start.y_m) : null;
  /** True when cell `b` is one of the 8 neighbours of cell `a`. */
  const adjacent = (a: number, b: number): boolean => {
    const w = grid.meta.width;
    return Math.max(Math.abs(Math.floor(a / w) - Math.floor(b / w)), Math.abs((a % w) - (b % w))) === 1;
  };
  /**
   * `toLeg` on `cells`, and on `cells` plus the start cell when the path stops in the neighbouring cell (BD-59).
   * A path that stops anywhere else does not connect to the start waypoint: null (the metrics stay assumed).
   */
  const measure = (cells: number[]): { leg: OkLeg; plain: OkLeg } | null => {
    const run = (c: number[]): OkLeg | null => {
      const leg = toLeg(grid, from, to, { status: "OK", cells: c }, scenario);
      return leg.status === "OK" ? leg : null;
    };
    const plain = run(cells);
    if (!plain) return null;
    const last = cells[cells.length - 1]!;
    if (startCell === null || !Number.isInteger(startCell) || last === startCell) return { leg: plain, plain };
    if (!adjacent(last, startCell)) return null;
    const leg = run([...cells, startCell]);
    return leg ? { leg, plain } : null;
  };
  const finish = (m: { leg: OkLeg; plain: OkLeg }, profile: LegProfile): LegMetrics => {
    const { climb_m, descent_m, max_slope_deg } = m.leg;
    const hop_min = m.leg.walk_time_min - m.plain.walk_time_min;
    if (![climb_m, descent_m, max_slope_deg, hop_min].every(Number.isFinite) || !allFinite(profile)) return assumedMetrics();
    return { climb_m, descent_m, max_slope_deg, profile, hop_min, labels: { climb_m: "derived", descent_m: "derived", max_slope_deg: "derived", profile: "derived" } };
  };

  if (option.kind === "CONTINUE_SKIP") {
    // A display polyline, not a cell path: compute maps it to the cells it passes through (BD-59). The profile is
    // sampled from the polyline itself; the scalars need the whole polyline on the grid, because a part measured
    // and the rest silently left out would be labelled derived for a leg it does not describe.
    const profile = sampleProfile(grid, geometry, scenario.caution_slope_deg, scenario.hard_slope_limit_deg);
    const profileOk = allFinite(profile);
    const cells = cellsAlongPath(grid, geometry);
    const last = geometry[geometry.length - 1];
    const whole = last !== undefined && cells.length > 0 && cells[cells.length - 1] === cellIndex(grid, last[0], last[1]);
    const m = whole ? measure(cells) : null;
    const scalars = m ? finish(m, profile) : assumedMetrics();
    if (scalars.labels.climb_m === "derived") return scalars;
    return profileOk ? { ...scalars, profile, labels: { ...scalars.labels, profile: "derived" } } : scalars;
  }
  const path = option.path_preview;
  if (path.length === 0) return assumedMetrics();
  const cells: number[] = [];
  for (const [x, y] of path) {
    const cell = cellIndex(grid, x, y);
    // `cellIndex` gives null outside the grid and NaN for a NaN coordinate.
    if (cell === null || !Number.isInteger(cell)) return assumedMetrics();
    if (cells[cells.length - 1] !== cell) cells.push(cell);
  }
  const m = measure(cells);
  if (!m) return assumedMetrics();
  const length = polylineLength(path);
  if (!(Math.abs(m.plain.distance_m - length) <= 1e-6 * Math.max(1, length))) {
    // Not on this grid's cell centres (a field of another `cell_m` or origin): the numbers would be wrong.
    return assumedMetrics();
  }
  return finish(m, m.leg.profile);
}

/** `computeLegMetrics`, with any error from compute contained as `assumedMetrics()`. */
function legMetrics(grid: LoadedGrid, option: ContingencyOption, from: string, to: string, geometry: Point[], scenario: MissionScenario, start: Waypoint): LegMetrics {
  try {
    return computeLegMetrics(grid, option, from, to, geometry, scenario, start);
  } catch {
    return assumedMetrics();
  }
}

interface Revision {
  waypoints: Waypoint[];
  legs: Leg[];
  provenance: ProvenanceMap;
}

/** The plan minus the option's dropped stops, with the kept legs and one new leg on the option's route. */
function buildPlanRevision(state: EngineState, scenario: LoadedScenario, option: ContingencyOption): Revision | string {
  const grid = scenario.grid;
  if (!grid) return "the scenario has no routing grid";
  const plan = currentPlan(state, scenario);
  if (!plan) return "no plan is published";
  const start = startOf(plan);
  if (!start) return "the plan has no start waypoint";
  let hab_ingress_s: number;
  try {
    hab_ingress_s = crewHabIngressS(scenario, option.crew_ids);
  } catch (err) {
    if (err instanceof RangeError) return err.message;
    throw err;
  }
  const walk_s = walkSeconds(option, hab_ingress_s);
  if (!Number.isFinite(walk_s)) return `option ${option.option_id} has no finite walk time`;

  const stopNo = new Map(plan.waypoints.filter((w) => w.role === "stop").map((w, i) => [w.id, i + 1]));
  const waypoints = plan.waypoints.filter((w) => w.role !== "stop" || !option.stops_dropped.includes(stopNo.get(w.id)!));

  const legs: Leg[] = [];
  for (let i = 0; i + 1 < waypoints.length; i++) {
    const kept = plan.result.legs.find((l) => l.from === waypoints[i]!.id && l.to === waypoints[i + 1]!.id);
    if (kept) legs.push(kept);
  }
  const geometry: Point[] = option.path_preview.map(([x, y]) => [x, y]);
  // A hab-bound route ends on the start waypoint itself: compute's hab path ends at the hab cell's
  // centre, which may lie farther than SHELTER_REACH_M from the waypoint, and tick rule S5 shelters in
  // the hab only at the waypoint (BD-59).
  // A VEHICLE_RENDEZVOUS leg keeps `to` = start (05 Waypoint `role` is start|stop; T23.06 asserts it)
  // but ends at the meeting point, so S5 holds the crew there and vehiclesTick shelters them in the
  // vehicle. No new Waypoint role: rule S5 stands (BD-59).
  const end = geometry[geometry.length - 1];
  if (option.kind !== "VEHICLE_RENDEZVOUS" && (!end || end[0] !== start.x_m || end[1] !== start.y_m)) geometry.push([start.x_m, start.y_m]);
  const from = waypoints[waypoints.length - 1]!.id;
  const metrics = legMetrics(grid, option, from, start.id, geometry, plan.scenario, start);
  const leg: OkLeg = {
    from,
    to: start.id,
    status: "OK",
    distance_m: polylineLength(geometry),
    walk_time_min: walk_s / 60 + metrics.hop_min,
    climb_m: metrics.climb_m,
    descent_m: metrics.descent_m,
    max_slope_deg: metrics.max_slope_deg,
    geometry,
    cell_path_length: geometry.length,
    profile: metrics.profile,
  };
  legs.push(leg);
  const i = legs.length - 1;
  return {
    waypoints,
    legs,
    provenance: {
      [`data.legs.${i}.walk_time_min`]: "modelled",
      [`data.legs.${i}.distance_m`]: "derived",
      [`data.legs.${i}.climb_m`]: metrics.labels.climb_m,
      [`data.legs.${i}.descent_m`]: metrics.labels.descent_m,
      [`data.legs.${i}.max_slope_deg`]: metrics.labels.max_slope_deg,
      [`data.legs.${i}.profile`]: metrics.labels.profile,
    },
  };
}

/** PLAN_REVISED for executing `option`, or a rejection. */
function planRevised(state: EngineState, scenario: LoadedScenario, command: Command, option: ContingencyOption): PendingEvent | string {
  const revision = buildPlanRevision(state, scenario, option);
  if (typeof revision === "string") return revision;
  const data: LogEventData["PLAN_REVISED"] = {
    plan_revision: state.session.plan_revision + 1,
    option_id: option.option_id,
    stops_dropped: [...option.stops_dropped],
    waypoints: revision.waypoints,
    legs: revision.legs,
  };
  return { kind: "PLAN_REVISED", actor: command.role, sim_time: state.session.clock.sim_time, data: data as Record<string, unknown>, provenance: revision.provenance, command_ref: null };
}

const alertActive = (state: EngineState, alert_id: string): boolean => state.alerts.some((a) => a.alert_id === alert_id && a.cleared_seq === null);

// ---------------------------------------------------------------------------
// APPROVE_OPTION
// ---------------------------------------------------------------------------

/**
 * APPROVE_OPTION `{option_id}`: revise the plan; log PLAN_REVISED. A VEHICLE_RENDEZVOUS option logs
 * VEHICLE_DISPATCHED first, to the option's own rendezvous point (the point its crew route leads to;
 * T23.06 asserts the option's `rendezvous` verbatim), through T23.05's shared `dispatchVehicle` with
 * that point precomputed: its INVALID / BUSY / ParamSet checks apply, and its rejection is the answer.
 */
export function handleApproveOption(state: EngineState, scenario: LoadedScenario, command: Command): CommandOutcome {
  const option_id: unknown = command.args?.option_id;
  if (typeof option_id !== "string" || option_id.length === 0) return reject(command, "INVALID", "APPROVE_OPTION requires option_id");
  const option = state.options.find((o) => o.option_id === option_id);
  if (!option) return reject(command, "INVALID", `option ${option_id} not found or stale`);
  if (!alertActive(state, option.alert_id)) return reject(command, "INVALID", `alert ${option.alert_id} is cleared or stale`);

  const events: PendingEvent[] = [];
  if (option.kind === "VEHICLE_RENDEZVOUS") {
    if (!option.rendezvous) return reject(command, "INVALID", `option ${option_id} has no rendezvous point`);
    const out = dispatchVehicle(state, scenario, { crew_ids: option.crew_ids, option_id: option.option_id, actor: command.role, rendezvous: option.rendezvous });
    if (!out.ok) return reject(command, out.code, out.message);
    events.push(...out.events);
  }

  const revised = planRevised(state, scenario, command, option);
  if (typeof revised === "string") return reject(command, "INVALID", revised);
  events.push(revised);
  return accepted(command, events);
}

// ---------------------------------------------------------------------------
// ABORT
// ---------------------------------------------------------------------------

/**
 * ABORT `{crew}`: execute the ABORT_TO_HAB option covering the listed crew; log PLAN_REVISED, no
 * vehicle. An EVA role may abort only for a list that includes itself (02 §E.4). With options of
 * several active alerts, the newest alert's (highest `raised_seq`) is executed (Proposed 2026-11-08).
 */
export function handleAbort(state: EngineState, scenario: LoadedScenario, command: Command): CommandOutcome {
  const crew: unknown = command.args?.crew;
  if (!Array.isArray(crew) || crew.length === 0 || !crew.every((id): id is string => typeof id === "string")) {
    return reject(command, "INVALID", "ABORT requires args.crew, a non-empty list of crew ids");
  }
  const unknown = crew.filter((id) => !state.crew.some((c) => c.crew_id === id));
  if (unknown.length > 0) return reject(command, "INVALID", `unknown crew id ${unknown.join(", ")}`);

  const self = command.role.startsWith("eva:") ? command.role.slice("eva:".length) : null;
  if (self !== null && !crew.includes(self)) return reject(command, "FORBIDDEN_ROLE", `${command.role} may only abort for itself`);

  const raisedSeq = (alert_id: string): number => state.alerts.find((a) => a.alert_id === alert_id)?.raised_seq ?? -1;
  const candidates = state.options.filter((o) => o.kind === "ABORT_TO_HAB" && o.crew_ids.some((id) => crew.includes(id)) && alertActive(state, o.alert_id));
  if (candidates.length === 0) return reject(command, "INVALID", "no active ABORT_TO_HAB option for the crew");
  const option = candidates.reduce((best, o) => {
    const d = raisedSeq(o.alert_id) - raisedSeq(best.alert_id);
    return d > 0 || (d === 0 && o.option_id < best.option_id) ? o : best;
  });

  const revised = planRevised(state, scenario, command, option);
  if (typeof revised === "string") return reject(command, "INVALID", revised);
  return accepted(command, [revised]);
}
