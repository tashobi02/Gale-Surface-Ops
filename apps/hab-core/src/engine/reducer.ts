/**
 * Event-sourced state (docs/specs/02 §A.6): state = fold(events) over the scenario's initial state.
 * Pure; the same events always give the same state (NFR-06). Contract C14, frozen by T22.01;
 * implementation T22.06. TASK_* cases are delegated to `./tasks` (T31.04).
 *
 * Nothing under src/engine/ reads wall-clock time (NFR-06): time is `session.clock.sim_time`.
 */
import type {
  Alert,
  CommandResult,
  ContingencyOption,
  Crew,
  EarthMessage,
  LinkState,
  LogEvent,
  PlanExport,
  Session,
  StopTask,
  Vehicle,
} from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { ConditionsState } from "./conditions";

export interface EngineState {
  session: Session;
  /** Current plan; replaced on PLAN_REVISED (02 §E.6 SNAPSHOT `plan`). */
  plan: PlanExport | null;
  crew: Crew[];
  vehicles: Vehicle[];
  alerts: Alert[];
  options: ContingencyOption[];
  /** Reduced from TASK_ADDED / TASK_UPDATED / TASK_DROPPED only (05 StopTask, FR-50). TASK-31. */
  tasks: StopTask[];
  /** Surface link graph, recomputed each tick for mobile nodes (05 LinkState). TASK-26. */
  links: LinkState[];
  /** Earth link status for SNAPSHOT `earth` (02 §E.6). TASK-26. */
  earth: { light_time_s: number; next_pass_utc: string | null; blackout: boolean };
  earthQueue: EarthMessage[];
  /** FR-36 conditions feed values. TASK-22 (T22.16). */
  conditions: ConditionsState;
}

/** A LogEvent before the log assigns its `seq`. */
export type PendingEvent = Omit<LogEvent, "seq">;

/** What a command handler returns; commands.ts (T23.02) answers COMMAND_RESULT from it. */
export interface CommandOutcome {
  result: CommandResult;
  events: PendingEvent[];
}

/** One STATE_DELTA change; path syntax "crew/EV1/x_m" (02 §E.6). */
export interface StateChange {
  path: string;
  value: unknown;
}

/** State at `scenario.start_utc` before any event: crew in the hab, vehicles at their starts. T22.06. */
export function initialState(scenario: LoadedScenario, session_id: string): EngineState {
  throw new Error("TODO(TASK-22): T22.06 not implemented");
}

/** Apply one logged event. TASK_* events go to `reduceTaskEvent` (T31.04). T22.06. */
export function reduce(state: EngineState, event: LogEvent): EngineState {
  throw new Error("TODO(TASK-22): T22.06 not implemented");
}
