/**
 * Hash router: the one table of routes (docs/specs/03 §A; 04 §B.2 for the mode of each; 01 FR-01, FR-16, FR-30).
 * Owner: T07.03 (taken over by Sadman Shaharier Mahim, 11 Nov). Screens never edit this table.
 *
 * Pure: no DOM, no network, no clock. `parseHash` turns `location.hash` into a `Route`; anything it does not know is the
 * `unknown` route (a safe "—" screen, never a throw and never a guess at what was meant).
 *
 * `role` is the Hab Core connection role a route needs, or null for a route that opens none. The EVA tablet is
 * `eva:<crew>` and the HUD is its own read-only `hud:<crew>` (02 §E.4); a tab keeps one connection, so going from one to the
 * other closes the first (boot/session.ts). The planner, join,
 * report, briefing and sources routes open none: the planner works without a Hab Core, join and report only fetch.
 * SCR-16 (earth) is not built, so it opens none either. SCR-19 (presenter) opens the `presenter` role and SCR-20 (setup) the
 * `ops` role; T32.23 (package 22) owns this table and may restate both entries.
 */
import type { CrewId, Role } from "@marswalk/protocol";

/** HTML mode of a route (`<html data-mode>`, 04 §B.2). */
export type RouteMode = "brief" | "ops" | "hud" | "print";

export type RouteId =
  | "landing"
  | "join"
  | "planner"
  | "briefing"
  | "sources"
  | "ops"
  | "setup"
  | "report"
  | "eva"
  | "hud"
  | "earth"
  | "presenter"
  | "replay"
  | "unknown";

export interface RouteEntry {
  id: Exclude<RouteId, "unknown">;
  /** Path after `#/`; "" is the landing page. */
  path: string;
  /** Screen id in 03 §B, or "—" for a route without one (replay mode). */
  screen: string;
  mode: RouteMode;
  /** True when the path takes a crew member (`/EV1`, `/EV2`). */
  crew?: true;
  /** Role of the Hab Core connection the route needs; null = none. */
  role: "ops" | "eva" | "hud" | "earth" | "presenter" | null;
}

/** 03 §A, in the order it lists them. */
export const ROUTES: readonly RouteEntry[] = [
  { id: "landing", path: "", screen: "SCR-01", mode: "brief", role: null },
  { id: "join", path: "join", screen: "SCR-10", mode: "brief", role: null },
  { id: "planner", path: "planner", screen: "SCR-02", mode: "ops", role: null },
  { id: "briefing", path: "briefing", screen: "SCR-08", mode: "print", role: null },
  { id: "ops", path: "ops", screen: "SCR-11", mode: "ops", role: "ops" },
  { id: "setup", path: "setup", screen: "SCR-20", mode: "ops", role: "ops" },
  { id: "report", path: "report", screen: "SCR-17", mode: "print", role: null },
  { id: "eva", path: "eva", screen: "SCR-12", mode: "ops", crew: true, role: "eva" },
  { id: "hud", path: "hud", screen: "SCR-13", mode: "hud", crew: true, role: "hud" },
  { id: "earth", path: "earth", screen: "SCR-16", mode: "ops", role: "earth" },
  { id: "presenter", path: "presenter", screen: "SCR-19", mode: "ops", role: "presenter" },
  { id: "sources", path: "sources", screen: "SCR-09", mode: "brief", role: null },
  { id: "replay", path: "replay", screen: "—", mode: "ops", role: null },
];

const CREW_IDS: readonly CrewId[] = ["EV1", "EV2"];
/** Roles a join link (`#/join?role=…`) may name: exactly the protocol's `Role` values a device can take. */
const JOIN_ROLES: readonly Role[] = ["planner", "ops", "eva:EV1", "eva:EV2", "hud:EV1", "hud:EV2", "earth", "presenter"];
/** SCR-09 anchors are layer, source and parameter ids: letters, digits, `_` and `-`. */
const ANCHOR = /^[A-Za-z0-9_-]{1,80}$/;
/** A route path is plain ASCII segments; the length cap keeps hostile input out of every later step. */
const MAX_HASH_LENGTH = 200;

