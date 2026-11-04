/**
 * Session manager (docs/specs/05 §C.2 Session; FR-30, FR-34). Owns the authoritative state:
 * loads a scenario, holds the reducer state, applies commands through commands.ts, appends to the
 * log, and resumes from disk after a restart. TASK-22.
 */
import type { Command, LogEvent, Scenario, Snapshot } from "@marswalk/protocol";

export interface SessionHandle {
  snapshot(): Snapshot;
  apply(command: Command): { ok: true; events: LogEvent[] } | { ok: false; code: string; message: string };
  advance(dt_sim_s: number): LogEvent[];
  eventsAfter(seq: number): LogEvent[];
}

/** Validate (05 §E.7) and load a scenario into a new session. TASK-22. */
export function loadSession(scenario: Scenario, dataDir: string, varDir: string): SessionHandle {
  throw new Error("TODO(TASK-22): not implemented");
}

/** Resume from `session.jsonl` + latest snapshot. TASK-22. */
export function resumeSession(sessionDir: string): SessionHandle {
  throw new Error("TODO(TASK-22): not implemented");
}
