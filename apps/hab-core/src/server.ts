/**
 * HTTP + WebSocket server (docs/specs/02 §E.5–E.6; FR-30, FR-31, NFR-08, NFR-12, NFR-13). T20.04.
 * Fastify serves the web app and site data; `ws` handles /ws: HELLO → SNAPSHOT, then the EVENTs after
 * `last_seq` on a reconnect, EVENTs fanned out immediately, STATE_DELTAs coalesced to ≤ 10 Hz per client
 * (02 §D.14), COMMAND → exactly one COMMAND_RESULT, PING every HEARTBEAT_MS.
 * Binds 0.0.0.0 by default so phones on the habitat LAN can join. No outbound network requests,
 * ever (NFR-01, NFR-08).
 *
 * Wall-clock time is allowed here (heartbeat, real-to-sim pacing, uptime), never in src/engine/
 * (NFR-06): the server turns real elapsed time into a whole number of 1-s sim steps and calls
 * `session.advance(steps)`.
 */
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { WebSocketServer, type WebSocket } from "ws";
import {
  HEARTBEAT_MS,
  MAX_REPLAY_GAP,
  PERMISSIONS,
  PROTOCOL_VERSION,
  type Command,
  type CommandResult,
  type LogEvent,
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

/** NFR-08 Content-Security-Policy (02 §F). */
export const CSP = "default-src 'self'; connect-src 'self' ws:";

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
    return session.snapshot(clientList(clients));
  });

  app.get<{ Querystring: { after?: string } }>("/api/log", async (req, reply) => {
    if (!session) return reply.code(404).send({ error: "no session loaded" });
    const after = Number(req.query.after ?? 0);
    if (!Number.isInteger(after) || after < 0) return reply.code(400).send({ error: "after must be a non-negative integer" });
    reply.type("application/x-ndjson");
    return session.eventsAfter(after).map((e) => JSON.stringify(e)).join("\n");
  });

  app.get("/api/report", async (_req, reply) => {
    if (!session) return reply.code(404).send({ error: "no session loaded" });
    const events = session.eventsAfter(0);
    const snap = session.snapshot([]);
    const report = buildReport(events, snap.session.log_hash);
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
    const { role, client_id, last_seq } = msg;
    const display_name = msg.display_name ?? "";
    if (!isRole(role) || !isShortString(client_id) || !isShortString(display_name)) return;
    if (typeof last_seq !== "number" || !Number.isInteger(last_seq) || last_seq < 0) return;
    // One client_id per connection: it keys command dedupe (05 Command), so a second HELLO may not change it.
    if (client.joined && client.client_id !== client_id) return;
    Object.assign(client, { role, client_id, display_name, joined: true });
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
    publish(before, outcome.events);
    send(client, outcome.result);
  }

  /**
   * Tell every client what a command or a batch of ticks did: the EVENTs, then the STATE_DELTA between the session's
   * state before and after, so `state()` on each client follows (alerts, options, tasks, clock, not only crew fields).
   * A new session (LOAD_SCENARIO) restarts seq, which a delta cannot express: every client gets a fresh SNAPSHOT first.
   */
  function publish(before: Snapshot, events: LogEvent[], tickChanges: StateChange[] = []): void {
    if (!session) return;
    const after = session.snapshot([]);
    if (after.session.session_id !== before.session.session_id) {
      const list = clientList(clients);
      for (const c of clients) if (c.joined) send(c, { ...after, clients: list });
      broadcastEvents(events);
      return;
    }
    broadcastEvents(events);
    // The diff comes last, so it wins a path the tick also reported (last value per path, 02 §D.14).
    const changes = [...tickChanges, ...diffSnapshots(before, after)];
    if (changes.length > 0) broadcast(stateDelta(changes));
  }

  function broadcastEvents(events: LogEvent[]): void {
    for (const event of events) broadcast(eventMessage(event));
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

function send(client: Client, msg: ServerMessage): void {
  if (client.ws.readyState !== client.ws.OPEN) return;
  if (client.ws.bufferedAmount > MAX_BUFFERED_BYTES) return; // slow or half-open device: drop, it resyncs on reconnect
  client.ws.send(JSON.stringify(msg));
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
