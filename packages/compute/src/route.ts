/**
 * Least-time route search on the 8-connected 5 m grid (docs/specs/02 §D.2; ADR-004).
 * FR-06, FR-07, FR-10; NFR-02 (≤ 2 s for a 3-stop loop), NFR-06 (deterministic).
 * Implemented by TASK-05.
 */
import type { Leg, MissionScenario, NoRouteReason } from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";

/** Limits from 02 §D.2. */
export const MAX_STOPS = 10;
export const SNAP_RADIUS_M = 50;
export const MAX_NODE_EXPANSIONS = 3_000_000;

/** Result of one leg search, before profile/time post-processing. */
export type LegSearch =
  | { status: "OK"; cells: number[] }
  | { status: "NO_ROUTE"; reason: NoRouteReason; nearest_reachable: { x_m: number; y_m: number } }
  | { status: "TIMEOUT" };

/**
 * Least-time path between two points. Input: start/end metres, scenario limits.
 * Output: unsimplified cell path or NO_ROUTE with reason and nearest reachable cell. TASK-05.
 */
export function searchLeg(
  grid: LoadedGrid,
  from: { x_m: number; y_m: number },
  to: { x_m: number; y_m: number },
  scenario: MissionScenario,
): LegSearch {
  throw new Error("TODO(TASK-05): not implemented");
}

/**
 * Nearest passable cell within SNAP_RADIUS_M, or null (02 §D.2 "Snapping"). TASK-05.
 */
export function snapToPassable(grid: LoadedGrid, x_m: number, y_m: number, scenario: MissionScenario): { x_m: number; y_m: number; distance_m: number } | null {
  throw new Error("TODO(TASK-05): not implemented");
}

/**
 * Build a 05 Leg from a search result (Douglas–Peucker 2 m for display geometry only;
 * metrics on the unsimplified path). TASK-05.
 */
export function toLeg(grid: LoadedGrid, fromId: string, toId: string, search: LegSearch, scenario: MissionScenario): Leg {
  throw new Error("TODO(TASK-05): not implemented");
}
