/** Read-only HabClient backed by a recorded stream (T27.05, FR-34). */
import { logHashOf, PROTOCOL_VERSION, type LogEvent, type Recording, type Snapshot } from "@marswalk/protocol";
import type { HabClient } from "./habClient";

export interface ReplaySource extends HabClient {
  step(): void;
  reset(): void;
  playbackState(): "playing" | "ended";
  verifiedHash(): string | null;
}

const ids: Record<string, string> = { crew: "crew_id", vehicles: "vehicle_id", alerts: "alert_id", options: "option_id", tasks: "task_id", queue: "message_id", clients: "client_id" };
function withPath(node: unknown, parts: string[], value: unknown, list = ""): unknown {
  const [key, ...rest] = parts;
  if (!key || ["__proto__", "prototype", "constructor"].includes(key)) return node;
  if (Array.isArray(node)) {
    const field = ids[list];
    const i = field ? node.findIndex((item) => item && typeof item === "object" && (item as Record<string, unknown>)[field] === key) : -1;
    if (i < 0 || !rest.length) return node;
    const next = node.slice();
    next[i] = withPath(node[i], rest, value);
    return next;
  }
  if (!node || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;
  return { ...record, [key]: rest.length ? withPath(record[key], rest, value, key) : value };
}

export async function createReplaySource(recording: Recording, sha: (text: string) => string | Promise<string>): Promise<ReplaySource> {
  if (recording.format !== "marswalk-recording" || recording.version !== 1 || recording.messages[0]?.type !== "SNAPSHOT") throw new Error("Invalid recording");
  const initial = recording.messages[0];
  const recordedEvents = recording.messages.flatMap((m) => m.type === "EVENT" ? [m.event] : []);
  const complete = recordedEvents.every((e, i) => e.seq === i + 1);
  const computed = complete ? await logHashOf(recordedEvents, sha) : null;
  const verified = computed === recording.log_hash ? computed : null;
  let snapshot: Snapshot = initial;
  let events: LogEvent[] = [];
  let index = 1;
  let seq = initial.seq;
  const listeners = new Set<() => void>();
  const notify = (): void => { for (const listener of listeners) listener(); };
  return {
    role: "ops",
    state: () => snapshot,
    events: () => events,
    lastSeq: () => seq,
    linkLost: () => ({ lost: false, since_ms: null }),
    takenOver: () => false,
    send: async () => ({ v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: "", ok: false, code: "FORBIDDEN_ROLE", message: "Recording is read-only" }),
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    close: () => { listeners.clear(); },
    playbackState: () => index >= recording.messages.length ? "ended" : "playing",
    verifiedHash: () => verified,
    reset: () => { snapshot = initial; events = []; index = 1; seq = initial.seq; notify(); },
    step: () => {
      const message = recording.messages[index++];
      if (!message) { index = recording.messages.length; return; }
      if (message.type === "EVENT") { events = [...events, message.event]; seq = Math.max(seq, message.seq); }
      if (message.type === "STATE_DELTA") {
        for (const change of message.changes) snapshot = withPath(snapshot, change.path.split("/"), change.value) as Snapshot;
        snapshot = { ...snapshot, sim_time: message.sim_time, seq: message.seq };
        seq = Math.max(seq, message.seq);
      }
      if (message.type === "SNAPSHOT") { snapshot = message; seq = message.seq; }
      notify();
    },
  };
}
