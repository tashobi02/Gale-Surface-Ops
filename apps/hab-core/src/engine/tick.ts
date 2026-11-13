/**
 * One simulation step (docs/specs/02 §D.14). Contract C14, frozen by T22.01; implementation T22.09.
 *
 * tick.ts itself moves crew along the plan, handles dwell, and updates O₂ and dose by calling
 * @marswalk/compute (never inline science). Every other concern is an `EngineModule` in its own
 * file with its own owner, called in `MODULE_ORDER`, so TASK-23, TASK-26, TASK-29 and TASK-31 never
 * edit this file. Alerts keep the 02 §D.14 fixed order: radiation → consumables → haven time →
 * comm link → buddy distance. Per-tick positions become STATE_DELTAs, not LogEvents (05 LogEvent).
 * Nothing here reads wall-clock time (NFR-06).
 */
import { integrateDose, stepO2 } from "@marswalk/compute";
import type { Crew, CrewId, Leg, OkLeg } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import { buddyTick, consumablesTick, radiationTick } from "./alerts";
import { conditionsTick } from "./conditions";
import { contingencyTick } from "./contingencyOps";
import { crewMargins, legSeconds } from "./crewMargins";
import { earthTick } from "./earth";
import { havenTick, type HavenCache } from "./haven";
import { doseAt } from "./liveEvents";
import { linksTick } from "./links";
import { isWaiting, logged, reduce, type CrewMotion, type EngineState, type PendingEvent, type StateChange } from "./reducer";
import { roversTick } from "./rovers";
import { tasksTick } from "./tasks";
import { SHELTER_REACH_M, vehiclesTick } from "./vehicles";

export interface TickContext {
  scenario: LoadedScenario;
  /** Sim seconds in this step; the clock uses a fixed 1 s step (02 §D.14, clock.ts). */
  dt_s: number;
  /**
   * The `seq` the log will give the next event. tick.ts reduces each module's events with
   * consecutive seqs from here before calling the next module (see "State rule" below).
   */
  next_seq: number;
  /**
   * The session's haven memo (BD-146). Owned by the session, so two sessions never share it; absent in a context built
   * by a test or a one-off call, where `havenTick` then memoises nothing between calls. Never read by any other module.
   */
  haven_cache?: HavenCache;
}

export interface TickResult {
  state: EngineState;
  events: PendingEvent[];
  deltas: StateChange[];
}

/**
 * A pure per-tick concern: same state and context in, same result out.
 *
 * State rule (one convention for every module owner):
 * - A module changes only state that is never logged (positions, O₂, dose, haven, links,
 *   conditions, Earth status, vehicle paths and ETAs) directly in the `state` it returns.
 * - Everything a LogEvent describes (alerts, options, tasks, plan, vehicle and crew activity
 *   changes) is changed only by returning the event; the module does not apply it itself.
 * - tick.ts reduces each module's events (seq from `ctx.next_seq`) before calling the next module,
 *   so later modules see them (contingencyTick sees this tick's new warnings). `tick()`'s result
 *   state therefore already includes all its events: the session appends them to the log (which
 *   must assign the same seqs) and does not reduce them again.
 */
export type EngineModule = (state: EngineState, ctx: TickContext) => TickResult;

/**
 * Call order after crew motion, consumables and dose (tick.ts).
 * TODO(decision): 02 §D.14 fixes only the alert order; the order of the non-alert modules here
 * (vehicles, rovers, conditions, earth, tasks before alerts; contingency last) is proposed by T22.01.
 */
export const MODULE_ORDER: readonly EngineModule[] = [
  vehiclesTick, // T23.05: pressurized rover motion, arrival, sheltering
  roversTick, // T29.03: utility rover motion, battery, relay node
  conditionsTick, // T22.16: FR-36 conditions feed
  earthTick, // T26.04: Earth message delivery, forecasts
  tasksTick, // T31.04: simulated crew completes tasks at dwell end
  radiationTick, // T22.10: RADIATION_ALERT
  consumablesTick, // T22.10: CONSUMABLES_LOW
  havenTick, // T23.03: haven per crew, HAVEN_TIME_EXCEEDED
  linksTick, // T26.01: link graph, LINK_LOST/RESTORED, COMM_SHADOW
  buddyTick, // T22.10: BUDDY_SEPARATION
  contingencyTick, // T23.07: OPTIONS_PROPOSED on a new warning
];

/** A module body that is still the T22.01 stub: skipped per call, never cached (T22.09, S10). */
const STUB_ERROR = /^TODO\(TASK-\d+\): T\d+\.\d+ not implemented$/;

