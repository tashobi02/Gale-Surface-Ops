/**
 * Contingency options (docs/specs/02 §D.15; FR-44): abort to hab, vehicle rendezvous, terrain
 * refuge (T2), continue with skipped stops. Ranked by expected dose, then ETA. TASK-05b.
 */
import type { ContingencyOption, Crew, DoseSeries, ParamSet } from "@marswalk/protocol";
import type { RendezvousResult } from "./rendezvous";
import type { TimeField } from "./haven";

export interface ContingencyInputs {
  alert_id: string;
  crew: Crew[];
  hab: TimeField;
  rendezvous: Record<string, RendezvousResult>;
  series: DoseSeries;
  now_utc: string;
  shielding: ParamSet;
  ingress_s: number;
}

/** Deterministic ranked options. TASK-05b. */
export function proposeOptions(inputs: ContingencyInputs): ContingencyOption[] {
  throw new Error("TODO(TASK-05b): not implemented");
}
