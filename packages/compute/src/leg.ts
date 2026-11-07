/**
 * Leg post-processing and metric aggregation (docs/specs/02 §D.2; 05 Leg).
 * FR-07, FR-08. Implemented by TASK-05 (T05.21).
 */
import type { Leg, MissionScenario } from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";
import type { LegSearch } from "./route";

/**
 * Build a 05 Leg entity from a search result:
 * - Unsimplified cell path used for accurate slope, climb, descent, and distance metrics.
 * - Douglas–Peucker simplification (2 m tolerance) applied to geometry for display only.
 * - Computes walking duration using the walking-time model (timeModel.ts).
 */
export function toLeg(
  grid: LoadedGrid,
  fromId: string,
  toId: string,
  search: LegSearch,
  scenario: MissionScenario,
): Leg {
  throw new Error("TODO(TASK-05): not implemented");
}
