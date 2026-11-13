/**
 * T20.05: web client for the Hab Core (02 §E.6; FR-31, FR-32, NFR-13).
 * Fails against the stub until T20.06 (pair T20.05 → T20.06). Uses the T20.02 fixtures and a fake
 * socket, so no DOM is needed.
 *
 * API these tests fix for T20.06:
 *   connectHab({role, clientId, displayName, url?, socketFactory?}) → HabClient with
 *   state(), events(), lastSeq(), linkLost(), send(command), subscribe(listener), close().
 * The cast exists only because the current stub's signature predates it; T20.06 aligns it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LINK_LOST_AFTER_MS,
  type ClientMessage,
  type Command,
  type CommandResult,
  type LogEvent,
  type Role,
  type ServerMessage,
  type Snapshot,
} from "@marswalk/protocol";
import * as habClientModule from "../../src/net/habClient";
import { wsFixtures } from "../fixtures/ws";

// ---- API under test ----------------------------------------------------------------------------

interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
}

interface ClientUnderTest {
  readonly role: Role;
  state(): Snapshot | null;
  events(): LogEvent[];
  lastSeq(): number;
  linkLost(): { lost: boolean; since_ms: number | null };
  takenOver(): boolean;
  send(command: Pick<Command, "kind" | "args">): Promise<CommandResult>;
  subscribe(listener: () => void): () => void;
  close(): void;
}

type ConnectUnderTest = (o: {
  role: Role;
  clientId: string;
  displayName: string;
  url?: string;
  socketFactory?: (url: string) => SocketLike;
}) => ClientUnderTest;
const connect = habClientModule.connectHab as unknown as ConnectUnderTest;

// ---- Fake socket -------------------------------------------------------------------------------

const OPEN = 1;
const CLOSED = 3;

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close(): void {
    this.drop();
  }
  open(): void {
    this.readyState = OPEN;
    this.onopen?.();
  }
  receive(...msgs: ServerMessage[]): void {
    for (const m of msgs) this.onmessage?.({ data: JSON.stringify(m) });
  }
  drop(): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.onclose?.();
  }
}

let sockets: FakeSocket[] = [];
const factory = (url: string): SocketLike => {
  const s = new FakeSocket(url);
  sockets.push(s);
  return s;
};
const latest = (): FakeSocket => sockets[sockets.length - 1];

/** A socket factory that always makes a fresh fake socket, like a page load would. */
const latestFactory = (): ((url: string) => SocketLike) => factory;

function start(role: Role = "eva:EV1"): ClientUnderTest {
  return connect({ role, clientId: "c-7f3a", displayName: "", url: "ws://hab.test/ws", socketFactory: factory }); // 02 §E.6 HELLO client_id
}

const snapshot = wsFixtures.connect[0] as Snapshot;