/**
 * One simulation step (02 §D.14; rules S1–S10 in docs/tasks/TASK-22 T22.09, proposed 2026-11-07).
 * Order: per crew member dose, O₂, elapsed time and motion; reduce the motion events (seqs from
 * `next_seq`); then each module in `MODULE_ORDER`, reducing its events before the next module runs.
 * The returned state already contains every event, so `last_seq = next_seq + events.length − 1`.
 * The clock has already advanced by `dt_s`: this step covers `[sim_time − dt_s, sim_time)`.
 */
export function tick(state: EngineState, scenario: LoadedScenario, dt_s: number, next_seq: number, haven_cache?: HavenCache): TickResult {
  const shielding = Object.values(scenario.params).find((p) => p.kind === "shielding");
  if (!shielding) throw new Error("tick: the scenario has no shielding ParamSet (05 Scenario)");
  const t_utc = isoSeconds(Date.parse(state.session.clock.sim_time) - dt_s * 1000);
  // The dose series and the time to read it at: shifted by START_EVENT, the background before it (T32.12, 02 §D.17).
  const dose_source = doseAt(state, scenario, t_utc);

  const crew: Crew[] = [];
  const motion: Partial<Record<CrewId, CrewMotion>> = {};
  const motionEvents: PendingEvent[] = [];
  const deltas: StateChange[] = [];
  for (const c of state.crew) {
    const entry = scenario.scenario.crew.find((x) => x.crew_id === c.crew_id);
    const suit = entry === undefined ? undefined : scenario.params[entry.suit_param_set];
    if (!suit) throw new Error(`tick: crew ${c.crew_id} has no suit ParamSet in the scenario (05 Scenario)`);
    const offset_s = entry?.start_offset_s ?? 0;
    const m = state.motion[c.crew_id];

    // Dose, then O₂, then elapsed time, all by the activity at the start of the step (S9).
    const mode = stepMode(c, m, offset_s);
    const dose = integrateDose(dose_source.series, [{ t_utc: dose_source.t_utc, dt_s, shelter: mode.shelter }], shielding);
    const walked = advance(state, scenario, c, m, dt_s, offset_s);
    const next: Crew = {
      ...c,
      x_m: walked.x_m,
      y_m: walked.y_m,
      o2_frac: mode.o2 === null ? c.o2_frac : clean(stepO2(c.o2_frac, mode.o2, dt_s, suit)),
      // IN_HAB does not count; neither does time spent waiting out start_offset_s (S4, S6).
      eva_elapsed_s: c.activity === "IN_HAB" ? c.eva_elapsed_s : clean(c.eva_elapsed_s + dt_s - walked.waited_s),
      dose_event_ugy: clean(c.dose_event_ugy + dose.received_ugy),
      dose_event_unsheltered_ugy: clean(c.dose_event_unsheltered_ugy + dose.unsheltered_ugy),
    };
    crew.push(next);
    if (walked.motion) motion[c.crew_id] = walked.motion;
    for (const e of walked.events(next)) motionEvents.push(e);
    for (const key of DELTA_FIELDS) if (next[key] !== c[key]) deltas.push({ path: `crew/${c.crew_id}/${key}`, value: next[key] });
  }

  let seq = next_seq;
  const events: PendingEvent[] = [];
  let current: EngineState = { ...state, crew, motion };
  const apply = (pending: PendingEvent[]): void => {
    for (const e of pending) {
      current = reduce(current, logged(e, seq++));
      events.push(e);
    }
  };
  apply(motionEvents);

  const ctx: TickContext = { scenario, dt_s, next_seq, ...(haven_cache === undefined ? {} : { haven_cache }) };
  for (const module of MODULE_ORDER) {
    let r: TickResult;
    try {
      r = module(current, { ...ctx, next_seq: seq });
    } catch (error) {
      if (error instanceof Error && STUB_ERROR.test(error.message)) continue;
      throw error;
    }
    current = r.state;
    apply(r.events);
    deltas.push(...r.deltas);
  }

  // Per-crew margins for the tablet and HUD (T32.31, BD-95), from the step's final state; the O₂ activity is the one that
  // `stepMode` uses for the same crew member's consumption.
  const margins = crewMargins(current, scenario, (c) => {
    const offset_s = scenario.scenario.crew.find((x) => x.crew_id === c.crew_id)?.start_offset_s ?? 0;
    return stepMode(c, current.motion[c.crew_id], offset_s).o2;
  });
  current = { ...current, crew: margins.crew };
  deltas.push(...margins.deltas);

  // Running → Ended: all crew sheltered or in the hab (03 §E.6). The reducer then sets ENDED, so this fires once.
  // A jump (JUMP_NEXT_STOP) also ticks a paused EVA, so PAUSED counts as running here (T32.10, BD-113).
  if ((current.session.status === "RUNNING" || current.session.status === "PAUSED") && current.crew.length > 0 && current.crew.every((c) => c.activity === "IN_HAB" || c.activity === "SHELTERED")) {
    apply([{ sim_time: current.session.clock.sim_time, kind: "EVA_ENDED", actor: "system", data: { crew_ids: current.crew.map((c) => c.crew_id) }, provenance: {} }]);
  }
  return { state: current, events, deltas };
}

