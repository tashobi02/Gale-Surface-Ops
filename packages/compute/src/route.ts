/**
 * Least-time route search on the 8-connected 5 m grid (docs/specs/02 §D.2; ADR-004).
 * FR-06, FR-07, FR-10; NFR-02 (≤ 2 s for a 3-stop loop), NFR-06 (deterministic).
 * Implemented by TASK-05 (T05.18).
 */
import type { MissionScenario, NoRouteReason } from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";

/** Limits from 02 §D.2. */
export const MAX_STOPS = 10;
export const MAX_NODE_EXPANSIONS = 3_000_000;

/** Result of one leg search, before profile/time post-processing. */
export type LegSearch =
  | { status: "OK"; cells: number[] }
  | { status: "NO_ROUTE"; reason: NoRouteReason; nearest_reachable: { x_m: number; y_m: number } }
  | { status: "TIMEOUT" };

/**
 * Least-time path between two points. Input: start/end metres, scenario limits.
 * Output: unsimplified cell path or NO_ROUTE with reason and nearest reachable cell. TASK-05.
 *
 * TODO(decision): Optional maxExpansions or AbortSignal injection for cooperative
 * cancellation testing (coordination map open points 5 & C7).
 */
export function searchLeg(
  grid: LoadedGrid,
  from: { x_m: number; y_m: number },
  to: { x_m: number; y_m: number },
  scenario: MissionScenario,
  maxExpansions = MAX_NODE_EXPANSIONS,
): LegSearch {
  throw new Error("TODO(TASK-05): not implemented");
}
