/**
 * Append-only event log (docs/specs/05 §B session store, LogEvent; NFR-06). One JSON line per
 * event, gap-free `seq`, running SHA-256 over canonical JSON (sorted keys) = `log_hash`.
 * Snapshot every 500 events (U-23). TASK-22.
 */
import type { LogEvent } from "@marswalk/protocol";

export interface EventLog {
  append(event: Omit<LogEvent, "seq">): LogEvent;
  after(seq: number): LogEvent[];
  hash(): string;
}

export function openLog(sessionDir: string): EventLog {
  throw new Error("TODO(TASK-22): not implemented");
}

/** Canonical JSON used for hashing: sorted keys, no whitespace. TASK-22. */
export function canonicalJson(value: unknown): string {
  throw new Error("TODO(TASK-22): not implemented");
}
