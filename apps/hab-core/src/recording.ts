/**
 * The recording of a headless run for the Pages replay (docs/plan/backend/01-contract.md §7; BD-105, BD-121; T27.05 server half).
 * It collects the messages a connected client would have seen, in the order the live server sends them
 * (server.ts `publish`): the SNAPSHOT of the loaded session first, then for every step the EVENTs it logged, and one STATE_DELTA per
 * sim second, last value per path, carrying the log's `seq` at that second. Pure: no clock, no randomness, no file access
 * (the CLI writes the file), so the same run gives the same bytes (NFR-06).
 *
 * The driver (replay.ts) calls `begin` with the first SNAPSHOT, `record` after every 1-s step and every command, and
 * `end` with the final `log_hash`; a command that replaces the session (RESET_SESSION) ends the recording with `recordClosing`.
 */
import { canonicalJson, type EventMessage, type LogEvent, type Recording, type Snapshot, type StateDelta } from "@marswalk/protocol";
import { PROTOCOL_VERSION } from "@marswalk/protocol";
import type { StateChange } from "./engine/reducer";
import { diffSnapshots } from "./stateDelta";

export class RecordingCollector {
  private readonly messages: Recording["messages"] = [];
  private meta: { scenario_id: string; seed: number; data_version: string } | null = null;
  private log_hash: string | null = null;
  /** The changes of the sim second in progress, last value per path in first-change order. */
  private pending = new Map<string, unknown>();
  private pendingTime: string | null = null;
  private lastSeq = 0;
  /** The window of `period_s` sim seconds the pending changes belong to, counted from the first SNAPSHOT's sim time. */
  private pendingWindow = 0;
  private t0_ms = 0;

  /**
   * `period_s` is how many sim seconds one STATE_DELTA spans (default 1: one per sim second, as the live server sends them).
   * A longer period coalesces the changes of the window (last value per path) and keeps a long run's file small (BD-148).
   */
  constructor(private readonly period_s: number = 1) {
    if (!Number.isInteger(period_s) || period_s < 1) throw new Error(`RecordingCollector: the delta period must be a whole number of seconds, at least 1 (got ${period_s})`);
  }

  /**
   * The first message: the SNAPSHOT of the session as loaded (no connected clients). `logged` is the log the snapshot already
   * reflects (SESSION_LOADED and the seeded tasks, seq 1 to `snapshot.seq`): its EVENTs follow the SNAPSHOT at once, so the
   * recording's EVENTs are the whole log and hash to `log_hash` (N-81, BD-148). A SNAPSHOT is never "after" its own events,
   * so a viewer that applies the EVENTs in order only lists them.
   */
  begin(snapshot: Snapshot, logged: readonly LogEvent[] = []): void {
    if (this.messages.length > 0) throw new Error("RecordingCollector.begin: already begun");
    if (logged.some((e, i) => e.seq !== i + 1 || e.seq > snapshot.seq) || (logged.length > 0 && logged.length !== snapshot.seq)) {
      throw new Error(`RecordingCollector.begin: the logged events must be seq 1..${snapshot.seq} of the snapshot`);
    }
    this.meta = { scenario_id: snapshot.session.scenario_id, seed: snapshot.session.seed, data_version: snapshot.session.data_version };
    this.lastSeq = snapshot.seq;
    this.t0_ms = Date.parse(snapshot.sim_time);
    this.messages.push({ ...snapshot, clients: [] });
    this.pushEvents(logged);
    this.lastSeq = snapshot.seq;
  }

  /** What one step or one command did: its events, and the state change between the snapshots before and after it. */
  record(before: Snapshot, after: Snapshot, events: readonly LogEvent[], tickChanges: readonly StateChange[] = []): void {
    this.requireBegun();
    // A new window of `period_s` sim seconds closes the previous one: its delta goes out before this window's events.
    const window = Math.floor((Date.parse(after.sim_time) - this.t0_ms) / (this.period_s * 1000));
    if (this.pendingTime !== null && window !== this.pendingWindow) this.flush();
    this.pushEvents(events);
    for (const c of [...tickChanges, ...diffSnapshots(before, after)]) {
      this.pending.delete(c.path);
      this.pending.set(c.path, c.value);
    }
    this.pendingTime = after.sim_time;
    this.pendingWindow = window;
  }

  /**
   * The events of a command that replaced the session (RESET_SESSION): the old session's closing events only. The new session
   * restarts `seq`, which a delta cannot express, so the recording stops here (the live server sends a fresh SNAPSHOT instead).
   */
  recordClosing(events: readonly LogEvent[]): void {
    this.requireBegun();
    this.flush();
    this.pushEvents(events);
  }

  /** Close the recording with the final `log_hash` of the run. */
  end(log_hash: string): void {
    this.requireBegun();
    this.flush();
    this.log_hash = log_hash;
  }

  finish(): Recording {
    if (this.meta === null || this.log_hash === null) throw new Error("RecordingCollector.finish: the run has not begun and ended");
    return { format: "marswalk-recording", version: 1, ...this.meta, log_hash: this.log_hash, label: "replayed recording", messages: this.messages };
  }

  private pushEvents(events: readonly LogEvent[]): void {
    for (const event of events) {
      const message: EventMessage = { v: PROTOCOL_VERSION, type: "EVENT", seq: event.seq, sim_time: event.sim_time, event };
      this.messages.push(message);
      this.lastSeq = event.seq;
    }
  }

  private flush(): void {
    if (this.pendingTime !== null && this.pending.size > 0) {
      const delta: StateDelta = {
        v: PROTOCOL_VERSION,
        type: "STATE_DELTA",
        seq: this.lastSeq,
        sim_time: this.pendingTime,
        changes: [...this.pending].map(([path, value]) => ({ path, value })),
      };
      this.messages.push(delta);
    }
    this.pending = new Map();
    this.pendingTime = null;
  }

  private requireBegun(): void {
    if (this.meta === null) throw new Error("RecordingCollector: call begin first");
  }
}

/** The recording file: canonical JSON (RFC 8785) and a newline, so one run always gives the same bytes. */
export function recordingJson(recording: Recording): string {
  return `${canonicalJson(recording)}\n`;
}
