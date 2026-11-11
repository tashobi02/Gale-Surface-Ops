/**
 * Stops and waypoints list component for the plan panel (FR-06, SCR-04).
 * Stub for T08.05 (React component, C10 v2).
 */
import type { ReactElement } from "react";
import type { PlanStore } from "../../state/planStore";

export interface StopsListProps {
  planStore: PlanStore;
}

export function StopsList(props: StopsListProps): ReactElement {
  throw new Error("TODO(T08.05): StopsList not implemented");
}
