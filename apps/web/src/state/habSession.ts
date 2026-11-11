/**
 * Hab session store: one Hab Core connection per browser tab, and the React hooks that read it
 * (docs/specs/02 §E.6; 01 FR-32, FR-33; 03 SCR-12, SCR-13, SCR-14, SCR-18). Registered under T25.01.
 *
 * `startHabSession` opens the tab's single `connectHab` per role (the EVA tablet is `eva:EV1` and the HUD its own
 * `hud:EV1`, for example); calling it again with the same role returns the same client. The hooks subscribe to the
 * client with `useSyncExternalStore`, so a view re-renders on every new SNAPSHOT, STATE_DELTA, EVENT or link change
 * without being remounted. This module computes nothing: it passes the client's data through.
 *
 * App boot (boot/session.ts) calls `startHabSession` for the route's role and crew member before an ops, EVA or HUD
 * route renders, and `closeHabSessionsExcept` so a tab keeps one connection. Before the first SNAPSHOT the hooks read
 * `null` and the screens show "—".
 *
 * A client the Hab Core told "taken over" (02 §E.4) is final: `useTakenOver` reads it, and `startHabSession` for that role
 * opens a fresh connection (a deliberate return through the join screen), never revives the dead client.
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
  let existing = sessions.get(options.role);
  if (existing?.takenOver()) {
    existing.close();
    sessions.delete(options.role);
    existing = undefined;
  }
  if (existing) {
    if (current !== existing) setCurrent(existing);
    return existing;
  }
  const client = connectHab(options);
  trackerOf(client); // created with the session, so no view creates it lazily during a render
  sessions.set(options.role, client);
  setCurrent(client);
  return client;
}

/** True when the Hab Core took `role` over from this tab's connection (02 §E.4). */
export function isTakenOver(role: HabClientOptions["role"]): boolean {
  return sessions.get(role)?.takenOver() ?? false;
}

/** The tab's current client, or null before `startHabSession`. */
export function currentHabClient(): HabClient | null {
  return current;
}

/**
 * Closes every connection of this tab except the one for `keep` (a tab keeps one Hab Core connection, 03 §A). The kept
 * session, if open, becomes the current one. With `keep` null every connection closes.
 */
export function closeHabSessionsExcept(keep: string | null): void {
  for (const [role, client] of [...sessions]) {
    if (role === keep) continue;
    client.close();
    sessions.delete(role);
  }
  const kept = keep ? (sessions.get(keep) ?? null) : null;
  if (current !== kept) setCurrent(kept);
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
 * Keeps what `useSyncExternalStore` needs as stable references: the link-lost value (the client returns a new object
 * per call). The event feed is the client's own: it clears it when a SNAPSHOT of another session arrives.
 */
class Tracker {
  private link: LinkLost = { lost: false, since_ms: null };

  constructor(private readonly client: HabClient) {}

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
const readEvents = (client: HabClient): LogEvent[] => client.events();
const readLink = (client: HabClient): LinkLost => trackerOf(client).linkLost();
const readTakenOver = (client: HabClient): boolean => client.takenOver();

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

/** True once a newer device took this tab's role over (02 §E.4); the connection is then final. */
export function useTakenOver(client?: HabClient | null): boolean {
  return useClientStore(useHabClient(client), readTakenOver, false);
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
