/**
 * HTTP + WebSocket server (docs/specs/02 §E.5–E.6; FR-30, FR-31, NFR-08, NFR-12, NFR-13). T20.04.
 * Fastify serves the web app and site data; `ws` handles /ws: HELLO → SNAPSHOT, then the EVENTs after
 * `last_seq` on a reconnect, EVENTs fanned out immediately, STATE_DELTAs coalesced to ≤ 10 Hz per client
 * (02 §D.14), COMMAND → exactly one COMMAND_RESULT, PING every HEARTBEAT_MS.
 * Role take-over, newest wins (02 §E.4): a HELLO for a role another client holds displaces that client (TAKEN_OVER,
 * close 4001, one logged ROLE_TAKEN_OVER); the same client_id on a new socket replaces its own stale socket silently.
 * Binds 0.0.0.0 by default so phones on the habitat LAN can join. No outbound network requests,
 * ever (NFR-01, NFR-08).
 *
 * Wall-clock time is allowed here (heartbeat, real-to-sim pacing, uptime), never in src/engine/
 * (NFR-06): the server turns real elapsed time into a whole number of 1-s sim steps and calls
 * `session.advance(steps)`.
 */
import { existsSync } from "node:fs";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import { performance } from "node:perf_hooks";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import QRCode from "qrcode";
import { WebSocketServer, type WebSocket } from "ws";
import {
  CSP_HEADER,
  HEARTBEAT_MS,
  MAX_REPLAY_GAP,
  PERMISSIONS,
  PROTOCOL_VERSION,
  TAKEN_OVER_CLOSE_CODE,
  TAKEN_OVER_CLOSE_REASON,
  type ApiCapabilities,
  type Command,
  type CommandResult,
  type CrewId,
  type LogEvent,
  type LogEventData,
  type Role,
  type ServerMessage,
  type Snapshot,
} from "@marswalk/protocol";
import type { StateChange } from "./engine/reducer";
import type { SessionHandle } from "./session";
import { buildReport } from "./report";
import { diffSnapshots } from "./stateDelta";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Server loop period; also the STATE_DELTA coalescing window (≤ 10 Hz per client, 02 §D.14). */
export const LOOP_MS = 100;

/** Largest accepted WebSocket message; protocol messages are a few hundred bytes. */
export const MAX_PAYLOAD_BYTES = 64 * 1024;
/** Longest accepted id or display name in client messages. */
const MAX_ID_CHARS = 64;
/** Real time counted per loop at most, so a stall or laptop sleep cannot burst the simulation. */
const MAX_LOOP_ELAPSED_S = 1;
/** Skip sending to a client whose socket buffer is this full (slow or half-open device). */
const MAX_BUFFERED_BYTES = 1024 * 1024;

/** NFR-08 Content-Security-Policy (02 §F): the one policy of @marswalk/protocol, served as a header. */
export const CSP = CSP_HEADER;

export interface ServerOptions {
  site: string;
  scenario?: string;
  port: number;
  /** Default `0.0.0.0` (habitat LAN). */
  host?: string;
  /** The running session; without one the server serves files and reports `no_session`. */
  session?: SessionHandle;
  /** Built web app; default `apps/web/dist`. */
  webDir?: string;
  /** Site bundles; default `data/sites`. */
  sitesDir?: string;
  /** Optional advertised LAN-host override (`--public-host`, BD-82); default: the request origin (N-90, BD-164). */
  publicHost?: string;
}

/** Every protocol role has a local join QR, including presenter and HUD (N-90, BD-164). */
const JOIN_QR_ROLES = Object.keys(PERMISSIONS) as Role[];

