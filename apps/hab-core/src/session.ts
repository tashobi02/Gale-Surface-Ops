/**
 * Session manager (docs/specs/05 §C.2 Session; FR-30, FR-34). Contract C14, frozen by T22.01;
 * implementation T22.12. Owns the authoritative state: loads a scenario (LOAD_SCENARIO →
 * SESSION_LOADED), runs clock → tick → append → reduce each step, applies commands through
 * commands.ts (T23.02), and resumes from disk after a restart (NFR-10).
 *
 * The server (T20.04) converts real elapsed time into sim steps and calls `advance`; the session
 * and engine never read wall-clock time (NFR-06).
 */
import type { Command, CommandResult, LogEvent, Snapshot } from "@marswalk/protocol";
import type { StateChange } from "./engine/reducer";
import type { LoadedScenario } from "./scenario";

export interface SessionHandle {
  /** Full state for SNAPSHOT and `GET /api/session`; the server supplies the connected clients. */
  snapshot(clients: Snapshot["clients"]): Snapshot;
  /** Validate and apply one command; exactly one COMMAND_RESULT per command (02 §E.6). */
  apply(command: Command): { result: CommandResult; events: LogEvent[] };
  /** Run `steps` fixed 1-s sim steps; events go out immediately, deltas are coalesced by the server. */
  advance(steps: number): { events: LogEvent[]; deltas: StateChange[] };
  /** Logged events after `seq` (reconnect, 02 §E.6). */
  eventsAfter(seq: number): LogEvent[];
}

/** Load a validated scenario into a new session under `varDir/sessions/<session_id>/`. T22.12. */
export function loadSession(scenario: LoadedScenario, varDir: string): SessionHandle {
  throw new Error("TODO(TASK-22): T22.12 not implemented");
}

/** Resume from `session.jsonl` + the latest snapshot, re-running ticks (see ResumedLog) (NFR-10). T22.12. */
export function resumeSession(sessionDir: string, scenario: LoadedScenario): SessionHandle {
  throw new Error("TODO(TASK-22): T22.12 not implemented");
}
