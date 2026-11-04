/**
 * Crew–vehicle rendezvous (docs/specs/02 §D.10; FR-40). TASK-05b.
 * q* = argmin over cells reachable by both of max(T_crew(q), T_vehicle(q));
 * tie-break: min T_crew, then cell index (NFR-06).
 */
import type { TimeField } from "./haven";

export type RendezvousResult =
  | { status: "OK"; x_m: number; y_m: number; eta_crew_s: number; eta_vehicle_s: number; crew_path: [number, number][]; vehicle_path: [number, number][] }
  | { status: "NO_RENDEZVOUS" };

/** Single crew member. TASK-05b. */
export function rendezvous(crew: TimeField, vehicle: TimeField, vehiclePassable: Uint8Array): RendezvousResult {
  throw new Error("TODO(TASK-05b): not implemented");
}

/**
 * Two crew: compute each, then choose the vehicle visiting order (2 permutations) that minimises
 * the later arrival. TASK-05b.
 */
export function rendezvousPair(a: RendezvousResult, b: RendezvousResult, vehicleFromFirst: TimeField): { order: [0, 1] | [1, 0]; total_s: number } {
  throw new Error("TODO(TASK-05b): not implemented");
}
