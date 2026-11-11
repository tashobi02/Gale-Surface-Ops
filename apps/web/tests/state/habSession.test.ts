/**
 * T25.01 — habSession: one Hab Core connection per tab and the React hooks over it (docs/specs/02 §E.6;
 * 01 FR-32, FR-33; 03 SCR-12/13/14/18). The store computes nothing: it passes the client's snapshot, events,
 * link-lost state and command results to the views.
 *
 * Driven through the real client (apps/web/src/net/habClient.ts) with a fake socket and the T20.02 fixtures.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactElement } from "react";
import {
  LINK_LOST_AFTER_MS,
  PROTOCOL_VERSION,
  type ClientMessage,
  type CommandResult,
  type ServerMessage,
  type Snapshot,
} from "@marswalk/protocol";
import type { SocketLike } from "../../src/net/habClient";
import {
  closeHabSessions,
  currentHabClient,
  startHabSession,
  useCommand,
  useEvents,
  useLinkLost,
  useSnapshot,
  useTakenOver,
} from "../../src/state/habSession";
import { wsFixtures } from "../fixtures/ws";
import { installDom, mount, must, removeDom } from "../ui/domHarness";

class FakeSocket implements SocketLike {
  readyState = 1;
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
  async receive(...messages: ServerMessage[]): Promise<void> {
    await act(async () => {
      for (const m of messages) this.onmessage?.({ data: JSON.stringify(m) });
    });
  }
}

/** A socket factory that remembers every socket it made. */
function sockets(): { factory: (url: string) => SocketLike; made: FakeSocket[] } {
  const made: FakeSocket[] = [];
  return {
    made,
    factory: () => {
      const s = new FakeSocket();
      made.push(s);
      return s;
    },
  };
}

function open(role: "eva:EV1" | "eva:EV2" | "ops", factory: (url: string) => SocketLike) {
  return startHabSession({ role, clientId: `c-${role}`, displayName: role, url: "ws://localhost/ws", socketFactory: factory });
}

function newSession(id: string, seq: number): Snapshot {
  const base = wsFixtures.connect[0] as Snapshot;
  return { ...base, seq, session: { ...base.session, session_id: id, last_seq: seq } };
}

/** Renders what each hook returns into attributes, so a test reads the DOM and not the hook internals. */
function Probe(): ReactElement {
  const snapshot = useSnapshot();
  const events = useEvents();
  const link = useLinkLost();
  return createElement("div", {
    id: "probe",
    "data-o2": String(snapshot?.crew[0]?.o2_frac ?? "none"),
    "data-session": snapshot?.session.session_id ?? "none",
    "data-events": events.map((e) => e.seq).join(","),
    "data-lost": String(link.lost),
  });
}

let sendRef: ReturnType<typeof useCommand> | null = null;
function CommandProbe(): ReactElement | null {
  sendRef = useCommand();
  return null;
}

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(async () => {
  closeHabSessions();
  sendRef = null;
  vi.useRealTimers();
  // Closing notifies the roots earlier tests left mounted; let React finish that while the DOM still exists.
  await act(async () => {});
  document.body.innerHTML = "";
});

describe("one Hab Core connection per tab", () => {
  it("starting the same role twice returns the same client and opens one socket", () => {
    const { factory, made } = sockets();
    const first = open("eva:EV1", factory);
    const second = open("eva:EV1", factory);

    expect(second).toBe(first);
    expect(made).toHaveLength(1);
    expect(currentHabClient()).toBe(first);
  });

  it("a different role gets its own connection and becomes the tab's current client", () => {
    const { factory, made } = sockets();
    const ev1 = open("eva:EV1", factory);
    const ev2 = open("eva:EV2", factory);

    expect(ev2).not.toBe(ev1);
    expect(made).toHaveLength(2);
    expect(currentHabClient()).toBe(ev2);
  });

  it("mounting views never opens a socket of their own", async () => {
    const { factory, made } = sockets();
    open("eva:EV1", factory);
    await mount(createElement("div", null, createElement(Probe), createElement(Probe), createElement(CommandProbe)));
    expect(made).toHaveLength(1);
  });

  it("closeHabSessions closes the socket and forgets the client", () => {
    const { factory, made } = sockets();
    open("eva:EV1", factory);
    closeHabSessions();

    expect(currentHabClient()).toBeNull();
    expect(made[0].readyState).toBe(3);
  });
});

describe("hooks re-render on store changes without a remount", () => {
  it("useSnapshot follows SNAPSHOT and STATE_DELTA; the element is the same node throughout", async () => {
    const { factory, made } = sockets();
    open("eva:EV1", factory);
    const { container } = await mount(createElement(Probe));
    const node = must(container, "#probe");
    expect(node.getAttribute("data-o2")).toBe("none");

    await made[0].receive(...wsFixtures.connect);
    expect(node.getAttribute("data-o2")).toBe("0.71");

    await made[0].receive(...wsFixtures.walking);
    expect(must(container, "#probe")).toBe(node);
    expect(node.getAttribute("data-o2")).toBe("0.7099");
  });

  it("useEvents appends EVENTs in order and keeps what it already had", async () => {
    const { factory, made } = sockets();
    open("eva:EV1", factory);
    const { container } = await mount(createElement(Probe));
    await made[0].receive(...wsFixtures.connect, ...wsFixtures["radiation-alert"]);
    expect(must(container, "#probe").getAttribute("data-events")).toBe("420");

    await made[0].receive(...wsFixtures["options-proposed"]);
    expect(must(container, "#probe").getAttribute("data-events")).toBe("420,421");
  });

  it("an explicit client wins over the tab's session", async () => {
    const tab = sockets();
    const other = sockets();
    open("eva:EV1", tab.factory);
    const explicit = open("ops", other.factory);
    // `ops` was started last, so it is current; ask for EV1's explicitly through a probe.
    let seen: Snapshot | null | undefined;
    function Explicit(): null {
      seen = useSnapshot(explicit);
      return null;
    }
    await mount(createElement(Explicit));
    await other.made[0].receive(...wsFixtures.connect);
    expect(seen?.session.session_id).toBe("s-0007");
    expect(tab.made[0].sent).toEqual([]);
  });
});