/** BD-82: the host in the join URL: the flag, else the first non-internal IPv4 address, else `localhost`. Reads only the interface list. */
export function defaultPublicHost(flag: string | undefined, nics: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string {
  if (flag !== undefined && flag !== "") return flag;
  for (const list of Object.values(nics)) {
    for (const nic of list ?? []) if (nic.family === "IPv4" && !nic.internal) return nic.address;
  }
  return "localhost";
}

/** BD-82: `http://<host>:<port>/#/join?role=<role>`; `role` is one of `JOIN_QR_ROLES`, so it needs no escaping. */
export function joinUrl(host: string, port: number, role: string): string {
  return `http://${host}:${port}/#/join?role=${role}`;
}

export interface HabServer {
  /** e.g. `http://127.0.0.1:8080` */
  url: string;
  close(): Promise<void>;
}

interface Client {
  ws: WebSocket;
  client_id: string;
  role: Role;
  display_name: string;
  /** Set after HELLO; nothing is sent before it. */
  joined: boolean;
}

export async function startServer(options: ServerOptions): Promise<HabServer> {
  const { session } = options;
  const host = options.host ?? "0.0.0.0";
  const startedAt = Date.now();
  const app: FastifyInstance = Fastify({ logger: false });
  const clients = new Set<Client>();
  /** The port actually bound (set after `listen`; the join QR names it, `--port 0` included). */
  let boundPort = options.port;

  app.addHook("onSend", async (_req, reply) => {
    reply.header("Content-Security-Policy", CSP);
  });

  registerStatic(app, options);

  app.get("/api/health", async () => {
    const snap = session?.snapshot([]);
    return {
      status: snap ? "ok" : "no_session",
      data_version: snap?.session.data_version ?? null,
      session_id: snap?.session.session_id ?? null,
      sim_time: snap?.sim_time ?? null,
      uptime_s: Math.floor((Date.now() - startedAt) / 1000),
    };
  });

  app.get("/api/session", async (_req, reply) => {
    if (!session) return reply.code(404).send({ error: "no session loaded" });
    // N-30: the loaded scenario's ParamSets and replay sources ride along with the snapshot.
    const snap = sourcedSnapshot(session.snapshot(clientList(clients)));
    const meta = session.scenarioMeta?.();
    return meta === undefined ? snap : { ...snap, scenario_meta: meta };
  });

  // N-200, BD-165: frontend discovery uses the same matrix that handleCommand enforces.
  app.get("/api/capabilities", async () => ({ commands: PERMISSIONS } satisfies ApiCapabilities));

  // N-05 (01-contract §7a): the lobby's small summary; GET /api/session stays the full SNAPSHOT (02 §E.5).
  app.get("/api/session/summary", async (_req, reply) => {
    if (!session) return reply.code(404).send({ error: "no session loaded" });
    const snap = session.snapshot([]);
    const evaStarted = session.eventsAfter(0).find((e) => e.kind === "EVA_STARTED");
    return {
      session_id: snap.session.session_id,
      scenario_id: snap.session.scenario_id,
      status: snap.session.status,
      sim_time: snap.sim_time,
      speed: snap.session.clock.speed,
      paused: snap.session.clock.paused,
      eva_start_utc: evaStarted?.sim_time ?? null,
      hab_candidate_id: snap.session.hab_candidate_id,
      plan_published: snap.plan !== null,
    };
  });

  app.get<{ Querystring: { after?: string; download?: string } }>("/api/log", async (req, reply) => {
    if (!session) return reply.code(404).send({ error: "no session loaded" });
    const after = Number(req.query.after ?? 0);
    if (!Number.isInteger(after) || after < 0) return reply.code(400).send({ error: "after must be a non-negative integer" });
    reply.type("application/x-ndjson");
    // ?download=1 saves the log as `<session_id>.jsonl` (N-10; the ops console's "download the log").
    if (req.query.download === "1") reply.header("Content-Disposition", `attachment; filename="${session.snapshot([]).session.session_id}.jsonl"`);
    return session.eventsAfter(after).map((e) => JSON.stringify(e)).join("\n");
  });

  // N-11 (BD-112): the coverage of a utility rover parked as a RELAY, a u8 grid in the comm_hab layout; 404 otherwise.
  app.get<{ Params: { vehicle_id: string } }>("/api/relay-coverage/:vehicle_id", async (req, reply) => {
    if (!session) return reply.code(404).send({ error: "no session loaded" });
    const cov = session.relayCoverage(req.params.vehicle_id);
    if (!cov) return reply.code(404).send({ error: `${req.params.vehicle_id} is not parked as a relay` });
    const etag = `"${cov.rev}"`;
    reply.header("ETag", etag).header("Cache-Control", "no-cache");
    if (req.headers["if-none-match"] === etag) return reply.code(304).send();
    reply.type("application/octet-stream");
    return Buffer.from(cov.data.buffer, cov.data.byteOffset, cov.data.byteLength);
  });

  // N-30 (BD-158): the loaded scenario's ParamSets, dose series and Earth-link span, for SCR-09. Static for a session.
  app.get("/api/scenario-meta", async (_req, reply) => {
    if (!session?.scenarioMeta) return reply.code(404).send({ error: "no session loaded" });
    return session.scenarioMeta();
  });

  // N-130 (BD-157): the crew and alerts as Earth sees them, one light time old; the Earth console polls it.
  app.get("/api/earth-view", async (_req, reply) => {
    if (!session?.earthView) return reply.code(404).send({ error: "no session loaded" });
    reply.header("Cache-Control", "no-store");
    return session.earthView();
  });

  // N-100, N-120 (BD-159): the walking time to the hab for every grid cell, float32 seconds, row 0 = north (compute habTimeField).
  app.get("/api/hab-time-field", async (req, reply) => {
    const field = session?.habTimeField?.() ?? null;
    if (field === null) return reply.code(404).send({ error: "no hab time field: the session has no plan, grid or start waypoint" });
    const etag = field.etag;
    reply
      .header("ETag", etag)
      .header("Cache-Control", "no-cache")
      .header("X-Grid-Width", String(field.width))
      .header("X-Grid-Height", String(field.height))
      .header("X-Grid-Origin-M", field.origin_m.join(","))
      .header("X-Grid-Cell-M", String(field.cell_m))
      .header("X-Unit", "s")
      .header("X-Provenance", "modelled")
      .header("X-Data-Version", field.data_version);
    if (req.headers["if-none-match"] === etag) return reply.code(304).send();
    reply.type("application/octet-stream");
    return Buffer.from(field.seconds.buffer, field.seconds.byteOffset, field.seconds.byteLength);
  });

  // T28.02 (BD-82): the join QR for one role, an SVG built locally (no outbound request, NFR-01).
  app.get<{ Querystring: { role?: unknown } }>("/api/join-qr", async (req, reply) => {
    const role = req.query.role;
    if (typeof role !== "string" || !JOIN_QR_ROLES.includes(role as Role)) {
      return reply.code(400).send({ error: `role must be one of ${JOIN_QR_ROLES.join(", ")}` });
    }
    const url = options.publicHost
      ? joinUrl(options.publicHost, boundPort, role)
      : `${req.protocol}://${req.host}/#/join?role=${role}`;
    const svg = await QRCode.toString(url, { type: "svg" });
    reply.type("image/svg+xml").header("Cache-Control", "no-store");
    return svg;
  });

  app.get("/api/report", async (_req, reply) => {
    if (!session) return reply.code(404).send({ error: "no session loaded" });
    const events = session.eventsAfter(0);
    const snap = session.snapshot([]);
    const report = buildReport(events, snap.session.log_hash, session.initialPlan(), session.reportInputs());
    if (report.session_id === "unknown" && snap.session.session_id) {
      report.session_id = snap.session.session_id;
      report.scenario_id = snap.session.scenario_id;
      report.data_version = snap.session.data_version;
      report.seed = snap.session.seed;
    }
    return report;
  });

  // ---- WebSocket ------------------------------------------------------------------------------
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  app.server.on("upgrade", (req, socket, head) => {
    let path = "";
    try {
      path = new URL(req.url ?? "/", "http://hab").pathname;
    } catch {
      path = "";
    }
    // Same-origin only: a page served by another host on the LAN cannot drive the Hab Core.
    const origin = req.headers.origin;
    let sameOrigin = true;
    if (origin) {
      try {
        sameOrigin = new URL(origin).host === req.headers.host;
      } catch {
        sameOrigin = false;
      }
    }
    if (path !== "/ws" || !sameOrigin) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client: Client = { ws, client_id: "", role: "ops", display_name: "", joined: false };
      clients.add(client);
      ws.on("message", (raw) => onMessage(client, raw.toString()));
      ws.on("close", () => clients.delete(client));
      ws.on("error", () => clients.delete(client));
    });
  });

  /** `role` + client_id pairs this server displaced (02 §E.4); kept for the server's lifetime, a few short strings per take-over. */
  const displacedIds = new Set<string>();
  const displacedKey = (role: Role, client_id: string): string => `${role}\u0000${client_id}`;

  /** Current seq and sim time, read from the session (never cached across a LOAD_SCENARIO). */
  function head(): { seq: number; sim_time: string } {
    if (!session) return { seq: 0, sim_time: "" };
    const snap = session.snapshot([]);
    return { seq: snap.seq, sim_time: snap.sim_time };
  }

  function onMessage(client: Client, text: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return; // not JSON: ignore
    }
    if (!isRecord(raw) || raw.v !== PROTOCOL_VERSION) return;
    if (raw.type === "HELLO") onHello(client, raw);
    else if (raw.type === "COMMAND") onCommand(client, raw);
  }

  function onHello(client: Client, msg: Record<string, unknown>): void {
    if (!clients.has(client)) return; // already released (displaced or replaced): its socket is closing, it cannot join
    const { role, client_id, last_seq } = msg;
    const display_name = msg.display_name ?? "";
    if (!isRole(role) || !isShortString(client_id) || !isShortString(display_name)) return;
    if (typeof last_seq !== "number" || !Number.isInteger(last_seq) || last_seq < 0) return;
    // One client_id per connection: it keys command dedupe (05 Command), so a second HELLO may not change it.
    if (client.joined && client.client_id !== client_id) return;
    // A client_id the Hab Core displaced from this role stays displaced: a later HELLO from it is told so and closed,
    // it does not take the role back from the new holder (taking it back is a new join with a new client_id).
    if (displacedIds.has(displacedKey(role, client_id))) {
      send(client, { v: PROTOCOL_VERSION, type: "TAKEN_OVER", ...head(), role });
      release(client, TAKEN_OVER_CLOSE_CODE, TAKEN_OVER_CLOSE_REASON);
      return;
    }
    const displaced = holdersOf(role, client);
    Object.assign(client, { role, client_id, display_name, joined: true });
    const takeovers = displaced.filter((old) => old.client_id !== client_id).map((old) => takeOver(old, client));
    for (const old of displaced.filter((o) => o.client_id === client_id)) release(old, 1000, "replaced by a newer socket");
    if (!session) return;
    // Always a fresh SNAPSHOT first: state changed only by STATE_DELTA during the gap is otherwise
    // lost (NFR-13). On a reconnect (last_seq > 0) with a small gap, the missed EVENTs follow it;
    // a gap above MAX_REPLAY_GAP gets the SNAPSHOT only (02 §E.6).
    const snapshot = session.snapshot(clientList(clients));
    send(client, snapshot);
    const gap = snapshot.seq - last_seq;
    if (last_seq > 0 && gap >= 0 && gap <= MAX_REPLAY_GAP) {
      for (const event of session.eventsAfter(last_seq)) send(client, eventMessage(event));
    }
    // Everyone else sees the take-over in their event feed; the new client's own feed starts at its SNAPSHOT (or replay).
    for (const event of takeovers) {
      if (event) for (const c of clients) if (c.joined && c !== client) send(c, eventMessage(event));
    }
  }

  /** Other joined clients that currently hold `role`. */
  function holdersOf(role: Role, except: Client): Client[] {
    return [...clients].filter((c) => c !== except && c.joined && c.role === role);
  }

  /** Drop a client from the live set and close its socket; nothing more is sent to or accepted from it. */
  function release(old: Client, code: number, reason: string): void {
    old.joined = false;
    clients.delete(old);
    if (old.ws.readyState === old.ws.OPEN || old.ws.readyState === old.ws.CONNECTING) old.ws.close(code, reason);
  }

  /** Displace `old` by `by` (02 §E.4): log it, tell `old`, close it. Returns the logged event (none without a session). */
  function takeOver(old: Client, by: Client): LogEvent | null {
    displacedIds.add(displacedKey(old.role, old.client_id));
    const data: LogEventData["ROLE_TAKEN_OVER"] = {
      role: old.role,
      ...(/^(eva|hud):/.test(old.role) ? { crew_id: old.role.slice(4) as CrewId } : {}),
      old_client_id: old.client_id,
      new_client_id: by.client_id,
    };
    const event = session ? session.recordRoleTakeOver(data) : null;
    send(old, { v: PROTOCOL_VERSION, type: "TAKEN_OVER", ...head(), role: old.role }); // before the close frame
    release(old, TAKEN_OVER_CLOSE_CODE, TAKEN_OVER_CLOSE_REASON);
    return event;
  }

  /** Exactly one COMMAND_RESULT for every COMMAND that carries a usable command_id (02 §E.6). */
  function onCommand(client: Client, msg: Record<string, unknown>): void {
    const { command_id, role, command } = msg;
    if (!isShortString(command_id) || command_id === "") return; // nothing to answer to
    if (!client.joined) return send(client, reject(command_id, "INVALID", "send HELLO first"));
    if (!session) return send(client, reject(command_id, "BUSY", "no session loaded"));
    if (role !== client.role) return send(client, reject(command_id, "FORBIDDEN_ROLE", "role does not match HELLO"));
    if (!isRecord(command) || typeof command.kind !== "string" || !isRecord(command.args ?? {})) {
      return send(client, reject(command_id, "INVALID", "command needs kind and args"));
    }
    // Built field by field: the client's object can never override command_id or role.
    const cmd: Command = {
      command_id,
      role: client.role,
      kind: command.kind as Command["kind"],
      args: (command.args ?? {}) as Record<string, unknown>,
      ...(command.queued_offline === true ? { queued_offline: true } : {}),
    };
    let outcome: ReturnType<SessionHandle["apply"]>;
    const before = session.snapshot([]);
    try {
      outcome = session.apply(cmd, client.client_id);
    } catch (err) {
      app.log.error(err);
      return send(client, reject(command_id, "INVALID", "command failed"));
    }
    const after = session.snapshot([]);
    if (outcome.replaced === true || after.session.session_id !== before.session.session_id) {
      // The session was replaced (RESET_SESSION, LOAD_SCENARIO; T32.15): a new session restarts seq, which a delta cannot
      // express. The old session's closing events go out, the commander gets its result, then every client gets a fresh
      // SNAPSHOT of the new session; the new session's own events are in it, and a client's feed restarts at it.
      broadcastEvents(outcome.events);
      send(client, outcome.result);
      const list = clientList(clients);
      for (const c of clients) if (c.joined) send(c, { ...after, clients: list });
      return;
    }
    publish(before, outcome.events);
    send(client, outcome.result);
  }

  /**
   * Tell every client what a command or a batch of ticks did: the EVENTs, then the STATE_DELTA between the session's
   * state before and after, so `state()` on each client follows (alerts, options, tasks, clock, not only crew fields).
   * A command that replaces the session never comes here (see onCommand); a tick never does.
   */
  function publish(before: Snapshot, events: LogEvent[], tickChanges: StateChange[] = []): void {
    if (!session) return;
    const after = session.snapshot([]);
    broadcastEvents(events);
    // The diff comes last, so it wins a path the tick also reported (last value per path, 02 §D.14).
    const changes = [...tickChanges, ...diffSnapshots(before, after)];
    if (changes.length > 0) broadcast(stateDelta(changes));
  }

  function broadcastEvents(events: LogEvent[]): void {
    for (const event of events) {
      broadcast(eventMessage(event));
      sendLinkState(event);
    }
  }

  /**
   * T26.02 (02 §A.5, §E.6): when a suit's simulated surface link changes, its own `eva:` and `hud:` sockets get one
   * LINK_STATE, with the hops and first hop kind the engine left on the crew member (BD-103); no other client does. The
   * EVENT itself went to everyone just before. A link event for a node that is not a crew member sends nothing.
   */
  function sendLinkState(event: LogEvent): void {
    if (event.kind !== "LINK_LOST" && event.kind !== "LINK_RESTORED") return;
    const crew_id = (event.data as LogEventData["LINK_LOST"]).node_id;
    const member = session?.snapshot([]).crew.find((c) => c.crew_id === crew_id);
    if (!member) return;
    const msg: ServerMessage = {
      v: PROTOCOL_VERSION,
      type: "LINK_STATE",
      seq: event.seq,
      sim_time: event.sim_time,
      crew_id: member.crew_id,
      linked: event.kind === "LINK_RESTORED",
      link_hops: member.link_hops ?? null,
      link_via: member.link_via ?? null,
    };
    for (const c of clients) if (c.joined && (c.role === `eva:${crew_id}` || c.role === `hud:${crew_id}`)) send(c, msg);
  }

  function broadcast(msg: ServerMessage): void {
    for (const c of clients) if (c.joined) send(c, msg);
  }

  // ---- Loops: sim pacing + delta coalescing, heartbeat ----------------------------------------
  let simCarry_s = 0;
  let lastLoopAt = performance.now(); // monotonic
  const loop = setInterval(() => {
    if (!session) return;
    try {
      const now = performance.now();
      const elapsed_s = Math.min(Math.max((now - lastLoopAt) / 1000, 0), MAX_LOOP_ELAPSED_S);
      lastLoopAt = now;
      const before = session.snapshot([]);
      const { clock } = before.session;
      const speed = Number.isFinite(clock.speed) && clock.speed > 0 ? clock.speed : 0;
      simCarry_s += clock.paused ? 0 : elapsed_s * speed;
      const steps = Math.floor(simCarry_s);
      simCarry_s -= steps;
      const { events, deltas } = session.advance(steps);
      publish(before, events, deltas);
    } catch (err) {
      app.log.error(err); // keep serving; the engine owner sees the error
    }
  }, LOOP_MS);

  const heartbeat = setInterval(() => {
    if (!session) return; // nothing to report before a session exists
    broadcast({ v: PROTOCOL_VERSION, type: "PING", ...head() });
  }, HEARTBEAT_MS);

  function stateDelta(changes: StateChange[]): ServerMessage {
    // One message per loop period (≤ 10 Hz), last value per path (02 §D.14).
    const latest = new Map<string, unknown>();
    for (const c of changes) {
      latest.delete(c.path);
      latest.set(c.path, c.value);
    }
    return { v: PROTOCOL_VERSION, type: "STATE_DELTA", ...head(), changes: [...latest].map(([path, value]) => ({ path, value })) };
  }

  try {
    await app.listen({ port: options.port, host });
  } catch (err) {
    clearInterval(loop);
    clearInterval(heartbeat);
    throw err;
  }
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  boundPort = port;
  const urlHost = host === "0.0.0.0" ? "127.0.0.1" : host;

  return {
    url: `http://${urlHost}:${port}`,
    async close() {
      clearInterval(loop);
      clearInterval(heartbeat);
      for (const c of clients) c.ws.terminate();
      clients.clear();
      await new Promise<void>((done) => wss.close(() => done()));
      await app.close();
    },
  };
}

