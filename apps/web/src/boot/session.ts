/**
 * Boot of the Hab Core connection (docs/specs/02 §E.6; 03 §A; 01 FR-31, FR-32; T07.03, T25.01).
 *
 * `ensureSessionForRoute` is what app boot calls before a live route renders: it opens the tab's connection for the
 * route's role (ops, eva:<crew> for the EVA tablet, or the read-only hud:<crew> for the HUD, 02 §E.4), through `startHabSession`, and closes any
 * connection of another role, so a tab keeps one. A route with no role (join, planner, report, ...) opens nothing and
 * leaves an open connection alone, so going to the report and back does not reconnect.
 *
 * The client id is random and per page load, never derived from a person and never stored.
 */
import type { HabClient, HabClientOptions } from "../net/habClient";
import { closeHabSessionsExcept, startHabSession } from "../state/habSession";
import type { Route } from "../ui/router";

/** Lower-case hex of `bytes` random bytes (crypto.getRandomValues also works on a LAN page that is not a secure context). */
function randomId(bytes = 8): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return `c-${[...buf].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * One client id per page load, made on first use. It is deliberately not stored: sessionStorage is copied into a
 * duplicated tab, and two live tabs must never share an id (the Hab Core keys its command dedupe and client list on it).
 * Command ids carry their own per-connection nonce as well (net/habClient.ts).
 */
export function createClientIdSource(): () => string {
  let id: string | null = null;
  return () => (id ??= randomId());
}

const pageClientId = createClientIdSource();

/** This page load's client id (what the open connection's HELLO carries). */
export const ownClientId = (): string => pageClientId();

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
  /** Default: this page load's id. */
  clientId?: () => string;
}

/** The connection for `route`, opened if needed; null when the route needs none. */
export function ensureSessionForRoute(route: Route, deps: SessionBootDeps = {}): HabClient | null {
  if (!route.role) return null;
  closeHabSessionsExcept(route.role);
  const options: HabClientOptions = {
    role: route.role,
    clientId: (deps.clientId ?? pageClientId)(),
    displayName: displayNameFor(route),
  };
  if (deps.url) options.url = deps.url;
  if (deps.socketFactory) options.socketFactory = deps.socketFactory;
  return startHabSession(options);
}