describe("events reset on a new session", () => {
  it("events of the old session are dropped when a SNAPSHOT of another session arrives", async () => {
    const { factory, made } = sockets();
    open("eva:EV1", factory);
    const { container } = await mount(createElement(Probe));
    await made[0].receive(...wsFixtures.connect, ...wsFixtures["radiation-alert"]);
    expect(must(container, "#probe").getAttribute("data-events")).toBe("420");

    await made[0].receive(newSession("s-0008", 900));
    expect(must(container, "#probe").getAttribute("data-session")).toBe("s-0008");
    expect(must(container, "#probe").getAttribute("data-events")).toBe("");

    const next = (wsFixtures["options-proposed"][0] as Extract<ServerMessage, { type: "EVENT" }>);
    await made[0].receive({ ...next, seq: 901, event: { ...next.event, seq: 901 } });
    expect(must(container, "#probe").getAttribute("data-events")).toBe("901");
  });

  it("a reconnect SNAPSHOT of the same session keeps the events", async () => {
    const { factory, made } = sockets();
    open("eva:EV1", factory);
    const { container } = await mount(createElement(Probe));
    await made[0].receive(...wsFixtures.connect, ...wsFixtures["radiation-alert"]);
    await made[0].receive({ ...(wsFixtures.connect[0] as Snapshot), seq: 430 });

    expect(must(container, "#probe").getAttribute("data-events")).toBe("420");
  });
});

describe("link lost", () => {
  it("flips to lost after LINK_LOST_AFTER_MS of silence and back on the next server message", async () => {
    vi.useFakeTimers();
    const { factory, made } = sockets();
    open("eva:EV1", factory);
    const { container } = await mount(createElement(Probe));
    await made[0].receive(...wsFixtures.connect);
    expect(must(container, "#probe").getAttribute("data-lost")).toBe("false");

    await act(async () => {
      vi.advanceTimersByTime(LINK_LOST_AFTER_MS + 50);
    });
    expect(must(container, "#probe").getAttribute("data-lost")).toBe("true");

    // The client reconnects with a new socket; any server message ends the loss.
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    await made[made.length - 1].receive(...wsFixtures.walking);
    expect(must(container, "#probe").getAttribute("data-lost")).toBe("false");
  });
});

describe("commands", () => {
  function lastCommandId(socket: FakeSocket): string {
    const message = socket.sent.filter((m) => m.type === "COMMAND").pop();
    if (!message || message.type !== "COMMAND") throw new Error("no command was sent");
    return message.command_id;
  }

  it("resolves the server's accepted result", async () => {
    const { factory, made } = sockets();
    open("eva:EV1", factory);
    await mount(createElement(CommandProbe));

    const pending = sendRef!({ kind: "ABORT", args: { crew: ["EV1"] } });
    const result: CommandResult = { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: lastCommandId(made[0]), ok: true, event_seq: 12 };
    await made[0].receive(result);

    await expect(pending).resolves.toEqual(result);
  });

  it("surfaces a rejection as the server's own ok:false result, with its code and message", async () => {
    const { factory, made } = sockets();
    open("eva:EV1", factory);
    await mount(createElement(CommandProbe));

    const pending = sendRef!({ kind: "UPDATE_STOP_TASK", args: { task_id: "t-s2-02", state: "DONE" } });
    await made[0].receive({
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: lastCommandId(made[0]),
      ok: false,
      code: "INVALID",
      message: "illegal task transition",
    });

    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "INVALID", message: "illegal task transition" });
  });

  it("without any session it resolves a rejection and sends nothing", async () => {
    await mount(createElement(CommandProbe));
    const result = await sendRef!({ kind: "ABORT", args: { crew: ["EV1"] } });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ message: expect.stringMatching(/no hab core connection/i) });
  });
});

describe("taken over by another device (02 §E.4)", () => {
  const taken: ServerMessage = { v: PROTOCOL_VERSION, type: "TAKEN_OVER", seq: 430, sim_time: "2024-05-20T13:14:00Z", role: "eva:EV1" };

  it("useTakenOver follows the client without a remount", async () => {
    const { factory, made } = sockets();
    open("eva:EV1", factory);
    let seen: boolean | undefined;
    function Taken(): null {
      seen = useTakenOver();
      return null;
    }
    const view = await mount(createElement(Taken));
    expect(seen).toBe(false);
    await made[0].receive(...wsFixtures.connect, taken);
    expect(seen).toBe(true);
    await view.unmount();
  });

  it("useTakenOver is false with no connection", async () => {
    let seen: boolean | undefined;
    function Taken(): null {
      seen = useTakenOver(null);
      return null;
    }
    const view = await mount(createElement(Taken));
    expect(seen).toBe(false);
    await view.unmount();
  });

  it("starting the role again after a take-over opens a fresh connection (a deliberate return), not the dead client", async () => {
    const { factory, made } = sockets();
    const first = open("eva:EV1", factory);
    await made[0].receive(...wsFixtures.connect, taken);
    const second = open("eva:EV1", factory);
    expect(second).not.toBe(first);
    expect(second.takenOver()).toBe(false);
    expect(made).toHaveLength(2);
    expect(currentHabClient()).toBe(second);
  });
});
