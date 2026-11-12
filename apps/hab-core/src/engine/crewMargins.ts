/**
 * Per-crew margins for the EVA tablet and HUD: O₂ time left, and bearing, distance and ETA to the next stop
 * (docs/specs/01 FR-32, FR-33, FR-35; 02 §C.1, §D.14; 05 Crew; backend decision BD-95). T32.31 (backend package 09).
 * Pure; sim time only, never wall-clock (NFR-06); no module state. No science here: the O₂ time is compute
 * `o2RemainingS`, the bearing and distance are compute `bearingDeg` and `horizontalDistanceM`, and the ETA only adds
 * up the engine's own motion times (`legSeconds`, the stop dwell, a start offset) from the crew member's motion record.
 *
 * Rules (decided by the orchestrator, 12 Nov 2026, BD-95; tests: tests/crewMargins.test.ts):
 * - Called by tick.ts once per step, after motion, consumables, dose and the other modules, so it sees the final state of
 *   the step. The four values are state, never logged, so they do not touch `log_hash`; a change is reported as a
 *   STATE_DELTA entry, and an unchanged value sends nothing.
 * - `o2_remaining_min`: minutes at the activity the caller names (`o2Mode`; tick.ts passes the mode it uses for the
 *   consumption of the same activity), null when the suit is not consuming (in the hab, waiting out a start offset,
 *   sheltered in a vehicle or the hab).
 * - The next stop is per crew member: the plan's stop with the lowest index above their own `stop_index` (the stop they
 *   stand at, or the last they reached, is not next). It exists only for a crew member on EVA (WALKING or AT_STOP) and a plan
 *   with a stop left; otherwise the three next-stop values are null. `JUMP_NEXT_STOP` keeps its crew-wide target
 *   (engine/nextStop.ts).
 * - ETA: seconds until they arrive at that stop along the planned legs, from the motion state: the rest of the current
 *   wait, leg or dwell, then the legs up to the stop (and the dwell at any stop the route passes). Null when the route
 *   cannot be walked to it: no motion record of the plan in force (a plan revision awaiting the next step's re-anchoring),
 *   a held crew member, a leg without a route, or no leg ending at the stop. Bearing and distance stay (straight line).
 */
import { bearingDeg, horizontalDistanceM, o2RemainingS } from "@marswalk/compute";
import type { Crew, OkLeg, Waypoint } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { CrewMotion, EngineState, StateChange } from "./reducer";

const FIELDS = ["o2_remaining_min", "next_stop_bearing_deg", "next_stop_distance_m", "next_stop_eta_s"] as const;

/** Seconds a leg takes; a NaN, infinite or negative `walk_time_min` is a plan error, never an instant arrival (T22.09 S11). */
export function legSeconds(leg: OkLeg): number {
  const s = leg.walk_time_min * 60;
  if (!Number.isFinite(s) || s < 0) throw new Error(`leg ${leg.from}→${leg.to} has an invalid walk_time_min (${leg.walk_time_min})`);
  return s;
}

/** JSON-safe number: no -0 (a JSON round trip would turn it into 0). Inputs are finite by construction. */
const clean = (n: number): number => (n === 0 ? 0 : n);

/** Seconds until `c` arrives at `target` along the plan's legs, or null (see the header). */
function etaS(state: EngineState, scenario: LoadedScenario, c: Crew, target: Waypoint): number | null {
  const plan = state.plan;
  if (plan === null) return null;
  const offset_s = scenario.scenario.crew.find((x) => x.crew_id === c.crew_id)?.start_offset_s ?? 0;
  // A crew member the engine has not moved yet starts as tick.ts starts them: waiting out the offset, else on leg 0.
  const m: CrewMotion = state.motion[c.crew_id] ?? { plan_revision: state.session.plan_revision, phase: offset_s > 0 ? "wait" : "walk", leg_index: 0, t_s: 0, last_wp_id: plan.result.legs[0]?.from ?? "" };
  if (m.plan_revision !== state.session.plan_revision || m.phase === "hold") return null;
  const dwell_s = plan.scenario.dwell_min_per_stop * 60;
  const isStop = (id: string): boolean => plan.waypoints.some((w) => w.role === "stop" && w.id === id);

  let total = 0;
  if (m.phase === "wait") total = offset_s - m.t_s;
  else if (m.phase === "dwell") total = dwell_s - m.t_s;
  const legs = plan.result.legs;
  for (let i = m.leg_index; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.status !== "OK") return null;
    total += i === m.leg_index && m.phase === "walk" ? legSeconds(leg) - m.t_s : legSeconds(leg);
    if (leg.to === target.id) return clean(total);
    if (isStop(leg.to)) total += dwell_s;
  }
  return null;
}

/**
 * The four margin fields for every crew member, and a STATE_DELTA entry for each field that changed. Returns the
 * crew array unchanged (same objects) when nothing changed; never mutates `state`.
 */
export function crewMargins(state: EngineState, scenario: LoadedScenario, o2Mode: (c: Crew) => "walking" | "resting" | null): { crew: Crew[]; deltas: StateChange[] } {
  const stops = state.plan === null ? [] : state.plan.waypoints.filter((w) => w.role === "stop");
  const deltas: StateChange[] = [];
  const crew = state.crew.map((c): Crew => {
    const entry = scenario.scenario.crew.find((x) => x.crew_id === c.crew_id);
    const suit = entry === undefined ? undefined : scenario.params[entry.suit_param_set];
    if (!suit) throw new Error(`crewMargins: crew ${c.crew_id} has no suit ParamSet in the scenario (05 Scenario)`);

    const mode = o2Mode(c);
    const target = c.activity === "WALKING" || c.activity === "AT_STOP" ? stops[c.stop_index ?? 0] : undefined;
    const here = { x_m: c.x_m, y_m: c.y_m };
    const next: Pick<Crew, (typeof FIELDS)[number]> = {
      o2_remaining_min: mode === null ? null : clean(o2RemainingS(c.o2_frac, mode, suit) / 60),
      next_stop_bearing_deg: target === undefined ? null : bearingDeg(here, target),
      next_stop_distance_m: target === undefined ? null : clean(horizontalDistanceM(here, target)),
      next_stop_eta_s: target === undefined ? null : etaS(state, scenario, c, target),
    };
    const changed = FIELDS.filter((k) => c[k] !== next[k]);
    if (changed.length === 0) return c;
    for (const k of changed) deltas.push({ path: `crew/${c.crew_id}/${k}`, value: next[k] });
    return { ...c, ...next };
  });
  return { crew: deltas.length === 0 ? state.crew : crew, deltas };
}
