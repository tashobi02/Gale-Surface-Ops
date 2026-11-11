/**
 * Boot of the Hab Core connection (docs/specs/02 §E.6; 03 §A; 01 FR-31, FR-32; T07.03, T25.01).
 *
 * `ensureSessionForRoute` is what app boot calls before a live route renders: it opens the tab's connection for the
 * route's role (ops, or eva:<crew> for both the EVA tablet and the HUD), through `startHabSession`, and closes any
 * connection of another role, so a tab keeps one. A route with no role (join, planner, report, ...) opens nothing and
 * leaves an open connection alone, so going to the report and back does not reconnect.
 *
 * The client id is per tab (sessionStorage), so a reload keeps its identity; it is random, never derived from a person.
 */
import type { HabClient, HabClientOptions } from "../net/habClient";
import { closeHabSessionsExcept, startHabSession } from "../state/habSession";
import type { Route } from "../ui/router";

const CLIENT_ID_KEY = "marswalk.client_id";

/** Lower-case hex of `bytes` random bytes (crypto.getRandomValues also works on a LAN page that is not a secure context). */
function randomId(bytes = 8): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return `c-${[...buf].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** The tab's client id: stored on first use; still a fresh id when storage is missing or refuses. */
export function clientIdFor(storage: Storage | null): string {
  try {
    const stored = storage?.getItem(CLIENT_ID_KEY);
    if (stored) return stored;
  } catch {
    // storage refused: fall through to a fresh id
  }
  const id = randomId();
  try {
    storage?.setItem(CLIENT_ID_KEY, id);
  } catch {
    // not stored: the id lasts for this call only
  }
  return id;
}

/** What the ops client list shows for this device. */
export function displayNameFor(route: Route): string {
  if (route.id === "ops") return "Ops console";
  if (route.id === "eva" && route.crewId) return `${route.crewId} tablet`;
  if (route.id === "hud" && route.crewId) return `${route.crewId} HUD`;
  return route.id;
}

export interface SessionBootDeps {
  /** Default: the page's own host (NFR-01). */
  url?: HabClientOptions["url"];
  socketFactory?: HabClientOptions["socketFactory"];
  /** Default: `sessionStorage` when the page has one. */
  storage?: Storage | null;
}

function pageStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** The connection for `route`, opened if needed; null when the route needs none. */
export function ensureSessionForRoute(route: Route, deps: SessionBootDeps = {}): HabClient | null {
  if (!route.role) return null;
  closeHabSessionsExcept(route.role);
  const options: HabClientOptions = {
    role: route.role,
    clientId: clientIdFor(deps.storage === undefined ? pageStorage() : deps.storage),
    displayName: displayNameFor(route),
  };
  if (deps.url) options.url = deps.url;
  if (deps.socketFactory) options.socketFactory = deps.socketFactory;
  return startHabSession(options);
}
