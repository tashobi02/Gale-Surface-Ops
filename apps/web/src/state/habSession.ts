/**
 * Hab session store: one Hab Core connection per browser tab, and the React hooks that read it
 * (docs/specs/02 §E.6; 01 FR-32, FR-33; 03 SCR-12, SCR-13, SCR-14, SCR-18). Registered under T25.01.
 *
 * `startHabSession` opens the tab's single `connectHab` per role (EVA tablet and HUD of one crew member share
 * `eva:EV1`, for example); calling it again with the same role returns the same client. The hooks subscribe to the
 * client with `useSyncExternalStore`, so a view re-renders on every new SNAPSHOT, STATE_DELTA, EVENT or link change
 * without being remounted. This module computes nothing: it passes the client's data through.
 *
 * Each hook takes an optional `client`: `undefined` means the tab's current session, `null` means "no connection"
 * (the view shows "—"), and a client means that client (tests and the ops console, which are handed one).
 */
import { useCallback, useSyncExternalStore } from "react";
import { PROTOCOL_VERSION, type Command, type CommandResult, type LogEvent, type Snapshot } from "@marswalk/protocol";
import { connectHab, type HabClient, type HabClientOptions } from "../net/habClient";

const sessions = new Map<string, HabClient>();
let current: HabClient | null = null;
const currentListeners = new Set<() => void>();

function setCurrent(client: HabClient | null): void {
  current = client;
  for (const l of currentListeners) l();
}

/**
 * Opens the tab's connection for `options.role`, or returns the one already open for that role. The most recently
 * started session is the tab's current one (what the hooks read when given no client).
 */
export function startHabSession(options: HabClientOptions): HabClient {
  const existing = sessions.get(options.role);
  if (existing) {
    if (current !== existing) setCurrent(existing);
    return existing;
  }
  const client = connectHab(options);
  sessions.set(options.role, client);
  setCurrent(client);
  return client;
}

/** The tab's current client, or null before `startHabSession`. */
export function currentHabClient(): HabClient | null {
  return current;
}

/** Closes every connection of this tab (page teardown and tests). */
export function closeHabSessions(): void {
  for (const client of sessions.values()) client.close();
  sessions.clear();
  setCurrent(null);
}

// ---------------------------------------------------------------------------
// Per-client derived state
// ---------------------------------------------------------------------------

type LinkLost = ReturnType<HabClient["linkLost"]>;

/**
 * Remembers what `useSyncExternalStore` needs to see as stable references: the event feed of the current session
 * and the link-lost value. The tracker subscribes to its client for the client's whole life, so it notices a
 * session change at the SNAPSHOT that carries it, before the new session's first EVENT arrives.
 */
class Tracker {
  private sessionId: string | null = null;
  private readonly stale = new WeakSet<LogEvent>();
  private source: LogEvent[] | null = null;
  private feed: LogEvent[] = [];
  private link: LinkLost = { lost: false, since_ms: null };

  constructor(private readonly client: HabClient) {
    client.subscribe(() => this.observe());
  }

  /** A SNAPSHOT of another session ends the old one: its events leave the feed (a reconnect keeps the session id). */
  private observe(): void {
    const id = this.client.state()?.session.session_id ?? null;
    if (id === null) return;
    if (this.sessionId !== null && id !== this.sessionId) {
      for (const event of this.client.events()) this.stale.add(event);
      this.source = null; // the cached feed no longer matches
    }
    this.sessionId = id;
  }

  events(): LogEvent[] {
    this.observe();
    const source = this.client.events();
    if (source !== this.source) {
      this.source = source;
      this.feed = source.filter((event) => !this.stale.has(event));
    }
    return this.feed;
  }

  linkLost(): LinkLost {
    const next = this.client.linkLost();
    if (next.lost !== this.link.lost || next.since_ms !== this.link.since_ms) this.link = { lost: next.lost, since_ms: next.since_ms };
    return this.link;
  }
}

const trackers = new WeakMap<HabClient, Tracker>();

function trackerOf(client: HabClient): Tracker {
  let tracker = trackers.get(client);
  if (!tracker) {
    tracker = new Tracker(client);
    trackers.set(client, tracker);
  }
  return tracker;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function subscribeCurrent(listener: () => void): () => void {
  currentListeners.add(listener);
  return () => currentListeners.delete(listener);
}

/** The client a view should read: the one it was given, `null` for "none", or the tab's current session. */
export function useHabClient(client?: HabClient | null): HabClient | null {
  const tabClient = useSyncExternalStore(subscribeCurrent, currentHabClient, currentHabClient);
  return client === undefined ? tabClient : client;
}

const NEVER = (): (() => void) => () => {};
const NO_EVENTS: LogEvent[] = [];
const NOT_LOST: LinkLost = { lost: false, since_ms: null };

function useClientStore<T>(client: HabClient | null, read: (client: HabClient) => T, empty: T): T {
  const subscribe = useCallback((listener: () => void) => (client ? client.subscribe(listener) : NEVER()), [client]);
  const get = useCallback(() => (client ? read(client) : empty), [client, read, empty]);
  return useSyncExternalStore(subscribe, get, get);
}

const readSnapshot = (client: HabClient): Snapshot | null => client.state();
const readEvents = (client: HabClient): LogEvent[] => trackerOf(client).events();
const readLink = (client: HabClient): LinkLost => trackerOf(client).linkLost();

/** The last SNAPSHOT with every newer STATE_DELTA applied; null before the first SNAPSHOT. A new object per change. */
export function useSnapshot(client?: HabClient | null): Snapshot | null {
  return useClientStore(useHabClient(client), readSnapshot, null);
}

/** EVENTs of the current session in seq order. Append-only; a SNAPSHOT of a new session empties it. */
export function useEvents(client?: HabClient | null): LogEvent[] {
  return useClientStore(useHabClient(client), readEvents, NO_EVENTS);
}

/** "HAB LINK LOST" state of this tab's connection (SCR-18); `since_ms` is client time. */
export function useLinkLost(client?: HabClient | null): LinkLost {
  return useClientStore(useHabClient(client), readLink, NOT_LOST);
}

/** What `useCommand` resolves when there is no connection to send on. */
function noConnection(): CommandResult {
  return { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: "", ok: false, code: "BUSY", message: "No Hab Core connection" };
}

/**
 * A function that sends a command and resolves the Hab Core's own result. A rejection is returned as `ok: false` with
 * the server's `code` and `message`, never swallowed and never turned into success; with no connection it resolves a
 * rejection too, so a caller has one path to handle.
 */
export function useCommand(client?: HabClient | null): (command: Pick<Command, "kind" | "args">) => Promise<CommandResult> {
  const hab = useHabClient(client);
  return useCallback(
    async (command) => {
      if (!hab) return noConnection();
      try {
        return await hab.send(command);
      } catch (err) {
        return { ...noConnection(), message: err instanceof Error ? err.message : "Command failed" };
      }
    },
    [hab],
  );
}
