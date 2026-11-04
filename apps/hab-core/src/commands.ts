/**
 * Command validation and dispatch (docs/specs/02 §E.4 permissions, §E.6 results; FR-31).
 * Checks role (PERMISSIONS), simulated surface link (NO_LINK), state (BUSY, INVALID), then turns the
 * command into LogEvents via the engine. Commands are never logged themselves. TASK-23.
 */
import type { Command, CommandResult, LogEvent } from "@marswalk/protocol";
import type { EngineState } from "./engine/reducer";

export function handleCommand(state: EngineState, command: Command): { result: CommandResult; events: Omit<LogEvent, "seq">[] } {
  throw new Error("TODO(TASK-23): not implemented");
}
