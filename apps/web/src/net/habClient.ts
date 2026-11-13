/**
 * WebSocket client for the Hab Core (docs/specs/02 §E.6; FR-31, FR-32, NFR-01, NFR-13). T20.06.
 * EVA and ops views read this store and never open their own socket.
 *
 * Store API (contract for T24.03, T25.01):
 *   const hab = connectHab({ role, clientId, displayName });  // connects to /ws on the page's own host
 *   hab.state()     → Snapshot | null: the last SNAPSHOT with every newer STATE_DELTA applied
 *   hab.events()    → LogEvent[]: EVENTs received since that SNAPSHOT, in seq order, no duplicates
 *   hab.lastSeq()   → the highest seq applied (sent as `last_seq` on reconnect)
 *   hab.linkLost()  → {lost, since_ms}: "HAB LINK LOST" (SCR-18) after LINK_LOST_AFTER_MS without
 *                     any server message (PINGs arrive every HEARTBEAT_MS); since_ms is client time
 *   hab.takenOver() → boolean: a newer device took this role over (TAKEN_OVER, 02 §E.4). The client then stops: no
 *                     reconnect, no link-lost watchdog, queued and later commands resolve as rejected; its last values stay
 *   hab.send({kind, args}) → Promise<CommandResult>; resolves on the matching COMMAND_RESULT
 *   hab.subscribe(listener) → unsubscribe; called after every store change
 *   hab.close()
 *
 * `state()` returns a new object whenever it changes (deltas are applied by copying along the
 * path), so React views can compare by reference (useSyncExternalStore).
 *
 * Rules: messages apply in seq order (older STATE_DELTAs are ignored; an EVENT already in the feed is
 * ignored); reconnect with backoff 0.5 s → 1 s cap (NFR-13), reset after a successful open. On
 * reconnect the server sends a fresh SNAPSHOT, then the EVENTs after `last_seq` (SNAPSHOT only if
 * the gap is > 1,000; decision of 2026-11-07, 02 §E.6): the SNAPSHOT replaces `state()` and keeps
 * `events()` (unless its `session.session_id` differs from the previous one: a new session clears `events()`); replayed EVENTs at or below the SNAPSHOT's seq join `events()` (sorted, no duplicates)
 * without changing `state()` or `lastSeq()`. A command sent
 * while the socket is down, or rejected NO_LINK, stays queued and is resent once with
 * `queued_offline: true` (on reconnect, or on LINK_STATE linked=true for this suit). No hard-coded
 * or external host: the default URL is the page's own host (NFR-01). Path syntax for deltas:
 * "crew/EV1/x_m" — array items are matched by their `*_id` field.
 *
 * In-flight commands retain their id on reconnect; the Hab Core deduplicates by client/id (FD-088).
 */
import {
  LINK_LOST_AFTER_MS,
  PROTOCOL_VERSION,
  type ClientMessage,
  type Command,
  type CommandResult,
  type LogEvent,
  type Role,
  type ServerMessage,
  type Snapshot,
} from "@marswalk/protocol";

/** The subset of the browser WebSocket the client uses (lets tests inject a fake). */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
}

export interface HabClientOptions {
  role: Role;
  clientId: string;
  displayName: string;
  /** Default `ws://<page host>/ws`. */
  url?: string;
  socketFactory?: (url: string) => SocketLike;
}

export interface HabClient {
  readonly role: Role;
  state(): Snapshot | null;
  events(): LogEvent[];
  lastSeq(): number;
  linkLost(): { lost: boolean; since_ms: number | null };
  /** True once the Hab Core told this client a newer device took its role (02 §E.4); final for this client. */
  takenOver(): boolean;
  /** Optional for older read-only adapters; live clients report the actual socket, before the watchdog expires. */
  socketConnected?(): boolean;
  /** Number of reconnect attempts (the initial connection is not a retry). */
  reconnectCount?(): number;
  send(command: Pick<Command, "kind" | "args">): Promise<CommandResult>;
  subscribe(listener: () => void): () => void;
  close(): void;
}

const SOCKET_OPEN = 1;
const BACKOFF_START_MS = 500;
/** NFR-13: reconnect restores correct state <= 2 s, so no retry waits longer than 1 s. */
const BACKOFF_MAX_MS = 1000;

interface Pending {
  message: Extract<ClientMessage, { type: "COMMAND" }>;
  resolve: (r: CommandResult) => void;
  /** true once the command must be (re)sent flagged queued_offline. */
  queued: boolean;
  /** true while a copy is on the wire awaiting its result. */
  inFlight: boolean;
}

