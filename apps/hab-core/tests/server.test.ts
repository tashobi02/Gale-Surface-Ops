/**
 * T20.03: Hab Core HTTP + WebSocket server (02 §E.5, §E.6; FR-30, FR-31, NFR-13).
 * Fails against the stub until T20.04 (map §h.3, pair T20.03 → T20.04).
 *
 * The server is started on an ephemeral port with a stub SessionHandle (engine contract C14).
 * API these tests fix for T20.04: `startServer({site, port: 0, host, session})` resolves to
 * `{url, close}`. The cast below exists only because the current stub's signature predates it;
 * T20.04 changes `ServerOptions` / the return type and removes the cast.
 * Wall-clock timers are allowed in the server (heartbeat), never in src/engine/ (NFR-06).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import {
  HEARTBEAT_MS,
  MAX_REPLAY_GAP,
  type ClientMessage,
  type Command,
  type CommandResult,
  type LogEvent,
  type ServerMessage,
  type Snapshot,
} from "@marswalk/protocol";
import type { StateChange } from "../src/engine/reducer";
import { startServer } from "../src/server";
import type { SessionHandle } from "../src/session";

interface HabServerUnderTest {
  url: string;
  close(): Promise<void>;
}
type StartUnderTest = (o: { site: string; port: number; host: string; session: SessionHandle }) => Promise<HabServerUnderTest>;
const start = startServer as unknown as StartUnderTest;

// ---- Stub session (placeholder values only) ----------------------------------------------------

const SIM_TIME = "2024-05-20T13:05:00Z"; // 02 §E.6 SNAPSHOT example

function logEvent(seq: number): LogEvent {
  return { seq, sim_time: SIM_TIME, kind: "ARRIVED_STOP", actor: "system", data: {}, provenance: {}, command_ref: null };
}

class StubSession implements SessionHandle {
  lastSeq: number;
  pending: LogEvent[] = [];
  applied: Command[] = [];
  clientIds: (string | undefined)[] = [];
  constructor(lastSeq: number) {
    this.lastSeq = lastSeq;
  }
  snapshot(clients: Snapshot["clients"]): Snapshot {
    return {
      v: 1, type: "SNAPSHOT", seq: this.lastSeq, sim_time: SIM_TIME,
      session: { session_id: "s-0007", scenario_id: "storm-sol4190", data_version: "gale_boxwork-2026.11.08", seed: 0,
        status: "RUNNING", clock: { sim_time: SIM_TIME, speed: 60, paused: false }, plan_revision: 0, last_seq: this.lastSeq, log_hash: "" },
      plan: null, crew: [], vehicles: [], alerts: [], options: [], tasks: [],
      earth: { light_time_s: 0, next_pass_utc: null, blackout: false, queue: [] }, clients, provenance: {},
    };
  }
  apply(command: Command, client_id?: string): { result: CommandResult; events: LogEvent[] } {
    this.applied.push(command);
    this.clientIds.push(client_id);
    const ev = logEvent(++this.lastSeq);
    return { result: { v: 1, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: ev.seq }, events: [ev] };
  }
  advance(_steps: number): { events: LogEvent[]; deltas: StateChange[] } {
    const events = this.pending;
    this.pending = [];
    return { events, deltas: [] };
  }
  eventsAfter(seq: number): LogEvent[] {
    const out: LogEvent[] = [];
    for (let s = seq + 1; s <= this.lastSeq; s++) out.push(logEvent(s));
    return out;
  }
  /** Make `n` new events appear on the next advance. */
  emit(n: number): void {
    for (let i = 0; i < n; i++) this.pending.push(logEvent(++this.lastSeq));
  }
}

// ---- WebSocket test client ---------------------------------------------------------------------

interface TestClient {
  ws: WebSocket;
  received: ServerMessage[];
  send(m: ClientMessage): void;
  waitFor(pred: (m: ServerMessage) => boolean, count?: number, timeoutMs?: number): Promise<ServerMessage[]>;
}