function registerStatic(app: FastifyInstance, options: ServerOptions): void {
  const webDir = options.webDir ?? join(REPO_ROOT, "apps/web/dist");
  const sitesDir = options.sitesDir ?? join(REPO_ROOT, "data/sites");
  if (existsSync(webDir)) app.register(fastifyStatic, { root: webDir, prefix: "/" });
  if (existsSync(sitesDir)) app.register(fastifyStatic, { root: sitesDir, prefix: "/sites/", decorateReply: false });
}

function clientList(clients: Set<Client>): Snapshot["clients"] {
  return [...clients].filter((c) => c.joined).map(({ client_id, role, display_name }) => ({ client_id, role, display_name }));
}

function eventMessage(event: LogEvent): ServerMessage {
  return { v: PROTOCOL_VERSION, type: "EVENT", seq: event.seq, sim_time: event.sim_time, event };
}

function reject(command_id: string, code: Extract<CommandResult, { ok: false }>["code"], message: string): CommandResult {
  return { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id, ok: false, code, message };
}

/** Match the UI's existing snapshot source namespace without changing deterministic recording bytes (N-31, BD-166). */
function sourcedSnapshot(snapshot: Snapshot): Snapshot {
  if (snapshot.earth.link_state == null) return snapshot;
  return { ...snapshot, earth: { ...snapshot.earth, link_source_id: "snapshot:earth.link_state" } };
}

function send(client: Client, msg: ServerMessage): void {
  if (client.ws.readyState !== client.ws.OPEN) return;
  if (client.ws.bufferedAmount > MAX_BUFFERED_BYTES) return; // slow or half-open device: drop, it resyncs on reconnect
  client.ws.send(JSON.stringify(msg.type === "SNAPSHOT" ? sourcedSnapshot(msg) : msg));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isShortString(v: unknown): v is string {
  return typeof v === "string" && v.length <= MAX_ID_CHARS;
}

function isRole(v: unknown): v is Role {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PERMISSIONS, v);
}
