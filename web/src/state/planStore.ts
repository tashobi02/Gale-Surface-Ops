/**
 * Plan state store (docs/specs/03 §E.3 sequence; §C.3 editing). FR-05, FR-06.
 * Holds scenario, waypoints, plan_revision and the latest result; bumps plan_revision on every
 * edit and sends COMPUTE_PLAN to the worker. Single-level undo (FR-06). Implemented by TASK-08.
 */
import type { MissionScenario, PlanResult, Waypoint } from "../types/schema";

export interface PlanState {
  scenario: MissionScenario;
  waypoints: Waypoint[];
  plan_revision: number;
  result: PlanResult | null;
}

export interface PlanStore {
  get(): PlanState;
  setScenario(patch: Partial<MissionScenario>): void;
  setWaypoints(waypoints: Waypoint[]): void;
  undo(): void;
  subscribe(listener: (state: PlanState) => void): () => void;
}

/** Create the store with the given defaults (all defaults are `assumed`, 05 §C). TASK-08. */
export function createPlanStore(initial: PlanState): PlanStore {
  throw new Error("TODO(TASK-08): not implemented");
}
