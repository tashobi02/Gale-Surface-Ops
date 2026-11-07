/**
 * Crew–vehicle rendezvous (docs/specs/02 §D.10; FR-40). TASK-05b.
 * q* = argmin over cells reachable by both of max(T_crew(q), T_vehicle(q));
 * tie-break: min T_crew, then cell index (NFR-06).
 * Signatures frozen by T05b.01 (contract C15). Positions are working-projection metres.
 */
import type { TimeField } from "./haven";

export type RendezvousResult =
  | {
      status: "OK";
      x_m: number;
      y_m: number;
      eta_crew_s: number;
      eta_vehicle_s: number;
      /** From the crew start to q* (`rendezvous` reverses the `pathTo` output, which runs from q* back to the start). */
      crew_path: [number, number][];
      /** From the vehicle start to q* (reversed `pathTo` output, as `crew_path`). */
      vehicle_path: [number, number][];
    }
  | { status: "NO_RENDEZVOUS" };

/** A rendezvous that exists; only these can be ordered by `rendezvousPair`. */
export type RendezvousOk = Extract<RendezvousResult, { status: "OK" }>;

/** The chosen visiting order for two crew and the later arrival (see `rendezvousPair`). */
export interface RendezvousPair {
  order: [0, 1] | [1, 0];
  later_arrival_s: number;
}

/**
 * Single crew member. `passable` is the `vehiclePassable` mask (haven.ts), indexed on the crew
 * field's 5 m grid; the vehicle field (10 m) is sampled to 5 m inside the function (02 §D.10).
 * The result's paths run from each start to q*. TASK-05b.
 */
export function rendezvous(crew: TimeField, vehicle: TimeField, passable: Uint8Array): RendezvousResult {
  throw new Error("TODO(TASK-05b): not implemented");
}

/**
 * Two crew: choose the vehicle visiting order (2 permutations) that minimises the later arrival
 * (02 §D.10). `vehicleFromA` is the vehicle's field from A's rendezvous point and `vehicleFromB`
 * from B's, so both orders can be costed.
 *
 * Proposed definitions (02 §D.10 is silent; NFR-06 needs them fixed):
 * - `later_arrival_s` is the time at which the vehicle is at the second-visited crew member's
 *   meeting point and that crew member is there too. It is measured from now (the alert) and
 *   excludes ingress.
 * - Tie rule: when both orders give the same `later_arrival_s`, the order is [0, 1].
 * TASK-05b.
 */
export function rendezvousPair(a: RendezvousOk, b: RendezvousOk, vehicleFromA: TimeField, vehicleFromB: TimeField): RendezvousPair {
  throw new Error("TODO(TASK-05b): not implemented");
}
