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
 * Open points for the product & systems lead:
 * - TODO(verify): a command in flight when the socket drops is resent flagged `queued_offline`; it
 *   may already have run. The Hab Core should ignore a repeated `command_id` (T23.02).
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
  let lostSince: number | null = null;
  let socket: SocketLike | null = null;
  let backoff = BACKOFF_START_MS;
  let closed = false;
  let commandCounter = 0;
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
      if (closed) return;
      lost = true;
      lostSince = Date.now();
      notify();
      // A half-open socket may never fire onclose: close it so the reconnect loop starts.
      socket?.close();
    }, LINK_LOST_AFTER_MS);
  }

  function heard(): void {
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
      armWatchdog();
      flush();
    };
    s.onmessage = (ev) => {
      if (closed) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data) as ServerMessage;
      } catch {
        return;
      }
      heard();
      apply(msg);
    };
    s.onclose = () => {
      if (socket !== s) return;
      socket = null;
      for (const p of pending.values()) if (p.inFlight) Object.assign(p, { inFlight: false, queued: true });
      if (closed) return;
      if (!lost) armWatchdog();
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
        let next: Snapshot = snapshot;
        for (const change of msg.changes) next = withPath(next, change.path.split("/"), change.value) as Snapshot;
        snapshot = next;
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
      case "PING":
        return;
    }
    notify();
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
    send(command) {
      if (closed) return Promise.resolve(failed("", "client closed"));
      const command_id = `${clientId}-k${++commandCounter}`;
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

/**
 * Return a copy of `node` with `value` at `parts`, copying only the objects along the path.
 * Array items are matched by any `*_id` field equal to the segment. An unresolvable path leaves
 * the node unchanged (and logs it).
 */
function withPath(node: unknown, parts: string[], value: unknown): unknown {
  const [key, ...rest] = parts;
  if (key === undefined || FORBIDDEN_KEYS.has(key)) return node;
  if (Array.isArray(node)) {
    const i = node.findIndex((item) => item && typeof item === "object" && Object.entries(item).some(([k, v]) => k.endsWith("_id") && v === key));
    if (i < 0 || rest.length === 0) {
      console.warn(`habClient: no item ${key} for delta`);
      return node;
    }
    const copy = node.slice();
    copy[i] = withPath(node[i], rest, value);
    return copy;
  }
  if (node !== null && typeof node === "object") {
    const record = node as Record<string, unknown>;
    return { ...record, [key]: rest.length === 0 ? value : withPath(record[key], rest, value) };
  }
  console.warn(`habClient: delta path ends at a non-object (${key})`);
  return node;
}
