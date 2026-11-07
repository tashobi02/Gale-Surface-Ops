/**
 * Contingency options (docs/specs/02 §D.15; FR-44): abort to hab, vehicle rendezvous, terrain
 * refuge (T2), continue with skipped stops. Ranked by expected dose, then ETA. TASK-05b.
 * Signatures frozen by T05b.01 (contract C15).
 */
import type { ContingencyOption, Crew, CrewId, DoseSeries, Leg, MissionScenario, ParamSet, Waypoint } from "@marswalk/protocol";
import type { HavenIngress, TimeField } from "./haven";
import type { RendezvousResult } from "./rendezvous";

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
  /** The plan being walked: "continue with skips" needs the dropped stops and the remaining legs (§D.15). */
  plan: { waypoints: Waypoint[]; legs: Leg[] };
  /** User limits, e.g. `max_haven_min`, to report violations. */
  scenario: MissionScenario;
  series: DoseSeries;
  /** Shielding ParamSet (05 ParamSet kind `shielding`). */
  shielding: ParamSet;
}

/** Deterministic ranked options. TASK-05b. */
export function proposeOptions(inputs: ContingencyInputs): ContingencyOption[] {
  throw new Error("TODO(TASK-05b): not implemented");
}