const DELTA_FIELDS = ["x_m", "y_m", "o2_frac", "eva_elapsed_s", "dose_event_ugy", "dose_event_unsheltered_ugy"] as const;

/** ISO-8601 UTC without milliseconds, the format of clock.ts `simTimeIso`. */
const isoSeconds = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** JSON-safe number: no -0 (a JSON round trip would turn it into 0) and no NaN or Infinity. */
function clean(n: number): number {
  if (!Number.isFinite(n)) throw new Error(`tick: a non-finite number reached the state (${n})`);
  return n === 0 ? 0 : n;
}

type Point = [number, number];

/** Shielding and O₂ activity for the step, from the activity at its start (S9). */
function stepMode(c: Crew, m: CrewMotion | undefined, offset_s: number): { shelter: "suit" | "pressurized_rover" | "hab"; o2: "walking" | "resting" | null } {
  switch (c.activity) {
    case "IN_HAB":
      return { shelter: "hab", o2: null };
    case "WALKING":
    case "TO_HAVEN":
      if (isWaiting(c, m, offset_s)) return { shelter: "hab", o2: null };
      // Holding (the route ended, or waiting at a vehicle rendezvous) rests in the suit.
      return { shelter: "suit", o2: m?.phase === "hold" ? "resting" : "walking" };
    case "AT_STOP":
      return { shelter: "suit", o2: "resting" };
    case "SHELTERED":
      // A terrain refuge has no factor before T2: conservative suit shielding at the resting rate.
      return c.haven.kind === "hab" ? { shelter: "hab", o2: null } : c.haven.kind === "vehicle" ? { shelter: "pressurized_rover", o2: null } : { shelter: "suit", o2: "resting" };
  }
}

const lengthCache = new WeakMap<Point[], number[]>();
/** Segment lengths of a polyline, projected metres (`Math.hypot`, never an Earth-radius helper). */
function segmentLengths(geometry: Point[]): number[] {
  let lengths = lengthCache.get(geometry);
  if (!lengths) {
    lengths = geometry.slice(1).map((p, i) => Math.hypot(p[0] - geometry[i][0], p[1] - geometry[i][1]));
    lengthCache.set(geometry, lengths);
  }
  return lengths;
}

/** The point `d_m` metres along the polyline (the end point from its length on). */
function pointAlong(geometry: Point[], d_m: number): Point {
  const lengths = segmentLengths(geometry);
  let d = d_m;
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] || i === lengths.length - 1) {
      const g = lengths[i] === 0 ? 1 : Math.min(d / lengths[i], 1);
      return [geometry[i][0] + (geometry[i + 1][0] - geometry[i][0]) * g, geometry[i][1] + (geometry[i + 1][1] - geometry[i][1]) * g];
    }
    d -= lengths[i];
  }
  return geometry[0];
}

/** Closest point of a polyline to (x, y): its distance and the arc length to it. Ties go to the earliest segment. */
function closest(geometry: Point[], x: number, y: number): { dist: number; along_m: number } {
  if (geometry.length < 2) return { dist: geometry.length === 0 ? Infinity : Math.hypot(x - geometry[0][0], y - geometry[0][1]), along_m: 0 };
  const lengths = segmentLengths(geometry);
  let best = { dist: Infinity, along_m: 0 };
  let acc = 0;
  for (let i = 0; i < lengths.length; i++) {
    const [ax, ay] = geometry[i];
    const dx = geometry[i + 1][0] - ax;
    const dy = geometry[i + 1][1] - ay;
    const len2 = dx * dx + dy * dy;
    const f = len2 === 0 ? 0 : Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / len2, 0), 1);
    const dist = Math.hypot(x - (ax + dx * f), y - (ay + dy * f));
    if (dist < best.dist) best = { dist, along_m: acc + f * lengths[i] };
    acc += lengths[i];
  }
  return best;
}

