/**
 * Contingency options (docs/specs/02 §D.15; FR-44): abort to hab, vehicle rendezvous, terrain
 * refuge (T2), continue with skipped stops. Ranked by expected dose, then ETA. TASK-05b.
 * Signatures frozen by T05b.01 (contract C15).
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
   * with `rendezvousPair`. Absent for one crew member or when either rendezvous is NO_RENDEZVOUS.
   * A two-crew VEHICLE_RENDEZVOUS option reports the first-visited point in
   * `ContingencyOption.rendezvous`.
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

function projectDose(
  series: DoseSeries,
  nowUtc: string,
  durationS: number,
  shielding: ParamSet,
): number {
  if (!Number.isFinite(durationS)) return Infinity;
  if (!(durationS > 0)) return 0;
  const startMs = Date.parse(nowUtc);
  const STEP_S = 60;
  const steps: { t_utc: string; dt_s: number; shelter: "suit" }[] = [];
  let remainingS = durationS;
  let currentMs = startMs;
  while (remainingS > 0) {
    const dt = Math.min(STEP_S, remainingS);
    steps.push({
      t_utc: new Date(currentMs).toISOString(),
      dt_s: dt,
      shelter: "suit",
    });
    remainingS -= dt;
    currentMs += dt * 1000;
  }
  const dose = integrateDose(series, steps, shielding);
  return dose.received_ugy;
}

function checkViolations(scenario: MissionScenario, etaShelterMin: number): string[] {
  const violations: string[] = [];
  if (etaShelterMin > scenario.max_haven_min) {
    violations.push("HAVEN_TIME_EXCEEDED");
  }
  return violations;
}

/**
 * Deterministic ranked options (02 §D.15). Proposed: `option_id` is `${alert_id}:${kind}`, so the
 * same inputs always give the same ids (NFR-06). Ranked by expected dose, then ETA; `rank` 1 = best.
 * TASK-05b.
 */
