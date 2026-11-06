/**
 * TASK_ROVER handler for the utility rover (docs/specs/01 FR-41; 02 §E.4, §E.6). TASK-29.
 * Goal-level tasks SCOUT, CARRY, RELAY, RETURN: the rover routes itself, battery is its consumable,
 * tasks queue and show ETA. RELAY parks the rover so it extends L-surf coverage (FR-42).
 *
 * Reuse, no new compute module: routing via `searchLeg` / `snapToPassable` in
 * packages/compute/src/route.ts; relay coverage via `viewshed` (viewshed.ts) and `linkStates`
 * (linkGraph.ts). Sim time only, never wall-clock (NFR-06).
 */
import type { Command, CommandResult, LogEvent, TaskRoverArgs } from "@marswalk/protocol";
import type { EngineState } from "./engine/reducer";

export type { TaskRoverArgs };

/** Validate and queue a TASK_ROVER command. Called by handleCommand after the role check. TASK-29. */
export function handleTaskRover(state: EngineState, command: Command): { result: CommandResult; events: Omit<LogEvent, "seq">[] } {
  throw new Error("TODO(TASK-29): not implemented");
}
