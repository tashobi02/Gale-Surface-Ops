/**
 * Read-only HabClient backed by a recorded server message stream (T27.05; FR-34, FR-46; N-21).
 *
 * - State: the recording's first SNAPSHOT, then its STATE_DELTAs through the live client's own applicator
 *   (`applyStateDelta`, habClient.ts), and its EVENTs in order. Nothing is computed here.
 * - Pacing: `advanceTo(simMs)` applies every message whose `sim_time` is at or before `simMs` and notifies once, so the
 *   route paces playback by sim time; `step()` applies one message.
 * - Verification (`hashCheck()`): the hash covers the recorded EVENTs only (the log, 05 Session). The state on screen is
 *   replayed from the recorded SNAPSHOT and deltas and is not covered by it. `verified` when the events are the whole
 *   log (seq 1..n) and their hash equals `log_hash`; `mismatch` keeps both hashes; `incomplete` when the events are not
 *   the whole log; `unverifiable` when there is no recorded hash or hashing failed.
 * - Commands are refused (`FORBIDDEN_ROLE`, "Read-only replay"); no request is made.
 */
import { logHashOf, PROTOCOL_VERSION, type LogEvent, type Recording, type Snapshot } from "@marswalk/protocol";
import { sha256Hex } from "../export/sha256";
import { applyStateDelta, type HabClient } from "./habClient";

export type HashStatus = "verified" | "mismatch" | "incomplete" | "unverifiable";

export interface HashCheck {
  status: HashStatus;
  /** The recording's `log_hash`; null when it has none. */
  recorded: string | null;
  /** SHA-256 of the recorded events' log lines; null when not computed (incomplete log or hashing failed). */
  computed: string | null;
  /** Why the status is what it is, in words. */
  reason: string;
}

export interface ReplayPosition {
  /** Messages applied so far, the initial SNAPSHOT included. */
  index: number;
  total: number;
  /** Sim time of the last applied message. */
  simTime: string | null;
}

export interface ReplaySource extends HabClient {
  /** Applies the next message (one notification). */
  step(): void;
  /** Applies every message with sim_time <= `simMs` (one notification when any applied); returns how many. */
  advanceTo(simMs: number): number;
  /** Sim time (ms) of the next message; null at the end. */
  nextSimTimeMs(): number | null;
  reset(): void;
  playbackState(): "playing" | "ended";
  position(): ReplayPosition;
  hashCheck(): HashCheck;
}

export const READ_ONLY_REASON = "Read-only replay";

/** SHA-256 hex: WebCrypto when the page has it (secure context), else the pure-TS digest (http:// LAN origin). */
export async function replaySha256(text: string): Promise<string> {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (!subtle) return sha256Hex(text);
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isValid(recording: unknown): recording is Recording {
  if (!recording || typeof recording !== "object") return false;
  const r = recording as Partial<Recording>;
  return r.format === "marswalk-recording" && r.version === 1 && Array.isArray(r.messages) && r.messages[0]?.type === "SNAPSHOT";
}

async function checkHash(recording: Recording, events: LogEvent[], sha: (text: string) => string | Promise<string>): Promise<HashCheck> {
  const recorded = typeof recording.log_hash === "string" && recording.log_hash !== "" ? recording.log_hash : null;
  if (recorded === null) return { status: "unverifiable", recorded, computed: null, reason: "the recording has no log hash" };
  if (!events.every((e, i) => e.seq === i + 1)) {
    return { status: "incomplete", recorded, computed: null, reason: "the recorded events are not the whole log (seq 1..n)" };
  }
  let computed: string;
  try {
    computed = await logHashOf(events, sha);
  } catch (err) {
    return { status: "unverifiable", recorded, computed: null, reason: `hashing failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  return computed === recorded
    ? { status: "verified", recorded, computed, reason: "the recorded events hash to the recorded log hash" }
    : { status: "mismatch", recorded, computed, reason: "the recorded events do not hash to the recorded log hash" };
}

export async function createReplaySource(recording: Recording, sha: (text: string) => string | Promise<string> = replaySha256): Promise<ReplaySource> {
  if (!isValid(recording)) throw new Error("Invalid recording");
  const messages = recording.messages;
  const initial = messages[0] as Snapshot;
  const hash = await checkHash(recording, messages.flatMap((m) => (m.type === "EVENT" ? [m.event] : [])), sha);
  let snapshot: Snapshot = initial;
  let events: LogEvent[] = [];
  let index = 1;
  let seq = initial.seq;
  let simTime: string | null = initial.sim_time ?? null;
  const listeners = new Set<() => void>();
  const notify = (): void => { for (const listener of listeners) listener(); };

  /** Applies messages[index] without notifying. */
  const apply = (): void => {
    const message = messages[index++];
    if (!message) return;
    if (typeof message.sim_time === "string") simTime = message.sim_time;
    if (message.type === "EVENT") {
      events = [...events, message.event];
      seq = Math.max(seq, message.seq);
    } else if (message.type === "STATE_DELTA") {
      const next = applyStateDelta(snapshot, message.changes);
      snapshot = { ...next, ...(typeof message.sim_time === "string" ? { sim_time: message.sim_time } : {}), seq: Math.max(next.seq, message.seq) };
      seq = Math.max(seq, message.seq);
    } else if (message.type === "SNAPSHOT") {
      snapshot = message;
      seq = message.seq;
    }
  };
  const nextSimTimeMs = (): number | null => {
    const next = messages[index];
    if (!next) return null;
    const t = Date.parse(next.sim_time);
    return Number.isFinite(t) ? t : null;
  };

  return {
    role: "ops",
    state: () => snapshot,
    events: () => events,
    lastSeq: () => seq,
    linkLost: () => ({ lost: false, since_ms: null }),
    takenOver: () => false,
    send: async () => ({ v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: "", ok: false, code: "FORBIDDEN_ROLE", message: READ_ONLY_REASON }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    close: () => { listeners.clear(); },
    playbackState: () => (index >= messages.length ? "ended" : "playing"),
    position: () => ({ index, total: messages.length, simTime }),
    hashCheck: () => hash,
    nextSimTimeMs,
    reset: () => {
      snapshot = initial;
      events = [];
      index = 1;
      seq = initial.seq;
      simTime = initial.sim_time ?? null;
      notify();
    },
    step: () => {
      if (index >= messages.length) return;
      apply();
      notify();
    },
    advanceTo: (simMs) => {
      let applied = 0;
      // A message without a readable sim_time goes with the one before it, so playback never stalls on it.
      while (index < messages.length) {
        const t = nextSimTimeMs();
        if (t !== null && t > simMs) break;
        apply();
        applied++;
      }
      if (applied > 0) notify();
      return applied;
    },
  };
}