export interface Route {
  id: RouteId;
  /** Screen id (03 §B), or null for the unknown route. */
  screen: string | null;
  mode: RouteMode;
  /** Canonical hash of this route (`#/map` canonicalises to `#/planner`). */
  hash: string;
  /** The hash as it was asked for. */
  requested: string;
  /** True when `requested` was an alias that was replaced (`#/map`). */
  redirected: boolean;
  crewId?: CrewId;
  /** Hab Core connection role this route needs; null = none. */
  role: Role | null;
  /** SCR-09 deep link anchor (`#/sources#layer-slope`). */
  anchor?: string;
  query: Record<string, string>;
  /** `#/join?role=` when it names a role a device can take. */
  joinRole?: Role;
}

const UNKNOWN_BASE = { id: "unknown", screen: null, mode: "brief", hash: "#/", redirected: false, role: null, query: {} } as const;

function unknown(requested: string): Route {
  return { ...UNKNOWN_BASE, requested, query: {} };
}

/** The canonical hash of a route id (and crew member, where the route takes one). */
export function routeHash(id: Exclude<RouteId, "unknown">, crewId?: CrewId): string {
  const entry = ROUTES.find((r) => r.id === id);
  if (!entry) return "#/";
  return entry.crew && crewId ? `#/${entry.path}/${crewId}` : `#/${entry.path}`;
}

/** Parses `location.hash`. Never throws. */
export function parseHash(hash: string): Route {
  const requested = typeof hash === "string" ? hash : "";
  if (requested.length > MAX_HASH_LENGTH) return unknown(requested.slice(0, MAX_HASH_LENGTH));

  // "#/sources#layer-slope": the second "#" starts the anchor. A "?" starts the query of the path part.
  const body = requested.startsWith("#") ? requested.slice(1) : requested;
  if (body !== "" && !body.startsWith("/")) return unknown(requested);
  const hashAt = body.indexOf("#");
  const beforeAnchor = hashAt === -1 ? body : body.slice(0, hashAt);
  const anchorText = hashAt === -1 ? "" : body.slice(hashAt + 1);
  const queryAt = beforeAnchor.indexOf("?");
  const pathText = queryAt === -1 ? beforeAnchor : beforeAnchor.slice(0, queryAt);
  const queryText = queryAt === -1 ? "" : beforeAnchor.slice(queryAt + 1);

  let path = pathText.replace(/^\//, "");
  if (path.endsWith("/")) path = path.slice(0, -1);
  const segments = path === "" ? [] : path.split("/");
  if (segments.some((s) => !/^[A-Za-z0-9_-]+$/.test(s))) return unknown(requested);

  let redirected = false;
  if (segments.length === 1 && segments[0] === "map") {
    segments[0] = "planner"; // v1 route (03 §A)
    redirected = true;
  }

  const entry = ROUTES.find((r) => r.path === (segments[0] ?? ""));
  if (!entry) return unknown(requested);
  let crewId: CrewId | undefined;
  if (entry.crew) {
    if (segments.length !== 2 || !CREW_IDS.includes(segments[1] as CrewId)) return unknown(requested);
    crewId = segments[1] as CrewId;
  } else if (segments.length > 1) {
    return unknown(requested);
  }

  const query: Record<string, string> = {};
  if (queryText) {
    try {
      for (const [k, v] of new URLSearchParams(queryText)) query[k] = v;
    } catch {
      return unknown(requested);
    }
  }
  const role: Role | null = (entry.role === "ops" || entry.role === "earth" || entry.role === "presenter") ? entry.role : (entry.role === "eva" || entry.role === "hud") && crewId ? (`${entry.role}:${crewId}` as Role) : null;
  const route: Route = {
    id: entry.id,
    screen: entry.screen,
    mode: entry.mode,
    hash: routeHash(entry.id, crewId),
    requested,
    redirected,
    role,
    query,
  };
  if (crewId) route.crewId = crewId;
  if (entry.id === "sources" && ANCHOR.test(anchorText)) route.anchor = anchorText;
  const joinRole = JOIN_ROLES.find((r) => r === query.role);
  if (entry.id === "join" && joinRole) route.joinRole = joinRole;
  return route;
}