/**
 * True while a pressurized rover's SUMMON task names this crew member and the rover is DISPATCHED,
 * EN_ROUTE or ARRIVED (S5 hold for the vehicle). ARRIVED counts too: a rover that reaches the meeting
 * point first waits there, and the crew must still hold for it, not shelter in the hab (Proposed 2026-11-08).
 */
function vehicleComing(state: EngineState, crew_id: CrewId): boolean {
  return state.vehicles.some(
    (v) =>
      v.kind === "pressurized_rover" &&
      (v.state === "DISPATCHED" || v.state === "EN_ROUTE" || v.state === "ARRIVED") &&
      v.task?.kind === "SUMMON" &&
      (v.task.crew_ids ?? []).includes(crew_id),
  );
}

interface Walked {
  x_m: number;
  y_m: number;
  motion: CrewMotion | undefined;
  /** Motion events, built once the crew member's doses after this step are known (CREW_SHELTERED copies them). */
  events: (after: Crew) => PendingEvent[];
  /** Seconds of this step spent waiting out `start_offset_s`; they do not count as EVA time. */
  waited_s: number;
}

/**
 * Move one crew member along the plan for `dt_s` (S2–S8). Constant speed within a leg; any time left
 * after an arrival or the end of a dwell carries into the next phase, so there is no drift.
 */
function advance(state: EngineState, scenario: LoadedScenario, c: Crew, m: CrewMotion | undefined, dt_s: number, offset_s: number): Walked {
  const hold = (motion: CrewMotion | undefined): Walked => ({ x_m: c.x_m, y_m: c.y_m, motion, events: () => [], waited_s: 0 });
  const plan = state.plan;
  const moving = c.activity === "WALKING" || c.activity === "AT_STOP" || c.activity === "TO_HAVEN";
  if (!moving || !plan) return hold(undefined);
  const legs = plan.result.legs;
  const waypoints = plan.waypoints;
  const start = waypoints.find((w) => w.role === "start");
  const startId = start?.id;
  const toHaven = c.activity === "TO_HAVEN";
  const revision = state.session.plan_revision;

  // A crew member seen for the first time starts at the first leg; one sent to a haven with no
  // record is re-anchored on the current legs below (revision -1 never matches).
  let cur: CrewMotion = m ?? {
    plan_revision: toHaven ? -1 : revision,
    phase: offset_s > 0 ? "wait" : "walk",
    leg_index: 0,
    t_s: 0,
    last_wp_id: legs[0]?.from ?? "",
  };
  if (cur.plan_revision !== revision) cur = reanchor(cur, legs, c, revision, toHaven);

  let x = c.x_m;
  let y = c.y_m;
  let budget = dt_s;
  let waited_s = 0;
  const pending: ((after: Crew) => PendingEvent)[] = [];
  const stopIndex = (id: string): number | null => {
    const i = waypoints.filter((w) => w.role === "stop").findIndex((w) => w.id === id);
    return i < 0 ? null : i + 1;
  };
  const sim_time = state.session.clock.sim_time;
  const system = (kind: "ARRIVED_STOP" | "LEFT_STOP", stop_id: string, stop_index: number): ((after: Crew) => PendingEvent) => () => ({
    sim_time,
    kind,
    actor: "system",
    data: { crew_id: c.crew_id, stop_id, stop_index },
    provenance: {},
  });

  for (;;) {
    if (cur.phase === "wait") {
      const need = offset_s - cur.t_s;
      if (need > budget) {
        waited_s += budget;
        cur = { ...cur, t_s: cur.t_s + budget };
        break;
      }
      waited_s += need;
      budget -= need;
      cur = { ...cur, phase: "walk", t_s: 0 };
    } else if (cur.phase === "walk") {
      const leg = legs[cur.leg_index];
      if (!leg || leg.status !== "OK") {
        cur = { ...cur, phase: "hold" }; // end of the route, or no route for the next leg (S5)
        break;
      }
      const leg_s = legSeconds(leg);
      const total_m = segmentLengths(leg.geometry).reduce((a, b) => a + b, 0);
      const remaining = leg_s > 0 && total_m > 0 ? leg_s - cur.t_s : 0;
      if (remaining > budget) {
        const t_s = cur.t_s + budget;
        [x, y] = pointAlong(leg.geometry, (t_s / leg_s) * total_m);
        cur = { ...cur, t_s };
        break;
      }
      budget -= Math.max(remaining, 0);
      const end = leg.geometry[leg.geometry.length - 1];
      if (end) [x, y] = end;
      const next = { ...cur, leg_index: cur.leg_index + 1, t_s: 0, last_wp_id: leg.to };
      const index = stopIndex(leg.to);
      if (index !== null && !toHaven) {
        pending.push(system("ARRIVED_STOP", leg.to, index));
        cur = { ...next, phase: "dwell" };
      } else if (next.leg_index < legs.length) {
        cur = { ...next, phase: "walk" };
      } else {
        // End of the route. A loop (back at the start waypoint) shelters in the hab; otherwise hold (S5, S8).
        // Except for a crew member a pressurized rover is coming for (its SUMMON task names them) who ended
        // off the start waypoint (farther than SHELTER_REACH_M, the reach vehiclesTick uses): a
        // VEHICLE_RENDEZVOUS revision's last leg has `to` = start but ends at the meeting point, where the
        // crew hold until vehiclesTick shelters them in the vehicle. A planner loop that ends on a cell
        // centre near the start still shelters in the hab (T23.07 rework, BD-59). There is no dedicated Waypoint role.
        cur = { ...next, phase: "hold" };
        const offStart = start === undefined || Math.hypot(x - start.x_m, y - start.y_m) > SHELTER_REACH_M;
        if (leg.to === startId && !(offStart && vehicleComing(state, c.crew_id))) {
          pending.push((after) => ({
            sim_time,
            kind: "CREW_SHELTERED",
            actor: "system",
            data: { crew_id: c.crew_id, haven_kind: "hab", dose_event_ugy: after.dose_event_ugy, dose_event_unsheltered_ugy: after.dose_event_unsheltered_ugy },
            provenance: { "data.dose_event_ugy": "simulated", "data.dose_event_unsheltered_ugy": "simulated" },
          }));
        }
        break;
      }
    } else if (cur.phase === "dwell") {
      const need = plan.scenario.dwell_min_per_stop * 60 - cur.t_s;
      if (need > budget) {
        cur = { ...cur, t_s: cur.t_s + budget };
        break;
      }
      budget -= need;
      // Always leave the stop; one the plan no longer has (a revision dropped it) keeps the crew member's own stop_index.
      const index = stopIndex(cur.last_wp_id) ?? c.stop_index;
      if (index === null) throw new Error(`tick: crew ${c.crew_id} ends a dwell at ${cur.last_wp_id} with no stop index`);
      pending.push(system("LEFT_STOP", cur.last_wp_id, index));
      cur = { ...cur, phase: "walk", t_s: 0 };
    } else break; // hold
  }
  return { x_m: clean(x), y_m: clean(y), motion: { ...cur, t_s: clean(cur.t_s) }, events: (after) => pending.map((p) => p(after)), waited_s };
}