beforeEach(() => {
  sockets = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// ---- Tests -------------------------------------------------------------------------------------

describe("Hab Core web client (T20.05 → T20.06)", () => {
  it("sends HELLO with its role, client_id, display_name and last_seq 0 on connect (02 §E.6)", () => {
    start();
    latest().open();
    expect(latest().sent).toEqual([{ v: 1, type: "HELLO", role: "eva:EV1", client_id: "c-7f3a", display_name: "", last_seq: 0 }]);
  });

  it("applies SNAPSHOT then STATE_DELTA in seq order; older deltas and duplicate events are ignored", () => {
    const c = start();
    latest().open();
    latest().receive(snapshot, ...wsFixtures.walking);
    expect(c.lastSeq()).toBe(413);
    expect(c.state()?.crew[0].x_m).toBe(2411.2); // 02 §E.6 STATE_DELTA example
    // An older delta (seq 412) must not overwrite newer state.
    latest().receive({ v: 1, type: "STATE_DELTA", seq: 412, sim_time: "", changes: [{ path: "crew/EV1/x_m", value: 0 }] });
    expect(c.state()?.crew[0].x_m).toBe(2411.2);
    // The same EVENT twice is applied once.
    const alert = wsFixtures["radiation-alert"][0];
    latest().receive(alert, alert);
    expect(c.events().map((e) => e.seq)).toEqual([420]);
    expect(c.lastSeq()).toBe(420);
  });

  it("reconnects with backoff 0.5 s → 1 s cap and sends HELLO with the last applied seq (NFR-13)", () => {
    const c = start();
    latest().open();
    latest().receive(snapshot);
    const delays = [500, 1000, 1000, 1000, 1000];
    for (const d of delays) {
      const before = sockets.length;
      latest().drop();
      vi.advanceTimersByTime(d - 1);
      expect(sockets.length, `no reconnect before ${d} ms`).toBe(before);
      vi.advanceTimersByTime(1);
      expect(sockets.length, `reconnect at ${d} ms`).toBe(before + 1);
    }
    latest().open();
    expect(latest().sent[0]).toMatchObject({ type: "HELLO", last_seq: c.lastSeq() });
    expect(c.lastSeq()).toBe(412);
  });

  it("never waits longer than 1 s before a retry, however long the outage (NFR-13 reconnect <= 2 s)", () => {
    start();
    for (let i = 0; i < 12; i++) {
      const before = sockets.length;
      if (i === 0) latest().open();
      latest().drop();
      vi.advanceTimersByTime(1000);
      expect(sockets.length, `retry ${i + 1} within 1000 ms`).toBe(before + 1);
    }
  });

  it("keeps the event feed when a SNAPSHOT arrives on reconnect (T20.13, 02 §E.6)", () => {
    const c = start();
    latest().open();
    latest().receive(snapshot, wsFixtures["radiation-alert"][0]);
    expect(c.events().map((e) => e.seq)).toEqual([420]);
    latest().drop();
    vi.advanceTimersByTime(500);
    latest().open();
    latest().receive({ ...snapshot, seq: 430 });
    expect(c.events().map((e) => e.seq)).toEqual([420]);
    expect(c.lastSeq()).toBe(430);
    expect(c.state()?.seq).toBe(430);
  });

  it("clears the event feed when a SNAPSHOT of another session arrives: seq restarts, and the new events are not mistaken for old ones", () => {
    const c = start();
    latest().open();
    latest().receive(snapshot, wsFixtures["radiation-alert"][0]); // session s-0007, event 420
    expect(c.events().map((e) => e.seq)).toEqual([420]);

    const fresh: Snapshot = { ...snapshot, seq: 1, session: { ...snapshot.session, session_id: "s-0008", last_seq: 1 } };
    latest().receive(fresh);
    expect(c.events()).toEqual([]);
    expect(c.lastSeq()).toBe(1);
    expect(c.state()?.session.session_id).toBe("s-0008");

    // The new session numbers its events from 1 again: 420 was in the old feed, 2 never was; both must be taken.
    const alert = wsFixtures["radiation-alert"][0] as Extract<ServerMessage, { type: "EVENT" }>;
    const at = (n: number): ServerMessage => ({ ...alert, seq: n, event: { ...alert.event, seq: n } });
    latest().receive(at(2), at(420));
    expect(c.events().map((e) => e.seq)).toEqual([2, 420]);
  });

  it("a SNAPSHOT with a new session_id also resets last_seq: the next HELLO carries the new session's seq, not the old one (T32.15 client half)", () => {
    const c = start();
    latest().open();
    latest().receive(snapshot, wsFixtures["radiation-alert"][0]); // s-0007, last event 420
    expect(c.lastSeq()).toBe(420);

    latest().receive({ ...snapshot, seq: 1, session: { ...snapshot.session, session_id: "s-0008", last_seq: 1 } });
    expect(c.lastSeq()).toBe(1);

    latest().drop();
    vi.advanceTimersByTime(500);
    latest().open();
    expect(latest().sent[0]).toMatchObject({ type: "HELLO", last_seq: 1 });
  });

  it("a SNAPSHOT of the same session on reconnect keeps the feed (only a different session_id resets it)", () => {
    const c = start();
    latest().open();
    latest().receive(snapshot, wsFixtures["radiation-alert"][0]);
    latest().receive({ ...snapshot, seq: 500 });
    expect(c.events().map((e) => e.seq)).toEqual([420]);
  });

  it("applies the STATE_DELTAs the Hab Core sends for commands: acked alert, task state, a whole new alert list (02 §E.6)", () => {
    const c = start();
    latest().open();
    const alert = { alert_id: "a-420", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1"], raised_seq: 420, acked_seq: null, cleared_seq: null, acked_by: null, message: "m", data: {} } as Snapshot["alerts"][number];
    latest().receive({ ...snapshot, alerts: [alert] });
    latest().receive({ v: 1, type: "STATE_DELTA", seq: 413, sim_time: "", changes: [{ path: "alerts/a-420/acked_seq", value: 413 }, { path: "tasks/t-s2-02/state", value: "DONE" }] });
    expect(c.state()?.alerts[0].acked_seq).toBe(413);
    expect(c.state()?.tasks[0].state).toBe("DONE");

    latest().receive({ v: 1, type: "STATE_DELTA", seq: 414, sim_time: "", changes: [{ path: "alerts", value: [] }, { path: "session/status", value: "PAUSED" }] });
    expect(c.state()?.alerts).toEqual([]);
    expect(c.state()?.session.status).toBe("PAUSED");
  });

  it("matches a list item on that list's own id field only: an option whose alert_id equals the path id is not the one meant", () => {
    const c = start();
    latest().open();
    const option = (option_id: string, alert_id: string, eta: number) => ({ option_id, alert_id, kind: "ABORT_TO_HAB", crew_ids: ["EV1"], eta_shelter_min: eta, expected_dose_ugy: 0, stops_dropped: [], violations: [], rank: 1, path_preview: [], rendezvous: null });
    latest().receive({ ...snapshot, options: [option("o9", "o1", 5), option("o1", "a-1", 7)] as unknown as Snapshot["options"] });
    latest().receive({ v: 1, type: "STATE_DELTA", seq: 413, sim_time: "", changes: [{ path: "options/o1/eta_shelter_min", value: 99 }] });

    expect(c.state()?.options.map((o) => o.eta_shelter_min)).toEqual([5, 99]);
    // A task is addressed by task_id, not by its stop_id.
    latest().receive({ v: 1, type: "STATE_DELTA", seq: 414, sim_time: "", changes: [{ path: "tasks/wp-2/state", value: "DONE" }] });
    expect(c.state()?.tasks[0].state).toBe("TODO");
  });

  it("adds replayed EVENTs at or below the SNAPSHOT seq to the feed, deduped by seq, without changing state (T20.13)", () => {
    const c = start();
    latest().open();
    latest().receive(snapshot, wsFixtures["radiation-alert"][0]); // seq 420 in the feed
    latest().drop();
    vi.advanceTimersByTime(500);
    latest().open();
    const fresh = { ...snapshot, seq: 430 };
    latest().receive(fresh);
    const stateBefore = c.state();
    const alert = wsFixtures["radiation-alert"][0] as Extract<ServerMessage, { type: "EVENT" }>;
    const at = (n: number): ServerMessage => ({ ...alert, seq: n, event: { ...alert.event, seq: n } });
    // Replay after last_seq 420: 421 and 425 are new and sit below the SNAPSHOT's 430; 420 repeats.
    latest().receive(at(421), at(420), at(425), at(421));
    expect(c.events().map((e) => e.seq)).toEqual([420, 421, 425]);
    expect(c.state()).toBe(stateBefore); // same reference: state did not change
    expect(c.lastSeq()).toBe(430);
    // A new live event above the SNAPSHOT still advances seq.
    latest().receive(at(431));
    expect(c.events().map((e) => e.seq)).toEqual([420, 421, 425, 431]);
    expect(c.lastSeq()).toBe(431);
  });

  it("raises HAB LINK LOST after LINK_LOST_AFTER_MS without a PING and clears it on the next PING (FR-32)", () => {
    const c = start();
    latest().open();
    latest().receive(snapshot);
    expect(c.linkLost().lost).toBe(false);
    vi.advanceTimersByTime(LINK_LOST_AFTER_MS - 1);
    expect(c.linkLost().lost).toBe(false);
    vi.advanceTimersByTime(1);
    expect(c.linkLost().lost).toBe(true);
    expect(c.linkLost().since_ms).not.toBeNull();
    latest().receive(wsFixtures.walking[1]); // A closed socket cannot restore the link.
    expect(c.linkLost().lost).toBe(true);
    vi.advanceTimersByTime(500);
    latest().open();
    latest().receive(wsFixtures.walking[1]); // PING on the new connection
    expect(c.linkLost()).toEqual({ lost: false, since_ms: null });
  });

  it("queues a command sent while unlinked and resends it once, flagged queued_offline, after reconnect", async () => {
    const c = start();
    latest().open();
    latest().receive(snapshot);
    latest().drop();
    const result = c.send({ kind: "SUMMON_VEHICLE", args: { crew: ["EV1", "EV2"] } }); // 02 §E.6 COMMAND example
    vi.advanceTimersByTime(500);
    latest().open();
    latest().receive(snapshot);
    const commands = latest().sent.filter((m) => m.type === "COMMAND");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ role: "eva:EV1", command: { kind: "SUMMON_VEHICLE", queued_offline: true } });
    const id = (commands[0] as Extract<ClientMessage, { type: "COMMAND" }>).command_id;
    latest().receive({ v: 1, type: "COMMAND_RESULT", command_id: id, ok: true, event_seq: 421 });
    await expect(result).resolves.toMatchObject({ ok: true, event_seq: 421 });
    vi.advanceTimersByTime(10_000);
    expect(sockets.flatMap((s) => s.sent).filter((m) => m.type === "COMMAND")).toHaveLength(1);
  });

  it("keeps a NO_LINK command queued and resends it on LINK_STATE linked=true (02 §E.6)", async () => {
    const c = start();
    latest().open();
    latest().receive(snapshot);
    const result = c.send({ kind: "ACK_ALERT", args: {} });
    const first = latest().sent.find((m) => m.type === "COMMAND") as Extract<ClientMessage, { type: "COMMAND" }>;
    latest().receive({ v: 1, type: "COMMAND_RESULT", command_id: first.command_id, ok: false, code: "NO_LINK", message: "" });
    expect(latest().sent.filter((m) => m.type === "COMMAND")).toHaveLength(1);
    latest().receive(...wsFixtures["link-lost-restored"].filter((m) => m.type === "LINK_STATE"));
    const commands = latest().sent.filter((m) => m.type === "COMMAND") as Extract<ClientMessage, { type: "COMMAND" }>[];
    expect(commands).toHaveLength(2);
    expect(commands[1]).toMatchObject({ command_id: first.command_id, command: { queued_offline: true } });
    latest().receive({ v: 1, type: "COMMAND_RESULT", command_id: first.command_id, ok: true, event_seq: 0 });
    await expect(result).resolves.toMatchObject({ ok: true });
  });

  it("subscribers are notified when the store changes; unsubscribe stops them", () => {
    const c = start();
    const listener = vi.fn();
    const off = c.subscribe(listener);
    latest().open();
    latest().receive(snapshot);
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    latest().receive(wsFixtures.walking[0]);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("Hab Core web client: taken over by another device (02 §E.4, §E.6)", () => {
  const taken = (role: Role = "eva:EV1"): ServerMessage => ({ v: 1, type: "TAKEN_OVER", seq: 430, sim_time: "2024-05-20T13:14:00Z", role });

  it("TAKEN_OVER sets takenOver(), notifies subscribers and keeps the last values", () => {
    const c = start();
    const listener = vi.fn();
    c.subscribe(listener);
    latest().open();
    latest().receive(snapshot);
    expect(c.takenOver()).toBe(false);
    listener.mockClear();
    latest().receive(taken());
    expect(c.takenOver()).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(c.state()).not.toBeNull();
  });

  it("does not reconnect after the Hab Core closes the socket: no new socket however long it waits", () => {
    const c = start();
    latest().open();
    latest().receive(snapshot, taken());
    latest().drop();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(c.takenOver()).toBe(true);
  });

  it("does not raise HAB LINK LOST: the link is fine, the role is gone", () => {
    const c = start();
    latest().open();
    latest().receive(snapshot, taken());
    latest().drop();
    vi.advanceTimersByTime(LINK_LOST_AFTER_MS * 5);
    expect(c.linkLost().lost).toBe(false);
  });

  it("resolves queued and later commands as rejected instead of leaving them waiting", async () => {
    const c = start();
    latest().open();
    latest().receive(snapshot);
    const inFlight = c.send({ kind: "ACK_ALERT", args: { alert_id: "a-1" } });
    latest().receive(taken());
    latest().drop();
    expect(await inFlight).toMatchObject({ ok: false, message: expect.stringMatching(/taken over/i) });
    expect(await c.send({ kind: "ACK_ALERT", args: { alert_id: "a-1" } })).toMatchObject({ ok: false, message: expect.stringMatching(/taken over/i) });
    expect(latest().sent.filter((m) => m.type === "COMMAND")).toHaveLength(1);
  });

  it("ignores a TAKEN_OVER for a role this client does not hold", () => {
    const c = start("eva:EV1");
    latest().open();
    latest().receive(snapshot, taken("ops"));
    expect(c.takenOver()).toBe(false);
  });
});

describe("T24.07 link deadline and T24.10 resend", () => {
  it("a close at 2.9 seconds and a new socket open cannot extend the last-message deadline", () => {
    const client = start();
    latest().open(); latest().receive(snapshot);
    vi.advanceTimersByTime(2900);
    latest().drop();
    vi.advanceTimersByTime(100);
    expect(client.linkLost().lost).toBe(true);
    client.close();
  });
  it("repeated opens without server messages do not postpone loss", () => {
    const client = start(); latest().open(); latest().receive(snapshot);
    vi.advanceTimersByTime(2400); latest().drop();
    vi.advanceTimersByTime(500); latest().open();
    vi.advanceTimersByTime(100);
    expect(client.linkLost().lost).toBe(true);
    client.close();
  });
  it("reports actual socket state and reconnect attempts before the heartbeat deadline", () => {
    const client = start() as ReturnType<typeof habClientModule.connectHab>;
    latest().open(); latest().receive(snapshot);
    latest().drop();
    expect(client.socketConnected?.()).toBe(false);
    vi.advanceTimersByTime(500);
    expect(client.reconnectCount?.()).toBe(1);
    latest().drop(); vi.advanceTimersByTime(1000);
    expect(client.reconnectCount?.()).toBe(2);
    client.close();
  });
  it("drops AFTER a command dispatch, resends its stable id once and settles one result", async () => {
    const client = start(); latest().open(); latest().receive(snapshot);
    const resolved = vi.fn();
    const pending = client.send({ kind: "SUMMON_VEHICLE", args: { crew: ["EV1"] } }).then(resolved);
    const first = latest().sent.find((m) => m.type === "COMMAND")! as Extract<ClientMessage, {type: "COMMAND"}>;
    expect(first).toBeTruthy();
    latest().drop(); vi.advanceTimersByTime(500); latest().open();
    const sent = latest().sent.filter((m) => m.type === "COMMAND") as Extract<ClientMessage, {type: "COMMAND"}>[];
    expect(sent).toHaveLength(1);
    expect(sent[0].command_id).toBe(first.command_id);
    expect(sent[0].command.queued_offline).toBe(true);
    const result: CommandResult = { v: 1, type: "COMMAND_RESULT", command_id: first.command_id, ok: true, event_seq: 421 };
    latest().receive(result, result);
    await pending;
    expect(resolved).toHaveBeenCalledTimes(1);
    client.close();
  });

  it("the 3-second watchdog marks linkLost without mutating simulated snapshot state", () => {
    const c = start();
    latest().open();
    latest().receive(snapshot);
    const before = c.state()!;
    const beforeSimTime = before.sim_time;
    const beforeO2 = before.crew.map((m) => m.o2_frac);
    const beforeHaven = before.crew.map((m) => m.haven.minutes);

    vi.advanceTimersByTime(LINK_LOST_AFTER_MS - 1);
    expect(c.linkLost().lost).toBe(false);
    vi.advanceTimersByTime(1);
    expect(c.linkLost().lost).toBe(true);
    expect(c.state()).toBe(before);
    expect(c.state()!.sim_time).toBe(beforeSimTime);
    expect(c.state()!.crew.map((m) => m.o2_frac)).toEqual(beforeO2);
    expect(c.state()!.crew.map((m) => m.haven.minutes)).toEqual(beforeHaven);
    c.close();
  });

  it("persists queued commands across a page reload (sessionStorage) and resends once on the same session", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });
    try {
      // First page load: connect, get SNAPSHOT, drop socket, queue SUMMON_VEHICLE, reload WITHOUT calling close().
      const c1 = start("eva:EV1");
      latest().open();
      latest().receive(snapshot);
      latest().drop();
      void c1.send({ kind: "SUMMON_VEHICLE", args: { crew: ["EV1"] } });
      expect(store.size).toBe(1);

      // Simulate page reload: fresh connectHab for same role with a new client_id; wait for matching SNAPSHOT.
      const c2 = connect({
        role: "eva:EV1",
        clientId: "c-reloaded",
        displayName: "EV1 tablet",
        url: "ws://localhost/ws",
        socketFactory: latestFactory(),
      });
      latest().open();
      // Before SNAPSHOT arrives, restored command waits so stale sessions never receive it.
      expect(latest().sent.filter((m) => m.type === "COMMAND")).toHaveLength(0);
      latest().receive(snapshot);
      const resent = latest().sent.filter((m) => m.type === "COMMAND") as Extract<ClientMessage, { type: "COMMAND" }>[];
      expect(resent).toHaveLength(1);
      expect(resent[0].command.kind).toBe("SUMMON_VEHICLE");
      expect(resent[0].command.queued_offline).toBe(true);

      // Once confirmed by COMMAND_RESULT, storage clears so a subsequent reload does not resend again.
      latest().receive({ v: 1, type: "COMMAND_RESULT", command_id: resent[0].command_id, ok: true, event_seq: 422 });
      const c3 = connect({
        role: "eva:EV1",
        clientId: "c-reloaded-2",
        displayName: "EV1 tablet",
        url: "ws://localhost/ws",
        socketFactory: latestFactory(),
      });
      latest().open();
      latest().receive(snapshot);
      expect(latest().sent.filter((m) => m.type === "COMMAND")).toHaveLength(0);
      c3.close();
      c2.close();
    } finally {
      Reflect.deleteProperty(globalThis, "sessionStorage");
    }
  });

  it("drops stored commands from a different session_id and clears storage on close() or TAKEN_OVER", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });
    try {
      const c1 = start("eva:EV1");
      latest().open();
      latest().receive(snapshot);
      latest().drop();
      void c1.send({ kind: "ABORT", args: { crew: ["EV1"] } });
      expect(store.size).toBe(1);

      const c2 = connect({
        role: "eva:EV1",
        clientId: "c-new-session",
        displayName: "EV1 tablet",
        url: "ws://localhost/ws",
        socketFactory: latestFactory(),
      });
      latest().open();
      latest().receive({ ...snapshot, session: { ...snapshot.session, session_id: "s-different" } });
      expect(latest().sent.filter((m) => m.type === "COMMAND")).toHaveLength(0);
      expect(store.size).toBe(0);

      latest().drop();
      void c2.send({ kind: "ABORT", args: { crew: ["EV1"] } });
      expect(store.size).toBe(1);
      c2.close();
      expect(store.size).toBe(0);
    } finally {
      Reflect.deleteProperty(globalThis, "sessionStorage");
    }
  });
});
