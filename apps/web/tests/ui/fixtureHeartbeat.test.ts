import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page, WebSocketRoute } from "@playwright/test";
import { HEARTBEAT_MS } from "@marswalk/protocol";
import { openEvaFixture } from "../../e2e/lib/evaFixture";
import { openOpsFixture } from "../../e2e/lib/opsFixture";

afterEach(() => vi.useRealTimers());

function fakePage() {
  let route: ((socket: WebSocketRoute) => void) | undefined;
  let closed: (() => void) | undefined;
  const socket = { send: vi.fn<(message: string) => void>(), onMessage: vi.fn<(handler: (message: string) => void) => void>() };
  const page = {
    routeWebSocket: async (_url: string, handler: (socket: WebSocketRoute) => void) => { route = handler; },
    goto: async (url: string) => {
      if (url !== "about:blank") {
        route?.(socket as unknown as WebSocketRoute);
        socket.onMessage.mock.calls[0]?.[0](JSON.stringify({ type: "HELLO" }));
      }
    },
    once: (event: string, handler: () => void) => { if (event === "close") closed = handler; },
    locator: () => ({ filter: () => ({ waitFor: async () => {} }), first: () => ({ waitFor: async () => {} }) }),
    viewportSize: () => ({ width: 1440, height: 900 }),
  } as unknown as Page;
  return { page, socket, close: () => closed?.() };
}

describe("connected surface fixtures", () => {
  for (const role of ["eva", "ops"] as const) {
    it(`${role} sends heartbeats until the page closes`, async () => {
      vi.useFakeTimers();
      const { page, socket, close } = fakePage();
      if (role === "eva") await openEvaFixture(page, "walking");
      else await openOpsFixture(page, "running");
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
      expect(socket.send.mock.calls.map(([frame]) => JSON.parse(frame).type)).toEqual(["SNAPSHOT", "PING", "PING"]);
      close();
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
      expect(socket.send).toHaveBeenCalledTimes(3);
    });
  }
});
