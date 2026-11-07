/**
 * Crew–vehicle rendezvous (docs/specs/02 §D.10; FR-40). TASK-05b.
 * q* = argmin over cells reachable by both of max(T_crew(q), T_vehicle(q));
 * tie-break: min T_crew, then cell index (NFR-06).
 * Signatures frozen by T05b.01 (contract C15). Positions are working-projection metres.
 */
import type { TimeField } from "./haven";

export type RendezvousResult =
  | { status: "OK"; x_m: number; y_m: number; eta_crew_s: number; eta_vehicle_s: number; crew_path: [number, number][]; vehicle_path: [number, number][] }
  | { status: "NO_RENDEZVOUS" };

/** A rendezvous that exists; only these can be ordered by `rendezvousPair`. */
export type RendezvousOk = Extract<RendezvousResult, { status: "OK" }>;

/**
 * Single crew member. `vehiclePassable` is indexed on the crew field's 5 m grid (from
 * `vehiclePassable` in haven.ts); the vehicle field (10 m) is sampled to 5 m inside the function
 * (02 §D.10). TASK-05b.
 */
export function rendezvous(crew: TimeField, vehicle: TimeField, vehiclePassable: Uint8Array): RendezvousResult {
  throw new Error("TODO(TASK-05b): not implemented");
}

/**
 * Two crew: compute each, then choose the vehicle visiting order (2 permutations) that minimises
 * the later arrival (02 §D.10). `vehicleFromA` is the vehicle's field from A's rendezvous point and
 * `vehicleFromB` from B's, so both orders can be costed. `later_arrival_s` is in seconds. TASK-05b.
 */
export function rendezvousPair(a: RendezvousOk, b: RendezvousOk, vehicleFromA: TimeField, vehicleFromB: TimeField): { order: [0, 1] | [1, 0]; later_arrival_s: number } {
  throw new Error("TODO(TASK-05b): not implemented");
}