async function connect(url: string): Promise<TestClient> {
  const ws = new WebSocket(`${url.replace(/^http/, "ws")}/ws`);
  const received: ServerMessage[] = [];
  ws.on("message", (raw) => received.push(JSON.parse(raw.toString()) as ServerMessage));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const client: TestClient = {
    ws,
    received,
    send: (m) => ws.send(JSON.stringify(m)),
    waitFor: async (pred, count = 1, timeoutMs = 2000) => {
      const deadline = Date.now() + timeoutMs;
      while (received.filter(pred).length < count) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${count} message(s)`);
        await new Promise((r) => setTimeout(r, 5));
      }
      return received.filter(pred);
    },
  };
  return client;
}

/** `seq` of a server message; COMMAND_RESULT has none (02 §E.6 example). */
const seqOf = (m: ServerMessage): number => ("seq" in m ? m.seq : -1);

const hello = (last_seq: number, client_id = "c-7f3a"): ClientMessage =>
  ({ v: 1, type: "HELLO", role: "eva:EV1", client_id, display_name: "", last_seq }); // 02 §E.6 HELLO

const open: { server?: HabServerUnderTest; clients: TestClient[] } = { clients: [] };

async function setup(lastSeq = 412): Promise<{ server: HabServerUnderTest; session: StubSession }> {
  const session = new StubSession(lastSeq);
  const server = await start({ site: "mock_site", port: 0, host: "127.0.0.1", session });
  open.server = server;
  return { server, session };
}

async function client(url: string): Promise<TestClient> {
  const c = await connect(url);
  open.clients.push(c);
  return c;
}

afterEach(async () => {
  vi.useRealTimers();
  for (const c of open.clients) c.ws.close();
  open.clients = [];
  await open.server?.close();
  open.server = undefined;
});

// ---- Tests -------------------------------------------------------------------------------------

describe("Hab Core server (T20.03 → T20.04)", () => {
  it("HELLO with last_seq 0 returns exactly one SNAPSHOT whose seq equals the session's last_seq (02 §E.6)", async () => {
    const { server, session } = await setup();
    const c = await client(server.url);
    c.send(hello(0));
    const [snap] = await c.waitFor((m) => m.type === "SNAPSHOT");
    await new Promise((r) => setTimeout(r, 50));
    expect(c.received.filter((m) => m.type === "SNAPSHOT")).toHaveLength(1);
    expect(seqOf(snap)).toBe(session.lastSeq);
    expect((snap as Snapshot).session.last_seq).toBe(session.lastSeq);
  });

  it("two clients receive every EVENT in seq order; semantic events are sent immediately (02 §D.14)", async () => {
    const { server, session } = await setup();
    const a = await client(server.url);
    const b = await client(server.url);
    a.send(hello(0, "c-a"));
    b.send(hello(0, "c-b"));
    await a.waitFor((m) => m.type === "SNAPSHOT");
    await b.waitFor((m) => m.type === "SNAPSHOT");
    const first = session.lastSeq + 1;
    session.emit(3);
    for (const c of [a, b]) {
      const events = await c.waitFor((m) => m.type === "EVENT", 3);
      expect(events.map(seqOf)).toEqual([first, first + 1, first + 2]);
    }
  });

  it("a reconnect with last_seq gets a fresh SNAPSHOT first, then the EVENTs after it (02 §E.6, NFR-13)", async () => {
    const { server, session } = await setup();
    const c = await client(server.url);
    c.send(hello(session.lastSeq - 2));
    await c.waitFor((m) => m.type === "EVENT", 2);
    // SNAPSHOT first, so state changed only by STATE_DELTA during the gap is correct again.
    expect(c.received.map((m) => m.type)).toEqual(["SNAPSHOT", "EVENT", "EVENT"]);
    expect(seqOf(c.received[0])).toBe(session.lastSeq);
    expect(c.received.slice(1).map(seqOf)).toEqual([session.lastSeq - 1, session.lastSeq]);
  });

  it("a reconnect with a gap above MAX_REPLAY_GAP gets the SNAPSHOT only (02 §E.6)", async () => {
    const { server, session } = await setup(MAX_REPLAY_GAP + 10);
    const c = await client(server.url);
    c.send(hello(session.lastSeq - MAX_REPLAY_GAP - 1));
    await c.waitFor((m) => m.type === "SNAPSHOT");
    await new Promise((r) => setTimeout(r, 50));
    expect(c.received.some((m) => m.type === "EVENT")).toBe(false);
  });

  it("the server sends PING every HEARTBEAT_MS (02 §E.6, FR-32)", async () => {
    // Fake only the interval timers, before the server starts, so its heartbeat runs on the fake clock.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { server } = await setup();
    const c = await client(server.url);
    c.send(hello(0));
    await c.waitFor((m) => m.type === "SNAPSHOT");
    const before = c.received.filter((m) => m.type === "PING").length;
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    await c.waitFor((m) => m.type === "PING", before + 2);
  });

  it("a COMMAND gets exactly one COMMAND_RESULT with its command_id (02 §E.6)", async () => {
    const { server, session } = await setup();
    const c = await client(server.url);
    c.send(hello(0));
    await c.waitFor((m) => m.type === "SNAPSHOT");
    c.send({ v: 1, type: "COMMAND", command_id: "k-0091", role: "eva:EV1",
      command: { kind: "SUMMON_VEHICLE", args: { crew: ["EV1", "EV2"] } } }); // 02 §E.6 COMMAND example
    const [result] = await c.waitFor((m) => m.type === "COMMAND_RESULT");
    await new Promise((r) => setTimeout(r, 50));
    expect(c.received.filter((m) => m.type === "COMMAND_RESULT")).toHaveLength(1);
    expect(result).toMatchObject({ command_id: "k-0091", ok: true });
    expect(session.applied.map((cmd) => cmd.command_id)).toEqual(["k-0091"]);
  });

  it("a second HELLO on the same connection cannot change its client_id", async () => {
    const { server, session } = await setup();
    const a = await client(server.url);
    a.send(hello(0, "c-aaaa"));
    await a.waitFor((m) => m.type === "SNAPSHOT");
    a.send(hello(0, "c-other"));
    await new Promise((r) => setTimeout(r, 50));
    a.send({ v: 1, type: "COMMAND", command_id: "k-0001", role: "eva:EV1", command: { kind: "ACK_ALERT", args: { alert_id: "a-1" } } });
    await a.waitFor((m) => m.type === "COMMAND_RESULT");
    expect(session.clientIds).toEqual(["c-aaaa"]);
  });

  it("a COMMAND is applied with its connection's HELLO client_id, the key of the 05 Command dedupe rule", async () => {
    const { server, session } = await setup();
    const a = await client(server.url);
    const b = await client(server.url);
    a.send(hello(0, "c-aaaa"));
    b.send(hello(0, "c-bbbb"));
    await a.waitFor((m) => m.type === "SNAPSHOT");
    await b.waitFor((m) => m.type === "SNAPSHOT");
    for (const c of [a, b]) {
      c.send({ v: 1, type: "COMMAND", command_id: "k-0001", role: "eva:EV1", command: { kind: "ACK_ALERT", args: { alert_id: "a-1" } } });
      await c.waitFor((m) => m.type === "COMMAND_RESULT");
    }
    expect(session.clientIds).toEqual(["c-aaaa", "c-bbbb"]);
  });

  it("GET /api/health returns {status, data_version, session_id, sim_time, uptime_s} (02 §E.5)", async () => {
    const { server } = await setup();
    const res = await fetch(`${server.url}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["data_version", "session_id", "sim_time", "status", "uptime_s"]);
    expect(body).toMatchObject({ data_version: "gale_boxwork-2026.11.08", session_id: "s-0007", sim_time: SIM_TIME });
  });
});
