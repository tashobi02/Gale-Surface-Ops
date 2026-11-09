/**
 * Contingency options (docs/specs/02 §D.15; FR-44): abort to hab, vehicle rendezvous, terrain
 * refuge (T2), continue with skipped stops. Ranked by expected dose, then ETA. TASK-05b.
 * Signatures frozen by T05b.01 (contract C15). The rules where 02 §D.15 is silent are listed as
 * Proposed in docs/tasks/TASK-05b_compute-v2.md (T05b.19 section).
 */
import type {
  ContingencyOption,
  Crew,
  CrewId,
  DoseSeries,
  Leg,
  MissionScenario,
  OkLeg,
  ParamSet,
  Waypoint,
} from "@marswalk/protocol";
import { pathTo, timeAt } from "./haven";
import type { HavenIngress, TimeField } from "./haven";
import type { RendezvousOk, RendezvousPair, RendezvousResult } from "./rendezvous";
import { integrateDose } from "./eventDose";

export interface ContingencyInputs {
  alert_id: string;
  /** Only crew still out on the surface. */
  crew: Crew[];
  /** ISO-8601 UTC sim time of the alert; selects the dose series position. */
  now_utc: string;
  /** Hab time field (02 §D.8): abort-to-hab ETAs and `path_preview`. */
  hab: TimeField;
  /** Per crew member; absent = no vehicle for that member. */
  rendezvous: Partial<Record<CrewId, RendezvousResult>>;
  /** Hab and vehicle ingress, seconds (HAB_INGRESS_S; rover ParamSet `ingress_min` × 60). */
  ingress: HavenIngress;
  /**
   * For two crew with a vehicle: the visiting order and later arrival, precomputed by the caller
   * with `rendezvousPair`. Required when two crew are on alert and every one has an OK rendezvous
   * (`proposeOptions` throws a RangeError without it); not needed for one crew member or when either
   * rendezvous is NO_RENDEZVOUS. A two-crew VEHICLE_RENDEZVOUS option reports the first-visited point
   * in `ContingencyOption.rendezvous`.
   * TODO(decision): 05 has a single rendezvous point per option.
   */
  pair?: RendezvousPair;
  /** The plan being walked: "continue with skips" needs the dropped stops and the remaining legs (§D.15). */
  plan: { waypoints: Waypoint[]; legs: Leg[] };
  /** User limits, e.g. `max_haven_min`, to report violations. */
  scenario: MissionScenario;
  series: DoseSeries;
  /** Shielding ParamSet (05 ParamSet kind `shielding`). */
  shielding: ParamSet;
}

type Point = [number, number];

/** Sample times in ms, parsed once per series (derived data; the series is never changed). */
const sampleTimesCache = new WeakMap<DoseSeries, number[]>();
function sampleTimesMs(series: DoseSeries): number[] {
  let out = sampleTimesCache.get(series);
  if (!out) {
    out = series.samples.map(([t_utc]) => Date.parse(t_utc));
    sampleTimesCache.set(series, out);
  }
  return out;
}

/** ISO time with an explicit Z or offset, as `eventDose` requires, so parsing never uses the host time zone. */
function parseUtcMs(t_utc: string): number {
  const ms = /(Z|[+-]\d{2}:\d{2})$/.test(t_utc) ? Date.parse(t_utc) : NaN;
  if (Number.isNaN(ms)) throw new RangeError(`proposeOptions: now_utc ${t_utc} is not an ISO time with Z or an offset`);
  return ms;
}

/** The crew member's last stop passed: 0 = still at the start, else 1..stop count (RangeError otherwise). */
function stopIndexOf(c: Crew, stopCount: number): number {
  const idx = c.stop_index ?? 0;
  if (!Number.isInteger(idx) || idx < 0 || idx > stopCount) {
    throw new RangeError(`proposeOptions: ${c.crew_id} stop_index ${idx} is not in 0..${stopCount} (the plan has ${stopCount} stops)`);
  }
  return idx;
}

/**
 * Expected event dose, µGy, for `durationS` seconds in a suit from `startMs` (02 §D.13). The walk is
 * cut at every dose-series sample time inside it, so each piece sees one constant replayed rate and
 * the sum is exact (no step constant). `gap_s` from `integrateDose` is dropped: seconds in a gap add
 * nothing (Proposed, TASK-05b).
 */
function projectDose(series: DoseSeries, startMs: number, durationS: number, shielding: ParamSet): number {
  if (!(durationS > 0)) return 0;
  const endMs = startMs + durationS * 1000;
  const cuts = [startMs];
  for (const ms of sampleTimesMs(series)) {
    if (ms > startMs && ms < endMs) cuts.push(ms);
  }
  cuts.sort((a, b) => a - b);
  cuts.push(endMs);
  const steps: { t_utc: string; dt_s: number; shelter: "suit" }[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    steps.push({ t_utc: new Date(cuts[i]).toISOString(), dt_s: (cuts[i + 1] - cuts[i]) / 1000, shelter: "suit" });
  }
  return integrateDose(series, steps, shielding).received_ugy;
}

