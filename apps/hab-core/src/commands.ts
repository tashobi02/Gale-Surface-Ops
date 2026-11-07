/**
 * Command validation and dispatch (docs/specs/02 §E.4 permissions, §E.6 results; 05 Command; FR-31).
 * Checks role (PERMISSIONS plus the "self" rules), simulated surface link (NO_LINK), args (INVALID)
 * and state (BUSY), in that order, then turns the command into LogEvents. Commands are never logged
 * themselves. TASK-23 (T23.01 tests, T23.02 implementation).
 *
 * FR-50 (TASK-31): UPDATE_STOP_TASK → TASK_UPDATED, ADD_STOP_TASK → TASK_ADDED. An EVA role may
 * update only tasks whose crew_id is its own or null ("own tasks", 02 §E.4); PERMISSIONS cannot
 * express that, so this module checks it. TASK_ROVER is delegated to ./rover (FR-41, TASK-29).
 *
 * Signature widened 2026-11-07 (T23.02; contract C14, owner of this file and of its only caller,
 * session.ts T22.12): the handler needs the scenario, the issuing client, the next seq and the
 * accepted-command memory (05 Command dedupe rule).
 */
import type { Command, CommandResult, LogEvent } from "@marswalk/protocol";
import type { CommandOutcome, EngineState } from "./engine/reducer";
import type { LoadedScenario } from "./scenario";

export interface CommandContext {
  scenario: LoadedScenario;
  /** The connection that sent the command; with `command_id` it forms the `command_ref`. */
  client_id: string;
  /** The seq the log will give the first event of this command (for `event_seq` and `a-<seq>` ids). */
  next_seq: number;
  accepted: AcceptedCommands;
}

/** Work only the session manager can do (T22.12): replace the session, or run to the next event. */
export type SessionEffect = { kind: "load"; scenario_id: string } | { kind: "jump" };

export interface HandledCommand extends CommandOutcome {
  effect?: SessionEffect;
}

/** Accepted `(client_id, command_id)` → its first COMMAND_RESULT (05 Command, decided 2026-11-07). */
export class AcceptedCommands {
  get(client_id: string, command_id: string): CommandResult | undefined {
    throw new Error("TODO(TASK-23): T23.02 not implemented");
  }

  /** Remember an accepted result; rejected results are ignored, so the command may be retried. */
  record(client_id: string, command_id: string, result: CommandResult): void {
    throw new Error("TODO(TASK-23): T23.02 not implemented");
  }

  /** Rebuild from the log after a restart: every event with a `command_ref` except COMMAND_REJECTED. */
  static fromLog(events: readonly LogEvent[]): AcceptedCommands {
    throw new Error("TODO(TASK-23): T23.02 not implemented");
  }
}

export function handleCommand(state: EngineState, command: Command, ctx: CommandContext): HandledCommand {
  throw new Error("TODO(TASK-23): T23.02 not implemented");
}