export function proposeOptions(inputs: ContingencyInputs): ContingencyOption[] {
  if (inputs.crew.length === 0) return [];

  const crewIds = inputs.crew.map((c) => c.crew_id);
  const stops = inputs.plan.waypoints.filter((w) => w.role === "stop");
  const currentStop = Math.max(0, ...inputs.crew.map((c) => c.stop_index ?? 0));
  const stopsDropped = stops
    .map((_, idx) => idx + 1)
    .filter((stopNum) => stopNum > currentStop);

  const candidates: ContingencyOption[] = [];

  // 1. ABORT_TO_HAB
  let maxHabWalkS = 0;
  for (const c of inputs.crew) {
    const t = timeAt(inputs.hab, c.x_m, c.y_m);
    if (t > maxHabWalkS) maxHabWalkS = t;
  }
  const abortEtaShelterS = maxHabWalkS + inputs.ingress.hab_s;
  const abortEtaShelterMin = abortEtaShelterS / 60;
  const abortDose = projectDose(inputs.series, inputs.now_utc, abortEtaShelterS, inputs.shielding);
  const abortPathPreview = pathTo(inputs.hab, inputs.crew[0].x_m, inputs.crew[0].y_m);

  candidates.push({
    option_id: `${inputs.alert_id}:ABORT_TO_HAB`,
    alert_id: inputs.alert_id,
    kind: "ABORT_TO_HAB",
    crew_ids: crewIds,
    eta_shelter_min: abortEtaShelterMin,
    expected_dose_ugy: abortDose,
    stops_dropped: stopsDropped,
    violations: checkViolations(inputs.scenario, abortEtaShelterMin),
    rank: 0,
    path_preview: abortPathPreview,
    rendezvous: null,
  });

  // 2. VEHICLE_RENDEZVOUS (if available for all crew)
  const allRendezvousOk = inputs.crew.every((c) => {
    const r = inputs.rendezvous[c.crew_id];
    return r !== undefined && r.status === "OK";
  });

  if (allRendezvousOk) {
    let rendezvousPt: { x_m: number; y_m: number; eta_crew_s: number; eta_vehicle_s: number };
    let pathPreview: [number, number][];
    let meetingArrivalS: number;

    if (inputs.crew.length > 1 && inputs.pair) {
      const firstIdx = inputs.pair.order[0];
      const firstMember = inputs.crew[firstIdx];
      const rFirst = inputs.rendezvous[firstMember.crew_id] as RendezvousOk;
      rendezvousPt = {
        x_m: rFirst.x_m,
        y_m: rFirst.y_m,
        eta_crew_s: rFirst.eta_crew_s,
        eta_vehicle_s: rFirst.eta_vehicle_s,
      };
      pathPreview = rFirst.crew_path;
      meetingArrivalS = inputs.pair.later_arrival_s;
    } else {
      const r0 = inputs.rendezvous[inputs.crew[0].crew_id] as RendezvousOk;
      rendezvousPt = {
        x_m: r0.x_m,
        y_m: r0.y_m,
        eta_crew_s: r0.eta_crew_s,
        eta_vehicle_s: r0.eta_vehicle_s,
      };
      pathPreview = r0.crew_path;
      meetingArrivalS = Math.max(r0.eta_crew_s, r0.eta_vehicle_s);
    }

    const vehEtaShelterS = meetingArrivalS + inputs.ingress.vehicle_s;
    const vehEtaShelterMin = vehEtaShelterS / 60;
    const vehDose = projectDose(inputs.series, inputs.now_utc, vehEtaShelterS, inputs.shielding);

    candidates.push({
      option_id: `${inputs.alert_id}:VEHICLE_RENDEZVOUS`,
      alert_id: inputs.alert_id,
      kind: "VEHICLE_RENDEZVOUS",
      crew_ids: crewIds,
      eta_shelter_min: vehEtaShelterMin,
      expected_dose_ugy: vehDose,
      stops_dropped: stopsDropped,
      violations: checkViolations(inputs.scenario, vehEtaShelterMin),
      rank: 0,
      path_preview: pathPreview,
      rendezvous: rendezvousPt,
    });
  }

  // 3. CONTINUE_SKIP
  let remainingLegs: OkLeg[] = [];
  const startWpId =
    currentStop > 0 && currentStop <= stops.length
      ? stops[currentStop - 1].id
      : inputs.plan.waypoints[0]?.id;

  const firstLegIdx = inputs.plan.legs.findIndex((l) => l.from === startWpId);
  if (firstLegIdx >= 0) {
    remainingLegs = inputs.plan.legs.slice(firstLegIdx).filter((l): l is OkLeg => l.status === "OK");
  }

  let skipEtaShelterS: number;
  let skipPathPreview: [number, number][];

  if (remainingLegs.length > 0) {
    const walkTimeMin = remainingLegs.reduce((sum, leg) => sum + leg.walk_time_min, 0);
    skipEtaShelterS = walkTimeMin * 60 + inputs.ingress.hab_s;
    skipPathPreview = remainingLegs.flatMap((leg, idx) =>
      idx === 0 ? leg.geometry : leg.geometry.slice(1),
    );
  } else {
    skipEtaShelterS = abortEtaShelterS;
    skipPathPreview = abortPathPreview;
  }

  const skipEtaShelterMin = skipEtaShelterS / 60;
  const skipDose = projectDose(inputs.series, inputs.now_utc, skipEtaShelterS, inputs.shielding);

  candidates.push({
    option_id: `${inputs.alert_id}:CONTINUE_SKIP`,
    alert_id: inputs.alert_id,
    kind: "CONTINUE_SKIP",
    crew_ids: crewIds,
    eta_shelter_min: skipEtaShelterMin,
    expected_dose_ugy: skipDose,
    stops_dropped: stopsDropped,
    violations: checkViolations(inputs.scenario, skipEtaShelterMin),
    rank: 0,
    path_preview: skipPathPreview,
    rendezvous: null,
  });

  // Rank by expected_dose_ugy, then eta_shelter_min; tie broken deterministically by option_id
  candidates.sort((a, b) => {
    if (a.expected_dose_ugy !== b.expected_dose_ugy) {
      return a.expected_dose_ugy - b.expected_dose_ugy;
    }
    if (a.eta_shelter_min !== b.eta_shelter_min) {
      return a.eta_shelter_min - b.eta_shelter_min;
    }
    return a.option_id.localeCompare(b.option_id);
  });

  for (let i = 0; i < candidates.length; i++) {
    candidates[i].rank = i + 1;
  }

  return candidates;
}
