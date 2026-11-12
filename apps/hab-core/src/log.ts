/**
 * Append-only event log (docs/specs/05 §B, LogEvent; NFR-06, NFR-10). Contract C14, frozen by
 * T22.01; implementation T22.07. One JSON line per event in `var/sessions/<session_id>/session.jsonl`,
 * gap-free `seq` from 1. Each line is the RFC 8785 canonical JSON of the event (05 Session, decided
 * 2026-11-07) followed by "\n", and `log_hash` is the SHA-256 (hex) of the file's bytes, kept as a
 * running hash (02 §A.6 "SHA-256 of the canonical event log"; rule proposed in T22.05).
 * `snapshot-<seq>.json` (every SNAPSHOT_EVERY events, called by the session) plus `meta.json`;
 * resume = latest snapshot + the lines after it.
 *
 * `commands.jsonl` beside it is the command journal (BD-93): one canonical-JSON `CommandJournalLine` per command the session
 * evaluated, appended by the session manager after the command's events are written. It is not part of `log_hash`, the
 * engine never reads it, and `exportCommandList` (replay.ts) turns it into the list a headless replay applies.
 *
 * Writes are synchronous so an event is on disk before its COMMAND_RESULT goes out. Nothing here
 * reads wall-clock time.
 */
import { createHash, type Hash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, logLine, type CommandJournalLine, type LogEvent } from "@marswalk/protocol";
import { logged, type EngineState, type PendingEvent } from "./engine/reducer";

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
  /** Append one line to `commands.jsonl` (the command journal); never touches the log or its hash. */
  journal(line: CommandJournalLine): void;
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

const LOG_FILE = "session.jsonl";
/** The command journal's file name, beside the log (BD-93). */
export const JOURNAL_FILE = "commands.jsonl";
const META_FILE = "meta.json";
const SNAPSHOT_RE = /^snapshot-(\d+)\.json$/;

/** `meta.json`: what resume needs to find the latest snapshot (05 §B; fields proposed in T22.07). */
export interface LogMeta {
  format: "marswalk-session-log";
  version: 1;
  snapshot_every: number;
  latest_snapshot_seq: number | null;
}

class FileEventLog implements EventLog {
  private readonly hasher: Hash;

  constructor(
    private readonly dir: string,
    private readonly events: LogEvent[],
    text: string,
    private latestSnapshot: number | null,
  ) {
    this.hasher = createHash("sha256").update(text, "utf8");
  }

  append(pending: PendingEvent): LogEvent {
    if ("seq" in pending) throw new Error("append: a pending event must not carry a seq");
    const event = logged(pending, this.lastSeq() + 1);
    const line = logLine(event);
    appendFileSync(join(this.dir, LOG_FILE), line, "utf8");
    this.hasher.update(line, "utf8");
    this.events.push(event);
    return event;
  }

  after(seq: number): LogEvent[] {
    // seq is gap-free from 1, so the event with seq n is at index n - 1.
    return this.events.slice(Math.max(0, seq));
  }

  lastSeq(): number {
    return this.events.length;
  }

  hash(): string {
    return this.hasher.copy().digest("hex");
  }

  journal(line: CommandJournalLine): void {
    appendFileSync(join(this.dir, JOURNAL_FILE), `${canonicalJson(line)}\n`, "utf8");
  }

  snapshot(state: EngineState): void {
    const seq = this.lastSeq();
    writeAtomic(join(this.dir, `snapshot-${seq}.json`), `${JSON.stringify(state)}\n`);
    this.latestSnapshot = seq;
    writeMeta(this.dir, seq);
  }
}

/** Write via a temporary file and rename, so a crash never leaves a half-written snapshot. */
function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

function writeMeta(dir: string, latest: number | null): void {
  const meta: LogMeta = { format: "marswalk-session-log", version: 1, snapshot_every: SNAPSHOT_EVERY, latest_snapshot_seq: latest };
  writeAtomic(join(dir, META_FILE), `${JSON.stringify(meta)}\n`);
}

/** Start a new, empty log in `sessionDir` (created if missing). */
export function openLog(sessionDir: string): EventLog {
  mkdirSync(sessionDir, { recursive: true });
  const path = join(sessionDir, LOG_FILE);
  if (existsSync(path) && readFileSync(path, "utf8").length > 0) {
    throw new Error(`openLog: ${path} already has events; use resumeLog`);
  }
  writeFileSync(path, "", "utf8");
  writeFileSync(join(sessionDir, JOURNAL_FILE), "", "utf8");
  writeMeta(sessionDir, null);
  return new FileEventLog(sessionDir, [], "", null);
}

/**
 * Reopen an existing session directory after a restart (NFR-10). A last line without its "\n"
 * (a crash mid-write) is dropped from the file, since it was never acknowledged to any client.
 */
export function resumeLog(sessionDir: string): ResumedLog {
  const path = join(sessionDir, LOG_FILE);
  let text = readFileSync(path, "utf8");
  const end = text.lastIndexOf("\n") + 1;
  if (end !== text.length) {
    text = text.slice(0, end);
    writeFileSync(path, text, "utf8");
  }
  const events = text.length === 0 ? [] : text.slice(0, -1).split("\n").map((line) => JSON.parse(line) as LogEvent);
  events.forEach((e, i) => {
    if (e.seq !== i + 1) throw new Error(`resumeLog: line ${i + 1} has seq ${e.seq}; the log must be gap-free`);
  });

  const latest = latestSnapshotSeq(sessionDir, events.length);
  const state = latest === null ? null : (JSON.parse(readFileSync(join(sessionDir, `snapshot-${latest}.json`), "utf8")) as EngineState);
  const log = new FileEventLog(sessionDir, events, text, latest);
  return { log, state, tail: events.slice(latest ?? 0) };
}

/** The highest snapshot seq on disk that the log reaches (meta.json can lag a crash; files decide). */
function latestSnapshotSeq(dir: string, lastSeq: number): number | null {
  const seqs = readdirSync(dir)
    .map((f) => SNAPSHOT_RE.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .filter((seq) => seq <= lastSeq);
  return seqs.length === 0 ? null : Math.max(...seqs);
}

/** Canonical JSON (RFC 8785) lives in packages/protocol (logHash.ts) so the web replay hashes the same bytes; re-exported here. */
export { canonicalJson };