/** Warning codes (05) for one option: HAVEN_TIME_EXCEEDED and EVA_DURATION_EXCEEDED, in that order. */
function checkViolations(scenario: MissionScenario, etaShelterS: number, maxElapsedS: number): string[] {
  const violations: string[] = [];
  if (etaShelterS / 60 > scenario.max_haven_min) violations.push("HAVEN_TIME_EXCEEDED");
  if (maxElapsedS + etaShelterS > scenario.max_eva_duration_h * 3600) violations.push("EVA_DURATION_EXCEEDED");
  return violations;
}

function copyPath(path: readonly (readonly [number, number])[]): Point[] {
  return path.map(([x, y]) => [x, y]);
}

function isOkLeg(leg: Leg): leg is OkLeg {
  return leg.status === "OK";
}

function okRendezvous(result: RendezvousResult | undefined): RendezvousOk | null {
  return result !== undefined && result.status === "OK" ? result : null;
}

/** Code-point order, not locale order (NFR-06: the same result on every host). */
function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** True when every number in the value is finite, so the option survives `JSON.stringify` unchanged. */
function allFinite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (value !== null && typeof value === "object") return Object.values(value).every(allFinite);
  return true;
}

/** Closest point of a leg's polyline to (x, y), with the share of the polyline left after it. */
function nearestOnLeg(leg: OkLeg, x: number, y: number): { dist2: number; segIdx: number; point: Point; leftShare: number } | null {
  const g = leg.geometry;
  if (g.length < 2) return null;
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < g.length; i++) {
    const len = Math.hypot(g[i + 1][0] - g[i][0], g[i + 1][1] - g[i][1]);
    segLen.push(len);
    total += len;
  }
  let best: { dist2: number; segIdx: number; t: number; point: Point } | null = null;
  for (let i = 0; i + 1 < g.length; i++) {
    const dx = g[i + 1][0] - g[i][0];
    const dy = g[i + 1][1] - g[i][1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - g[i][0]) * dx + (y - g[i][1]) * dy) / len2));
    const px = g[i][0] + t * dx;
    const py = g[i][1] + t * dy;
    const dist2 = (x - px) * (x - px) + (y - py) * (y - py);
    if (best === null || dist2 < best.dist2) best = { dist2, segIdx: i, t, point: [px, py] };
  }
  if (best === null) return null;
  let left = (1 - best.t) * segLen[best.segIdx];
  for (let i = best.segIdx + 1; i < segLen.length; i++) left += segLen[i];
  const leftShare = total > 0 ? Math.min(1, left / total) : 1;
  return { dist2: best.dist2, segIdx: best.segIdx, point: best.point, leftShare };
}

/**
 * The rest of the plan for one crew member, walked from where they are, without dwell (Proposed): the
 * share of the current leg (the one from the last stop passed) still ahead (of that leg's
 * `walk_time_min`, by polyline length) plus the
 * later legs whole. Null when a leg from the last stop passed onward has no route, or no leg has
 * geometry; the option is then left out. A crew member with no leg from their last stop falls back to
 * the hab field (the plan has nothing left for them).
 */
function remainingPlan(inputs: ContingencyInputs, c: Crew): { walkS: number; path: Point[] } | null {
  const stops = inputs.plan.waypoints.filter((w) => w.role === "stop");
  const idx = stopIndexOf(c, stops.length);
  const startWpId = idx > 0 ? stops[idx - 1].id : inputs.plan.waypoints.find((w) => w.role === "start")?.id;
  const first = inputs.plan.legs.findIndex((l) => l.from === startWpId);
  if (first < 0) return { walkS: timeAt(inputs.hab, c.x_m, c.y_m), path: pathTo(inputs.hab, c.x_m, c.y_m) };

  const ahead = inputs.plan.legs.slice(first);
  const okLegs: OkLeg[] = [];
  for (const leg of ahead) {
    if (!isOkLeg(leg)) return null;
    okLegs.push(leg);
  }
  // Only the current leg (the one from the last stop passed) is projected onto: a later leg that
  // passes closer, such as the return leg of an out-and-back plan, must not win.
  const pick = 0;
  const hit = nearestOnLeg(okLegs[pick], c.x_m, c.y_m);
  if (hit === null) return null;

  let walkMin = okLegs[pick].walk_time_min * hit.leftShare;
  const path: Point[] = [hit.point, ...copyPath(okLegs[pick].geometry.slice(hit.segIdx + 1))];
  for (let i = pick + 1; i < okLegs.length; i++) {
    walkMin += okLegs[i].walk_time_min;
    path.push(...copyPath(okLegs[i].geometry.slice(1)));
  }
  // Drop repeated points (the crew standing exactly on a vertex).
  const deduped = path.filter((p, i) => i === 0 || p[0] !== path[i - 1][0] || p[1] !== path[i - 1][1]);
  return { walkS: walkMin * 60, path: deduped };
}

