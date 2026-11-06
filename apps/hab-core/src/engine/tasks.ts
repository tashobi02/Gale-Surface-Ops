/**
 * Stop task engine (docs/specs/01 FR-50; 05 StopTask; 02 §E.6).
 * Stub created by T22.01 (contract C14); owner T31.04 (TASK-31, Anjim Hossain). Pure; sim time only, never wall-clock (NFR-06).
 * EVA roles may update only their own tasks or crew_id null (02 §E.4 "own tasks").
 */
import type { Command, LogEvent } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { CommandOutcome, EngineState, PendingEvent } from "./reducer";
import type { TickContext, TickResult } from "./tick";

/** TASK_ADDED events seeded from `scenario.stop_tasks` at session load. Called by session.ts (T22.12) after SESSION_LOADED. */
export function seedTasks(scenario: LoadedScenario): PendingEvent[] {
  throw new Error("TODO(TASK-31): T31.04 not implemented");
}

/** UPDATE_STOP_TASK: "own tasks" check; log TASK_UPDATED. */
export function handleUpdateStopTask(state: EngineState, scenario: LoadedScenario, command: Command): CommandOutcome {
  throw new Error("TODO(TASK-31): T31.04 not implemented");
}

/** ADD_STOP_TASK (ops): log TASK_ADDED with origin `ops`. */
export function handleAddStopTask(state: EngineState, scenario: LoadedScenario, command: Command): CommandOutcome {
  throw new Error("TODO(TASK-31): T31.04 not implemented");
}

/** After PLAN_REVISED: TASK_DROPPED (actor `system`) for open tasks at dropped stops. Called by session.ts (T22.12) after it appends a PLAN_REVISED. */
export function onPlanRevised(state: EngineState, revised: LogEvent): PendingEvent[] {
  throw new Error("TODO(TASK-31): T31.04 not implemented");
}

/** At the end of each dwell the simulated crew member's open tasks become DONE. */
export function tasksTick(state: EngineState, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-31): T31.04 not implemented");
}

/** Reducer case for TASK_ADDED / TASK_UPDATED / TASK_DROPPED; called by reduce (T22.06). */
export function reduceTaskEvent(state: EngineState, event: LogEvent): EngineState {
  throw new Error("TODO(TASK-31): T31.04 not implemented");
}
