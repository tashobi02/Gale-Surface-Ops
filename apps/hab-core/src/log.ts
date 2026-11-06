/**
 * Append-only event log (docs/specs/05 LogEvent; NFR-06). Contract C14, frozen by T22.01;
 * implementation T22.07. One JSON line per event in `var/sessions/<session_id>/session.jsonl`,
 * gap-free `seq`, running SHA-256 over canonical JSON (sorted keys) = `log_hash`.
 * A snapshot every 500 events (U-23) plus `meta.json`; resume = latest snapshot + the lines after it.
 */
import type { LogEvent } from "@marswalk/protocol";
import type { EngineState, PendingEvent } from "./engine/reducer";

/** Events between snapshots (U-23). */
export const SNAPSHOT_EVERY = 500;

export interface EventLog {
  /** Assign the next `seq`, write the line, update the hash. */
  append(event: PendingEvent): LogEvent;
  /** Events with `seq` > `seq`, in order (reconnect replay, `GET /api/log`). */
  after(seq: number): LogEvent[];
  lastSeq(): number;
  hash(): string;
  /** Write `snapshot-<seq>.json` of the reduced state. */
  snapshot(state: EngineState): void;
}

/**
 * Reducing `tail` alone does not restore crew positions, O₂ or dose: they change through ticks and
 * are not logged. resumeSession (T22.12) re-runs ticks from the snapshot's sim_time and applies
 * each tail event at its sim_time, checking that the re-derived events match the tail.
 */
export interface ResumedLog {
  log: EventLog;
  /** Latest snapshot, or null when none was written. */
  state: EngineState | null;
  /** Events after the snapshot, to reduce on top of it. */
  tail: LogEvent[];
}

export function openLog(sessionDir: string): EventLog {
  throw new Error("TODO(TASK-22): T22.07 not implemented");
}

/** Reopen an existing session directory after a restart (NFR-10). T22.07. */
export function resumeLog(sessionDir: string): ResumedLog {
  throw new Error("TODO(TASK-22): T22.07 not implemented");
}

/** Canonical JSON used for hashing: sorted keys, no whitespace. T22.07. */
export function canonicalJson(value: unknown): string {
  throw new Error("TODO(TASK-22): T22.07 not implemented");
}