/** Lower-case hex of `bytes` random bytes (crypto.getRandomValues also exists on a LAN page that is not a secure context). */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function connectHab(options: HabClientOptions): HabClient {
  const { role, clientId, displayName } = options;
  const loc = globalThis.location;
  const url = options.url ?? `${loc?.protocol === "https:" ? "wss" : "ws"}://${loc?.host ?? "localhost"}/ws`;
  const factory = options.socketFactory ?? ((u: string) => new WebSocket(u) as unknown as SocketLike);
  const suit = role.startsWith("eva:") ? role.slice(4) : null;

  let snapshot: Snapshot | null = null;
  let events: LogEvent[] = [];
  let seq = 0;
  let lost = false;
  let lastHeardMs = Date.now();
  let attempts = 0;
  let openedOnce = false;
  let lostSince: number | null = null;
  let socket: SocketLike | null = null;
  let backoff = BACKOFF_START_MS;
  let closed = false;
  let takenOver = false;
  let commandCounter = 0;
  // Per-connection nonce: the Hab Core dedupes by (client_id, command_id), so a client that restarts its counter (reload,
  // role change, duplicated tab) must not repeat an id. Client-side only; a resend within this connection keeps its id.
  const nonce = randomHex(4);
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<string, Pending>();
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const l of listeners) {
      try {
        l();
      } catch (err) {
        console.error(err); // one broken view must not stop the others
      }
    }
  };

  /** Armed from the start and after every close, so a link that never comes up is reported too. */
  function armWatchdog(): void {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (closed || takenOver) return;
      lost = true;
      lostSince = lastHeardMs;
      notify();
      // A half-open socket may never fire onclose: close it so the reconnect loop starts.
      socket?.close();
    }, Math.max(0, lastHeardMs + LINK_LOST_AFTER_MS - Date.now()));
  }

  function heard(): void {
    lastHeardMs = Date.now();
    if (lost) {
      lost = false;
      lostSince = null;
      notify();
    }
    armWatchdog();
  }

  function scheduleReconnect(): void {
    if (closed) return;
    reconnectTimer = setTimeout(open, backoff);
    backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
  }

  function open(): void {
    if (closed || takenOver) return;
    reconnectTimer = null;
    if (openedOnce) attempts += 1;
    openedOnce = true;
    notify();
    let s: SocketLike;
    try {
      s = factory(url);
    } catch (err) {
      console.error(err);
      scheduleReconnect();
      return;
    }
    socket = s;
    s.onopen = () => {
      backoff = BACKOFF_START_MS;
      write({ v: PROTOCOL_VERSION, type: "HELLO", role, client_id: clientId, display_name: displayName, last_seq: seq });
      notify();
      flush();
    };
    s.onmessage = (ev) => {
      if (closed || takenOver) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data) as ServerMessage;
      } catch {
        return;
      }
      if (socket !== s) return;
      heard();
      apply(msg);
    };
    s.onclose = () => {
      if (socket !== s) return;
      socket = null;
      for (const p of pending.values()) if (p.inFlight) Object.assign(p, { inFlight: false, queued: true });
      if (closed || takenOver) return;
      notify();
      scheduleReconnect();
    };
  }

  function write(msg: ClientMessage): boolean {
    if (!socket || socket.readyState !== SOCKET_OPEN) return false;
    socket.send(JSON.stringify(msg));
    return true;
  }

  /** Send every queued command once, flagged queued_offline. */
  function flush(): void {
    for (const p of pending.values()) {
      if (!p.queued || p.inFlight) continue;
      const resend = { ...p.message, command: { ...p.message.command, queued_offline: true } };
      if (write(resend)) Object.assign(p, { inFlight: true, queued: false });
    }
  }

  function apply(msg: ServerMessage): void {
    switch (msg.type) {
      case "SNAPSHOT":
        // The event feed is kept across a reconnect (the replay after it fills any gap, T20.13), but a SNAPSHOT of another
        // session (LOAD_SCENARIO) restarts seq: the old feed goes, or its seq numbers would hide the new session's events.
        if (snapshot && snapshot.session.session_id !== msg.session.session_id) events = [];
        snapshot = msg;
        seq = msg.seq;
        break;
      case "STATE_DELTA": {
        if (!snapshot || msg.seq < seq) return;
        snapshot = applyStateDelta(snapshot, msg.changes);
        seq = msg.seq;
        break;
      }
      case "EVENT":
        if (events.some((e) => e.seq === msg.seq)) return; // duplicate
        events = insertBySeq(events, msg.event);
        // A replayed EVENT at or below the SNAPSHOT's seq joins the feed and leaves seq alone.
        if (msg.seq > seq) seq = msg.seq;
        break;
      case "LINK_STATE":
        // A NO_LINK result arriving after linked=true waits for the next LINK_STATE or reconnect
        // (no immediate resend, so a disagreeing server cannot cause a resend loop).
        if (msg.crew_id === suit && msg.linked) flush();
        return;
      case "COMMAND_RESULT": {
        const p = pending.get(msg.command_id);
        if (!p) return;
        p.inFlight = false;
        if (!msg.ok && msg.code === "NO_LINK") {
          p.queued = true; // resent on LINK_STATE linked=true (02 §E.6)
          return;
        }
        pending.delete(msg.command_id);
        p.resolve(msg);
        return;
      }
      case "TAKEN_OVER":
        if (msg.role !== role) return;
        stopTakenOver();
        break;
      case "PING":
        return;
    }
    notify();
  }

  /** Final: a newer device holds the role. Nothing is sent or retried from here, so the two devices cannot fight. */
  function stopTakenOver(): void {
    takenOver = true;
    if (watchdog) clearTimeout(watchdog);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    lost = false;
    lostSince = null;
    for (const [id, p] of pending) p.resolve(failed(id, "Taken over by another device"));
    pending.clear();
    socket?.close(); // the Hab Core closes it too; this covers a socket it left open
  }

  function failed(command_id: string, message: string): CommandResult {
    return { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id, ok: false, code: "BUSY", message };
  }

  armWatchdog();
  open();

  return {
    role,
    state: () => snapshot,
    events: () => events,
    lastSeq: () => seq,
    linkLost: () => ({ lost, since_ms: lostSince }),
    takenOver: () => takenOver,
    socketConnected: () => socket?.readyState === SOCKET_OPEN,
    reconnectCount: () => attempts,
    send(command) {
      if (closed) return Promise.resolve(failed("", "client closed"));
      if (takenOver) return Promise.resolve(failed("", "Taken over by another device"));
      const command_id = `${clientId}-${nonce}-k${++commandCounter}`;
      const message: Pending["message"] = { v: PROTOCOL_VERSION, type: "COMMAND", command_id, role, command: { kind: command.kind, args: command.args } };
      return new Promise<CommandResult>((resolve) => {
        const p: Pending = { message, resolve, queued: false, inFlight: false };
        pending.set(command_id, p);
        if (write(message)) p.inFlight = true;
        else p.queued = true;
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      closed = true;
      if (watchdog) clearTimeout(watchdog);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      for (const [id, p] of pending) p.resolve(failed(id, "client closed"));
      pending.clear();
      listeners.clear();
    },
  };
}

/** Insert `event` keeping seq order; the common case (newest) appends. */
function insertBySeq(list: LogEvent[], event: LogEvent): LogEvent[] {
  if (list.length === 0 || list[list.length - 1].seq < event.seq) return [...list, event];
  const i = list.findIndex((e) => e.seq > event.seq);
  return [...list.slice(0, i), event, ...list.slice(i)];
}

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** The id field of each addressable list in the SNAPSHOT (mirrors apps/hab-core/src/stateDelta.ts ID_FIELD). */
const LIST_ID_FIELD: Record<string, string> = {
  crew: "crew_id",
  vehicles: "vehicle_id",
  alerts: "alert_id",
  options: "option_id",
  tasks: "task_id",
  queue: "message_id",
  clients: "client_id",
};

/**
 * Return a copy of `node` with `value` at `parts`, copying only the objects along the path.
 * Array items are matched by the list's own id field (`list` is the name the array sits under, e.g. "options" →
 * `option_id`), never by another `*_id` such as an option's `alert_id`. An unresolvable path leaves the node
 * unchanged (and logs it).
 */
function withPath(node: unknown, parts: string[], value: unknown, list = ""): unknown {
  const [key, ...rest] = parts;
  if (key === undefined || FORBIDDEN_KEYS.has(key)) return node;
  if (Array.isArray(node)) {
    const idField = LIST_ID_FIELD[list];
    const i = idField === undefined ? -1 : node.findIndex((item) => item && typeof item === "object" && (item as Record<string, unknown>)[idField] === key);
    if (i < 0 || rest.length === 0) {
      console.warn(`habClient: no item ${key} for delta`);
      return node;
    }
    const copy = node.slice();
    copy[i] = withPath(node[i], rest, value, "");
    return copy;
  }
  if (node !== null && typeof node === "object") {
    const record = node as Record<string, unknown>;
    return { ...record, [key]: rest.length === 0 ? value : withPath(record[key], rest, value, key) };
  }
  console.warn(`habClient: delta path ends at a non-object (${key})`);
  return node;
}

/**
 * The one STATE_DELTA applicator (02 §E.6), shared by the live client and the recorded replay (net/replaySource.ts):
 * a copy of `snapshot` with every change applied. A delta without `changes`, or a change without a string path, changes
 * nothing; an unresolvable path leaves the snapshot unchanged and logs it.
 */
export function applyStateDelta(snapshot: Snapshot, changes: readonly { path: string; value: unknown }[] | undefined): Snapshot {
  let next: Snapshot = snapshot;
  for (const change of Array.isArray(changes) ? changes : []) {
    if (!change || typeof change.path !== "string") continue;
    next = withPath(next, change.path.split("/"), change.value) as Snapshot;
  }
  return next;
}
