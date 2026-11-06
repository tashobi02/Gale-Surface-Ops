/**
 * Event-sourced state (docs/specs/02 §A.6): state = fold(events) over the scenario's initial state.
 * Pure; the same events always give the same state (NFR-06). TASK-22.
 */
import type { Alert, ContingencyOption, Crew, EarthMessage, LogEvent, Session, StopTask, Vehicle } from "@marswalk/protocol";

export interface EngineState {
  session: Session;
  crew: Crew[];
  vehicles: Vehicle[];
  alerts: Alert[];
  options: ContingencyOption[];
  /** Reduced from TASK_ADDED / TASK_UPDATED / TASK_DROPPED only (05 StopTask, FR-50). TASK-31. */
  tasks: StopTask[];
  earthQueue: EarthMessage[];
}

export function reduce(state: EngineState, event: LogEvent): EngineState {
  throw new Error("TODO(TASK-22): not implemented");
}