/**
 * The plan was revised: put the crew member on the new legs (S7). Candidates are the legs from the
 * first whose `from` is the last waypoint reached (else all of them); the closest point wins, ties to
 * the earliest leg or segment. BD-80, tested in contingencyOpsReal.test.ts: the new first leg starts within one
 * routing cell of the crew member, and abort legs end at the start waypoint. A held crew member is re-anchored too: it resumes
 * walking unless the closest point is the end of its leg (then it stays held, so it does not arrive twice).
 */
function reanchor(m: CrewMotion, legs: Leg[], c: Crew, revision: number, toHaven: boolean): CrewMotion {
  if (m.phase === "wait") return { ...m, plan_revision: revision };
  const first = Math.max(
    legs.findIndex((l) => l.from === m.last_wp_id),
    0,
  );
  let best: { leg_index: number; dist: number; along_m: number } | null = null;
  for (let i = first; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.status !== "OK") continue;
    const hit = closest(leg.geometry, c.x_m, c.y_m);
    if (best === null || hit.dist < best.dist) best = { leg_index: i, ...hit };
  }
  if (best === null) return m.phase === "hold" ? { ...m, plan_revision: revision } : { ...m, plan_revision: revision, phase: "hold", leg_index: legs.length };
  const leg = legs[best.leg_index] as OkLeg;
  if (m.phase === "dwell" && !toHaven) return { ...m, plan_revision: revision, leg_index: best.leg_index }; // finish the dwell first (S8)
  const total_m = segmentLengths(leg.geometry).reduce((a, b) => a + b, 0);
  if (m.phase === "hold" && best.along_m >= total_m) return { ...m, plan_revision: revision }; // at the end of a leg: nothing left to walk
  const t_s = total_m > 0 ? (best.along_m / total_m) * legSeconds(leg) : 0;
  return { plan_revision: revision, phase: "walk", leg_index: best.leg_index, t_s, last_wp_id: leg.from };
}