/**
 * Deterministic ranked options (02 §D.15). Proposed: `option_id` is `${alert_id}:${kind}`, so the
 * same inputs always give the same ids (NFR-06). Ranked by expected dose, then ETA, then `option_id`
 * in code-point order; `rank` 1 = best. An option whose ETA or dose is not finite is left out, so
 * the result can go on the wire as JSON; the result is `[]` when none is left. Throws RangeError for
 * an invalid `now_utc`, or for two crew with vehicle rendezvous but no `inputs.pair`. TASK-05b.
 */
export function proposeOptions(inputs: ContingencyInputs): ContingencyOption[] {
  if (inputs.crew.length === 0) return [];
  const startMs = parseUtcMs(inputs.now_utc);

  const crewIds = inputs.crew.map((c) => c.crew_id);
  const stops = inputs.plan.waypoints.filter((w) => w.role === "stop");
  const currentStop = Math.max(...inputs.crew.map((c) => stopIndexOf(c, stops.length)));
  const droppedStops = stops.map((_, idx) => idx + 1).filter((stopNum) => stopNum > currentStop);
  const maxElapsedS = Math.max(...inputs.crew.map((c) => c.eva_elapsed_s));

  const oks = inputs.crew.map((c) => okRendezvous(inputs.rendezvous[c.crew_id])).filter((r): r is RendezvousOk => r !== null);
  const vehicleOk = oks.length === inputs.crew.length;
  if (vehicleOk && inputs.crew.length > 2) {
    throw new RangeError("proposeOptions: `pair` covers exactly two crew; three or more with a vehicle rendezvous are not supported");
  }
  if (vehicleOk && inputs.crew.length === 2 && !inputs.pair) {
    throw new RangeError("proposeOptions: two crew on alert with a vehicle rendezvous need inputs.pair (rendezvousPair)");
  }

  const candidates: ContingencyOption[] = [];
  const add = (
    kind: ContingencyOption["kind"],
    etaShelterS: number,
    pathPreview: Point[],
    rendezvousPoint: ContingencyOption["rendezvous"],
  ): void => {
    if (!Number.isFinite(etaShelterS)) return;
    candidates.push({
      option_id: `${inputs.alert_id}:${kind}`,
      alert_id: inputs.alert_id,
      kind,
      crew_ids: [...crewIds],
      eta_shelter_min: etaShelterS / 60,
      expected_dose_ugy: projectDose(inputs.series, startMs, etaShelterS, inputs.shielding),
      stops_dropped: [...droppedStops],
      violations: checkViolations(inputs.scenario, etaShelterS, maxElapsedS),
      rank: 0,
      path_preview: pathPreview,
      rendezvous: rendezvousPoint,
    });
  };

  // 1. ABORT_TO_HAB: the slowest member decides the shelter time.
  const maxHabWalkS = Math.max(...inputs.crew.map((c) => timeAt(inputs.hab, c.x_m, c.y_m)));
  add("ABORT_TO_HAB", maxHabWalkS + inputs.ingress.hab_s, pathTo(inputs.hab, inputs.crew[0].x_m, inputs.crew[0].y_m), null);

  // 2. VEHICLE_RENDEZVOUS (only when every member has an OK rendezvous).
  if (vehicleOk) {
    let firstPoint: RendezvousOk;
    let meetingArrivalS: number;
    if (inputs.crew.length >= 2 && inputs.pair) {
      const picked = oks[inputs.pair.order[0]];
      if (picked === undefined) throw new RangeError(`proposeOptions: pair.order ${inputs.pair.order.join(",")} does not index the crew`);
      firstPoint = picked;
      meetingArrivalS = inputs.pair.later_arrival_s;
    } else {
      firstPoint = oks[0];
      meetingArrivalS = Math.max(firstPoint.eta_crew_s, firstPoint.eta_vehicle_s);
    }
    add("VEHICLE_RENDEZVOUS", meetingArrivalS + inputs.ingress.vehicle_s, copyPath(firstPoint.crew_path), {
      x_m: firstPoint.x_m,
      y_m: firstPoint.y_m,
      eta_crew_s: firstPoint.eta_crew_s,
      eta_vehicle_s: firstPoint.eta_vehicle_s,
    });
  }

  // 3. CONTINUE_SKIP: the planned route without dwell; the slowest member decides the shelter time.
  const walks = inputs.crew.map((c) => remainingPlan(inputs, c)).filter((r): r is { walkS: number; path: Point[] } => r !== null);
  if (walks.length === inputs.crew.length) {
    add("CONTINUE_SKIP", Math.max(...walks.map((w) => w.walkS)) + inputs.ingress.hab_s, walks[0].path, null);
  }

  const options = candidates.filter(allFinite);
  options.sort(
    (a, b) =>
      a.expected_dose_ugy - b.expected_dose_ugy ||
      a.eta_shelter_min - b.eta_shelter_min ||
      compareCodePoints(a.option_id, b.option_id),
  );
  options.forEach((o, i) => {
    o.rank = i + 1;
  });
  return options;
}
