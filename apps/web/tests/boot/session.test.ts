/**
 * T07.03 / T25.01 — boot calls startHabSession for the live roles, with the role and crew member of the route, and a tab
 * keeps one Hab Core connection (docs/specs/02 §E.6; 03 §A). Driven through the real client with a fake socket.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ClientMessage } from "@marswalk/protocol";
import type { SocketLike } from "../../src/net/habClient";
import { closeHabSessions, currentHabClient } from "../../src/state/habSession";
import { clientIdFor, displayNameFor, ensureSessionForRoute } from "../../src/boot/session";
import { parseHash } from "../../src/ui/router";
import { installDom, removeDom } from "../ui/domHarness";

class FakeSocket implements SocketLike {
  readyState = 1;
  sent: ClientMessage[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
}

function sockets() {
  const made: FakeSocket[] = [];
  const socketFactory = (): SocketLike => {
    const s = new FakeSocket();
    made.push(s);
    return s;
  };
  return { made, socketFactory };
}

/** A minimal Storage double. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => closeHabSessions());

describe("ensureSessionForRoute", () => {
  it("opens the ops connection on #/ops, with the ops role in HELLO", () => {
    const { made, socketFactory } = sockets();
    const client = ensureSessionForRoute(parseHash("#/ops"), { url: "ws://localhost/ws", socketFactory, storage: memoryStorage() });

    expect(client?.role).toBe("ops");
    expect(made).toHaveLength(1);
    expect(currentHabClient()).toBe(client);
    made[0].onopen?.();
    const hello = made[0].sent[0];
    expect(hello).toMatchObject({ type: "HELLO", role: "ops" });
  });

  it("opens eva:<crew> for the tablet, and the HUD of the same crew member reuses it: one socket", () => {
    const { made, socketFactory } = sockets();
    const deps = { url: "ws://localhost/ws", socketFactory, storage: memoryStorage() };
    const tablet = ensureSessionForRoute(parseHash("#/eva/EV2"), deps);
    const hud = ensureSessionForRoute(parseHash("#/hud/EV2"), deps);

    expect(tablet?.role).toBe("eva:EV2");
    expect(hud).toBe(tablet);
    expect(made).toHaveLength(1);
  });

  it("a tab keeps one connection: moving to another live role closes the first", () => {
    const { made, socketFactory } = sockets();
    const deps = { url: "ws://localhost/ws", socketFactory, storage: memoryStorage() };
    ensureSessionForRoute(parseHash("#/ops"), deps);
    const ev1 = ensureSessionForRoute(parseHash("#/eva/EV1"), deps);

    expect(made).toHaveLength(2);
    expect(made[0].closed).toBe(true);
    expect(made[1].closed).toBe(false);
    expect(currentHabClient()).toBe(ev1);
  });

  it("opens nothing for routes that need no connection, and leaves an open one alone", () => {
    const { made, socketFactory } = sockets();
    const deps = { url: "ws://localhost/ws", socketFactory, storage: memoryStorage() };
    expect(ensureSessionForRoute(parseHash("#/join"), deps)).toBeNull();
    expect(ensureSessionForRoute(parseHash("#/nope"), deps)).toBeNull();
    expect(made).toHaveLength(0);

    const ops = ensureSessionForRoute(parseHash("#/ops"), deps);
    expect(ensureSessionForRoute(parseHash("#/report"), deps)).toBeNull();
    expect(made[0].closed).toBe(false);
    expect(currentHabClient()).toBe(ops);
    // Back to the console reuses the connection; no second socket.
    expect(ensureSessionForRoute(parseHash("#/ops"), deps)).toBe(ops);
    expect(made).toHaveLength(1);
  });
});

describe("client identity", () => {
  it("keeps one client id per tab (stored), and a different one in another tab", () => {
    const a = memoryStorage();
    const first = clientIdFor(a);
    expect(first).toMatch(/^[a-z0-9-]{8,}$/);
    expect(clientIdFor(a)).toBe(first);
    expect(clientIdFor(memoryStorage())).not.toBe(first);
  });

  it("still returns an id when storage is missing or refuses", () => {
    expect(clientIdFor(null)).toMatch(/^[a-z0-9-]{8,}$/);
    const refusing = { ...memoryStorage(), getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } } as Storage;
    expect(clientIdFor(refusing)).toMatch(/^[a-z0-9-]{8,}$/);
  });

  it("names the device by role and view, so the ops client list says what each device is", () => {
    expect(displayNameFor(parseHash("#/ops"))).toBe("Ops console");
    expect(displayNameFor(parseHash("#/eva/EV1"))).toBe("EV1 tablet");
    expect(displayNameFor(parseHash("#/hud/EV2"))).toBe("EV2 HUD");
  });
});
