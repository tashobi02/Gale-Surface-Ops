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
    latest().receive(wsFixtures.walking[1]); // PING
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
