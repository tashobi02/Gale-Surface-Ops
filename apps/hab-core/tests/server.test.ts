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
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import {
  CSP_HEADER,
  CSP_META,
  HEARTBEAT_MS,
  MAX_REPLAY_GAP,
  type ClientMessage,
  type Command,
  type Alert,
  type CommandResult,
  type LogEvent,
  type LogEventData,
  type ServerMessage,
  type PlanExport,
  type Role,
  type Snapshot,
  type StopTask,
  type Waypoint,
} from "@marswalk/protocol";
import type { StateChange } from "../src/engine/reducer";
import { readScenario } from "../src/scenario";
import { startServer } from "../src/server";
import { loadSession, type SessionHandle } from "../src/session";

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
  /** The scenario's plan, and the engine's current plan (the reducer replaces its waypoints on PLAN_REVISED). */
  initial: PlanExport | null = null;
  current: PlanExport | null = null;
  /** A scripted log for the report tests; without it the placeholder ARRIVED_STOP events are served. */
  log: LogEvent[] | null = null;
  /** The take-overs the server asked the session to log (02 §E.4). */
  takeovers: LogEventData["ROLE_TAKEN_OVER"][] = [];
  constructor(lastSeq: number) {
    this.lastSeq = lastSeq;
  }
  snapshot(clients: Snapshot["clients"]): Snapshot {
    return {
      v: 1, type: "SNAPSHOT", seq: this.lastSeq, sim_time: SIM_TIME,
      session: { session_id: "s-0007", scenario_id: "storm-sol4190", data_version: "gale_boxwork-2026.11.08", seed: 0,
        status: "RUNNING", clock: { sim_time: SIM_TIME, speed: 60, paused: false }, plan_revision: 0, last_seq: this.lastSeq, log_hash: "" },
      plan: this.current, crew: [], vehicles: [], alerts: [], options: [], tasks: [],
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
  initialPlan(): PlanExport | null {
    return this.initial;
  }
  recordRoleTakeOver(data: LogEventData["ROLE_TAKEN_OVER"]): LogEvent {
    this.takeovers.push(data);
    return { seq: ++this.lastSeq, sim_time: SIM_TIME, kind: "ROLE_TAKEN_OVER", actor: "system", data, provenance: {}, command_ref: null };
  }
  eventsAfter(seq: number): LogEvent[] {
    if (this.log) return this.log.filter((e) => e.seq > seq);
    const out: LogEvent[] = [];
    for (let s = seq + 1; s <= this.lastSeq; s++) out.push(logEvent(s));
    return out;
  }
  /** Make `n` new events appear on the next advance. */
  emit(n: number): void {
    for (let i = 0; i < n; i++) this.pending.push(logEvent(++this.lastSeq));
  }
}

/**
 * A session whose commands change state the way the reducer does (new arrays, nothing mutated), so the server can
 * diff the snapshot before and after. The real task handler is still the T31.04 stub, hence this stand-in.
 */
class StatefulSession extends StubSession {
  alerts: Alert[] = [];
  tasks: StopTask[] = [];
  sessionId = "s-0007";
  snapshot(clients: Snapshot["clients"]): Snapshot {
    const snap = super.snapshot(clients);
    return { ...snap, session: { ...snap.session, session_id: this.sessionId }, alerts: this.alerts, tasks: this.tasks };
  }
  apply(command: Command, client_id?: string): { result: CommandResult; events: LogEvent[] } {
    const out = super.apply(command, client_id);
    const seq = out.events[0].seq;
    const args = command.args as Record<string, string>;
    if (command.kind === "ACK_ALERT") {
      this.alerts = this.alerts.map((a) => (a.alert_id === args.alert_id ? { ...a, acked_seq: seq, acked_by: command.role } : a));
    } else if (command.kind === "UPDATE_STOP_TASK") {
      this.tasks = this.tasks.map((t) => (t.task_id === args.task_id ? { ...t, state: args.state as StopTask["state"], updated_by: command.role } : t));
    } else if (command.kind === "LOAD_SCENARIO") {
      this.sessionId = "s-0008";
    }
    return out;
  }
  private staged: Alert | null = null;
  /** Raise an alert inside the next advance, as the engine's alerts tick does (state changes only inside it). */
  raise(alert: Alert): void {
    this.emit(1);
    this.staged = alert;
  }
  advance(steps: number): { events: LogEvent[]; deltas: StateChange[] } {
    if (this.staged) this.alerts = [...this.alerts, this.staged];
    this.staged = null;
    return super.advance(steps);
  }
}

const ALERT: Alert = {
  alert_id: "a-420", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1", "EV2"], raised_seq: 420,
  acked_seq: null, cleared_seq: null, acked_by: null, message: "Shelter now — radiation surge", data: {},
};
const TASK: StopTask = {
  task_id: "t-s2-02", stop_id: "wp-2", crew_id: "EV1", kind: "image", text: "Image the ridge crest", state: "TODO", reason: null,
  origin: "plan", updated_sim_time: SIM_TIME, updated_by: "system", provenance: { state: "simulated", text: "assumed" },
};

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

const hello = (last_seq: number, client_id = "c-7f3a", role: Role = "eva:EV1"): ClientMessage =>
  ({ v: 1, type: "HELLO", role, client_id, display_name: "", last_seq }); // 02 §E.6 HELLO

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
    a.send(hello(0, "c-a", "eva:EV1"));
    b.send(hello(0, "c-b", "ops")); // another role: the same role would take the first client over (02 §E.4)
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
    a.send(hello(0, "c-aaaa", "eva:EV1"));
    b.send(hello(0, "c-bbbb", "eva:EV2"));
    await a.waitFor((m) => m.type === "SNAPSHOT");
    await b.waitFor((m) => m.type === "SNAPSHOT");
    for (const [c, role] of [[a, "eva:EV1"], [b, "eva:EV2"]] as const) {
      c.send({ v: 1, type: "COMMAND", command_id: "k-0001", role, command: { kind: "ACK_ALERT", args: { alert_id: "a-1" } } });
      await c.waitFor((m) => m.type === "COMMAND_RESULT");
    }
    expect(session.clientIds).toEqual(["c-aaaa", "c-bbbb"]);
  });

  it("serves the one CSP policy of @marswalk/protocol as its header, the page's meta policy plus frame-ancestors (NFR-08)", async () => {
    const { server } = await setup();
    const res = await fetch(`${server.url}/api/health`);
    expect(res.headers.get("content-security-policy")).toBe(CSP_HEADER);
    expect(CSP_HEADER.startsWith(CSP_META)).toBe(true);
  });

  it("GET /api/health returns {status, data_version, session_id, sim_time, uptime_s} (02 §E.5)", async () => {
    const { server } = await setup();
    const res = await fetch(`${server.url}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["data_version", "session_id", "sim_time", "status", "uptime_s"]);
    expect(body).toMatchObject({ data_version: "gale_boxwork-2026.11.08", session_id: "s-0007", sim_time: SIM_TIME });
  });

  it("GET /api/report returns PostEvaReport (01 FR-46)", async () => {
    const { server } = await setup();
    const res = await fetch(`${server.url}/api/report`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.session_id).toBe("s-0007");
    expect(body.disclaimer).toMatch(/NASA Space Apps/i);
    expect(body.stops).toBeDefined();
    expect(body.alerts).toBeDefined();
    expect(body.tasks).toBeDefined();
  });

  describe("GET /api/report plan baseline (01 FR-46)", () => {
    it("the real session's initialPlan() is the scenario's plan, and the snapshot plan starts out the same", () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
      const dir = mkdtempSync(join(tmpdir(), "marswalk-server-"));
      try {
        const session = loadSession(fake, dir);
        expect(session.initialPlan()).toBe(fake.scenario.plan);
        expect(session.snapshot([]).plan?.plan_hash).toBe(fake.scenario.plan.plan_hash);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    const wp = (n: number, role: Waypoint["role"]): Waypoint => ({ id: `wp-${n}`, role, x_m: n, y_m: 0 });
    const planOf = (waypoints: Waypoint[]): PlanExport =>
      ({ scenario: { eva_start_utc: SIM_TIME }, waypoints, result: { stops_timeline: [] } }) as unknown as PlanExport;
    const ev = (seq: number, kind: LogEvent["kind"], data: Record<string, unknown>): LogEvent =>
      ({ seq, sim_time: SIM_TIME, kind, actor: "system", data, provenance: {}, command_ref: null });

    it("a stop dropped before anyone reached it is `dropped`, though the snapshot plan (replaced by the reducer) no longer lists it", async () => {
      const { server, session } = await setup();
      const start = wp(0, "start");
      session.initial = planOf([start, wp(1, "stop"), wp(2, "stop"), wp(3, "stop")]);
      session.current = planOf([start, wp(1, "stop")]); // after both revisions below
      session.log = [
        ev(1, "SESSION_LOADED", { session_id: "s-0007", scenario_id: "storm-sol4190", data_version: "gale_boxwork-2026.11.08", seed: 0, plan_hash: "x" }),
        ev(2, "EVA_STARTED", { crew_ids: ["EV1"], plan_revision: 0 }),
        ev(3, "PLAN_REVISED", { plan_revision: 1, option_id: "opt-1", stops_dropped: [3], waypoints: [start, wp(1, "stop"), wp(2, "stop")], legs: [] }),
        ev(4, "PLAN_REVISED", { plan_revision: 2, option_id: "opt-2", stops_dropped: [2], waypoints: [start, wp(1, "stop")], legs: [] }),
        ev(5, "EVA_ENDED", { crew_ids: ["EV1"] }),
      ];
      const body = (await (await fetch(`${server.url}/api/report`)).json()) as { stops: { dropped: number; not_reached: number; details: { stop_id: string; status: string }[] }; plan_revisions: number };

      expect(body.stops.details.map((d) => [d.stop_id, d.status])).toEqual([["wp-1", "not_reached"], ["wp-2", "dropped"], ["wp-3", "dropped"]]);
      expect(body.stops.dropped).toBe(2);
      expect(body.plan_revisions).toBe(2);
    });
  });
});

describe("command effects reach every client (T20.04; 02 §D.14, §E.6)", () => {
  const opsHello: ClientMessage = { v: 1, type: "HELLO", role: "ops", client_id: "c-ops", display_name: "", last_seq: 0 };
  const deltas = (c: TestClient) => c.received.filter((m): m is Extract<ServerMessage, { type: "STATE_DELTA" }> => m.type === "STATE_DELTA");

  async function twoClients(session: StatefulSession) {
    const server = await start({ site: "mock_site", port: 0, host: "127.0.0.1", session });
    open.server = server;
    const ev1 = await client(server.url);
    const ops = await client(server.url);
    ev1.send(hello(0));
    ops.send(opsHello);
    await ev1.waitFor((m) => m.type === "SNAPSHOT");
    await ops.waitFor((m) => m.type === "SNAPSHOT");
    return { ev1, ops };
  }

  it("ACK_ALERT by ops: every client gets the EVENT, then a STATE_DELTA with the alert's acked_seq", async () => {
    const session = new StatefulSession(412);
    session.alerts = [ALERT];
    const { ev1, ops } = await twoClients(session);

    ops.send({ v: 1, type: "COMMAND", command_id: "k-ack", role: "ops", command: { kind: "ACK_ALERT", args: { alert_id: "a-420" } } });
    await ops.waitFor((m) => m.type === "COMMAND_RESULT");
    for (const c of [ev1, ops]) {
      const [delta] = await c.waitFor((m) => m.type === "STATE_DELTA");
      expect(delta).toMatchObject({ seq: 413, changes: expect.arrayContaining([{ path: "alerts/a-420/acked_seq", value: 413 }]) });
      // The EVENT comes first, so the client's seq is already 413 when the delta is applied.
      expect(c.received.filter((m) => m.type !== "SNAPSHOT").map((m) => m.type).slice(0, 2)).toEqual(["EVENT", "STATE_DELTA"]);
    }
  });

  it("UPDATE_STOP_TASK: the task's new state reaches the other client", async () => {
    const session = new StatefulSession(412);
    session.tasks = [TASK];
    const { ev1, ops } = await twoClients(session);

    ev1.send({ v: 1, type: "COMMAND", command_id: "k-task", role: "eva:EV1", command: { kind: "UPDATE_STOP_TASK", args: { task_id: "t-s2-02", state: "DONE" } } });
    const [delta] = await ops.waitFor((m) => m.type === "STATE_DELTA");
    expect(delta).toMatchObject({ changes: expect.arrayContaining([{ path: "tasks/t-s2-02/state", value: "DONE" }]) });
  });

  it("a command that changes no state sends no STATE_DELTA", async () => {
    const session = new StatefulSession(412);
    const { ev1 } = await twoClients(session);
    ev1.send({ v: 1, type: "COMMAND", command_id: "k-none", role: "eva:EV1", command: { kind: "SEND_MESSAGE", args: {} } });
    await ev1.waitFor((m) => m.type === "COMMAND_RESULT");
    await new Promise((r) => setTimeout(r, 150));
    // seq and the log hash move with every event, so only those session fields may appear.
    const paths = deltas(ev1).flatMap((d) => d.changes.map((ch) => ch.path));
    expect(paths.filter((p) => !p.startsWith("session/"))).toEqual([]);
  });

  it("an alert raised by the engine tick reaches every client: a new item replaces the whole list", async () => {
    const session = new StatefulSession(412);
    const { ev1, ops } = await twoClients(session);

    session.raise(ALERT);
    for (const c of [ev1, ops]) {
      const [delta] = await c.waitFor((m) => m.type === "STATE_DELTA" && m.changes.some((ch) => ch.path === "alerts"));
      expect(delta).toMatchObject({ changes: expect.arrayContaining([{ path: "alerts", value: [ALERT] }]) });
    }
  });

  it("LOAD_SCENARIO (a new session id) sends every client a fresh SNAPSHOT before the new events, and no delta", async () => {
    const session = new StatefulSession(412);
    const { ev1, ops } = await twoClients(session);

    ops.send({ v: 1, type: "COMMAND", command_id: "k-load", role: "ops", command: { kind: "LOAD_SCENARIO", args: { scenario_id: "storm-sol4190" } } });
    await ops.waitFor((m) => m.type === "COMMAND_RESULT");
    for (const c of [ev1, ops]) {
      const [, second] = await c.waitFor((m) => m.type === "SNAPSHOT", 2);
      expect((second as Snapshot).session.session_id).toBe("s-0008");
      const after = c.received.slice(c.received.indexOf(second) + 1).map((m) => m.type);
      expect(after[0]).toBe("EVENT");
      expect(deltas(c)).toHaveLength(0);
    }
  });
});


describe("role take-over: newest wins (02 §E.4, §E.6; 05 ROLE_TAKEN_OVER)", () => {
  const closeOf = (c: TestClient) => new Promise<{ code: number; reason: string }>((resolve) => c.ws.once("close", (code, reason) => resolve({ code, reason: reason.toString() })));
  const joined = async (url: string, role: Role, client_id: string, last_seq = 0) => {
    const c = await client(url);
    c.send(hello(last_seq, client_id, role));
    await c.waitFor((m) => m.type === "SNAPSHOT");
    return c;
  };
  const takenOver = (c: TestClient) => c.received.filter((m) => m.type === "TAKEN_OVER");

  it("a HELLO for a role another client holds: the old client gets TAKEN_OVER and is closed, the new one is served", async () => {
    const { server, session } = await setup();
    const first = await joined(server.url, "eva:EV1", "c-first");
    const closed = closeOf(first);
    const second = await joined(server.url, "eva:EV1", "c-second");

    await first.waitFor((m) => m.type === "TAKEN_OVER");
    expect(takenOver(first)).toEqual([{ v: 1, type: "TAKEN_OVER", seq: session.lastSeq, sim_time: SIM_TIME, role: "eva:EV1" }]);
    expect(await closed).toEqual({ code: 4001, reason: "taken over" });
    expect(takenOver(second)).toHaveLength(0);
    const snap = second.received.find((m): m is Snapshot => m.type === "SNAPSHOT");
    expect(snap?.clients.map((c) => c.client_id)).toEqual(["c-second"]);

    second.send({ v: 1, type: "COMMAND", command_id: "k-0001", role: "eva:EV1", command: { kind: "ACK_ALERT", args: { alert_id: "a-1" } } });
    expect(await second.waitFor((m) => m.type === "COMMAND_RESULT")).toMatchObject([{ ok: true }]);
    expect(session.clientIds).toEqual(["c-second"]);
  });

  it("logs ROLE_TAKEN_OVER once through the session, with crew_id for an EVA role and the client ids", async () => {
    const { server, session } = await setup();
    await joined(server.url, "eva:EV1", "c-first");
    await joined(server.url, "eva:EV1", "c-second");
    await new Promise((r) => setTimeout(r, 30));
    expect(session.takeovers).toEqual([{ role: "eva:EV1", crew_id: "EV1", old_client_id: "c-first", new_client_id: "c-second" }]);
  });

  it("a role with no crew member logs no crew_id key", async () => {
    const { server, session } = await setup();
    await joined(server.url, "ops", "c-ops-1");
    await joined(server.url, "ops", "c-ops-2");
    expect(session.takeovers).toEqual([{ role: "ops", old_client_id: "c-ops-1", new_client_id: "c-ops-2" }]);
    expect(Object.keys(session.takeovers[0])).not.toContain("crew_id");
  });

  it("the other connected clients receive the ROLE_TAKEN_OVER event (ops console event log)", async () => {
    const { server } = await setup();
    const ops = await joined(server.url, "ops", "c-ops");
    await joined(server.url, "eva:EV1", "c-first");
    await joined(server.url, "eva:EV1", "c-second");
    const [event] = await ops.waitFor((m) => m.type === "EVENT" && m.event.kind === "ROLE_TAKEN_OVER");
    expect(event).toMatchObject({ event: { actor: "system", command_ref: null, data: { role: "eva:EV1", old_client_id: "c-first", new_client_id: "c-second" } } });
  });

  it("a HUD and the tablet of one crew member do not displace each other; a second HUD takes over only the first HUD", async () => {
    const { server, session } = await setup();
    const tablet = await joined(server.url, "eva:EV1", "c-tablet");
    const hud1 = await joined(server.url, "hud:EV1", "c-hud-1");
    await new Promise((r) => setTimeout(r, 30));
    expect(takenOver(tablet)).toHaveLength(0);
    expect(takenOver(hud1)).toHaveLength(0);
    expect(session.takeovers).toEqual([]);

    const closed = closeOf(hud1);
    await joined(server.url, "hud:EV1", "c-hud-2");
    expect((await closed).code).toBe(4001);
    expect(takenOver(hud1)).toMatchObject([{ role: "hud:EV1" }]);
    expect(takenOver(tablet)).toHaveLength(0);
    expect(tablet.ws.readyState).toBe(WebSocket.OPEN);
    expect(session.takeovers).toEqual([{ role: "hud:EV1", crew_id: "EV1", old_client_id: "c-hud-1", new_client_id: "c-hud-2" }]);
  });

  it("different roles do not displace each other", async () => {
    const { server, session } = await setup();
    const clients = [await joined(server.url, "ops", "c-1"), await joined(server.url, "eva:EV1", "c-2"), await joined(server.url, "eva:EV2", "c-3"), await joined(server.url, "earth", "c-4")];
    await new Promise((r) => setTimeout(r, 50));
    for (const c of clients) {
      expect(takenOver(c)).toHaveLength(0);
      expect(c.ws.readyState).toBe(WebSocket.OPEN);
    }
    expect(session.takeovers).toEqual([]);
  });

  it("the same client_id reconnecting replaces its own stale socket silently: no notice, no event", async () => {
    const { server, session } = await setup();
    const stale = await joined(server.url, "eva:EV1", "c-same");
    const closed = closeOf(stale);
    const fresh = await joined(server.url, "eva:EV1", "c-same", 400);
    const { code } = await closed;
    expect(code).not.toBe(4001);
    expect(takenOver(stale)).toHaveLength(0);
    expect(takenOver(fresh)).toHaveLength(0);
    expect(session.takeovers).toEqual([]);
  });

  it("a displaced client's later commands are not applied: one sent the instant TAKEN_OVER arrives, before its close, is dropped", async () => {
    const { server, session } = await setup();
    const first = await joined(server.url, "eva:EV1", "c-first");
    const closed = closeOf(first);
    // Sent from the message handler itself, so the socket is still open on the client when the command goes out.
    // The server has marked this client not joined by then; the INVALID reply cannot be delivered on a closing socket.
    first.ws.on("message", (raw) => {
      if ((JSON.parse(raw.toString()) as ServerMessage).type === "TAKEN_OVER") {
        first.send({ v: 1, type: "COMMAND", command_id: "k-late", role: "eva:EV1", command: { kind: "ACK_ALERT", args: { alert_id: "a-1" } } });
      }
    });
    await joined(server.url, "eva:EV1", "c-second");
    await closed;
    await new Promise((r) => setTimeout(r, 50));
    expect(first.received.filter((m) => m.type === "COMMAND_RESULT" && m.ok)).toEqual([]);
    expect(session.applied).toEqual([]);
  });

  it("a displaced client_id may not take its role back by reconnecting: it gets TAKEN_OVER and 4001, the new holder stays", async () => {
    const { server, session } = await setup();
    const a = await joined(server.url, "eva:EV1", "c-a");
    const b = await joined(server.url, "eva:EV1", "c-b");
    await a.waitFor((m) => m.type === "TAKEN_OVER");

    const again = await client(server.url);
    const closed = closeOf(again);
    again.send(hello(0, "c-a", "eva:EV1"));
    await again.waitFor((m) => m.type === "TAKEN_OVER");
    expect(await closed).toEqual({ code: 4001, reason: "taken over" });
    expect(again.received.map((m) => m.type)).toEqual(["TAKEN_OVER"]); // no SNAPSHOT: it is not served

    expect(takenOver(b)).toHaveLength(0);
    expect(b.ws.readyState).toBe(WebSocket.OPEN);
    expect(session.takeovers).toHaveLength(1); // nothing displaced, nothing logged again
    b.send({ v: 1, type: "COMMAND", command_id: "k-b", role: "eva:EV1", command: { kind: "ACK_ALERT", args: { alert_id: "a-1" } } });
    expect(await b.waitFor((m) => m.type === "COMMAND_RESULT")).toMatchObject([{ ok: true }]);
    expect(session.clientIds).toEqual(["c-b"]);
  });

  it("a displaced client_id is barred only from the role it lost", async () => {
    const { server } = await setup();
    await joined(server.url, "eva:EV1", "c-a");
    await joined(server.url, "eva:EV1", "c-b");
    const other = await client(server.url);
    other.send(hello(0, "c-a", "ops"));
    expect(await other.waitFor((m) => m.type === "SNAPSHOT")).toHaveLength(1);
  });

  it("a HELLO on a socket the server already released is ignored: it neither joins nor displaces the new holder", async () => {
    const { server, session } = await setup();
    const first = await joined(server.url, "eva:EV1", "c-first");
    // Sent from the message handler, while the old socket is still open on the client but already released on the server.
    first.ws.on("message", (raw) => {
      if ((JSON.parse(raw.toString()) as ServerMessage).type === "TAKEN_OVER") first.send(hello(0, "c-third", "eva:EV1"));
    });
    const second = await joined(server.url, "eva:EV1", "c-second");
    await first.waitFor((m) => m.type === "TAKEN_OVER");
    await new Promise((r) => setTimeout(r, 50));
    expect(takenOver(second)).toHaveLength(0);
    expect(session.takeovers).toHaveLength(1);
  });

  it("without a session the old client is still displaced (nothing to log)", async () => {
    const server = await startServer({ site: "mock_site", port: 0, host: "127.0.0.1" });
    open.server = server;
    const first = await client(server.url);
    first.send(hello(0, "c-first"));
    await new Promise((r) => setTimeout(r, 30));
    const closed = closeOf(first);
    const second = await client(server.url);
    second.send(hello(0, "c-second"));
    expect((await closed).code).toBe(4001);
  });
});
