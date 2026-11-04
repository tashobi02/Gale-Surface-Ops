/**
 * Time to safe haven (docs/specs/02 §D.8; FR-39). Pure, deterministic; sim time in seconds.
 * TASK-05b.
 */
import type { MissionScenario, ParamSet } from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";

/** A full-grid travel-time field: seconds per cell, Infinity where unreachable. */
export interface TimeField {
  cell_m: number;
  width: number;
  height: number;
  seconds: Float64Array;
}

/**
 * Reverse Dijkstra from the hab entrance over the suited cost (v1 D.2 step cost with the
 * gradient sign flipped, because travel is toward the hab). One field per plan. TASK-05b.
 */
export function habTimeField(grid: LoadedGrid, hab: { x_m: number; y_m: number }, scenario: MissionScenario): TimeField {
  throw new Error("TODO(TASK-05b): not implemented");
}

/**
 * Forward Dijkstra from a vehicle's position over its own cost (02 §D.9), on a 10 m aggregate
 * grid for speed. TASK-05b.
 */
export function vehicleTimeField(grid: LoadedGrid, from: { x_m: number; y_m: number }, params: ParamSet): TimeField {
  throw new Error("TODO(TASK-05b): not implemented");
}

/** Bounded suited Dijkstra from a crew position, stopped at `limit_s` (≈ 50 k expansions). TASK-05b. */
export function crewTimeField(grid: LoadedGrid, from: { x_m: number; y_m: number }, scenario: MissionScenario, limit_s: number): TimeField {
  throw new Error("TODO(TASK-05b): not implemented");
}

/**
 * Planning approximation along a route, every 50 m: min(T_hab, min over q within 300 m of
 * max(walk(p,q), T_veh(q))) + ingress. Labelled `modelled (approximation)`. TASK-05b.
 */
export function havenAlongRoute(
  samples: { x_m: number; y_m: number }[],
  hab: TimeField,
  vehicle: TimeField | null,
  scenario: MissionScenario,
  ingress_s: number,
): number[] {
  throw new Error("TODO(TASK-05b): not implemented");
}
