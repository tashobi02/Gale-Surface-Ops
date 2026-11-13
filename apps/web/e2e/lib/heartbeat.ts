/// <reference types="node" />
/**
 * The heartbeat a fixture must send: the Hab Core pings every 2 s and the client reports the link lost after 3 s of silence
 * (02 §E.6, packages/protocol/src/ws.ts). A fixture that replaces the server replaces the ping too, or a slow check (axe on a
 * small project) trips SCR-18 and the overlay covers the screen the check is about to measure.
 *
 * The timer lives in the Node process, not the page, and sends through the routed socket; the caller stops it when the
 * fixture's page closes.
 */
import type { Page, WebSocketRoute } from "@playwright/test";
import { HEARTBEAT_MS } from "@marswalk/protocol";

/** Starts the ping on the routed socket; returns the function that stops it. */
export function startHeartbeat(socket: WebSocketRoute, simTime: string): () => void {
  const timer = setInterval(() => {
    try {
      socket.send(JSON.stringify({ v: 1, type: "PING", seq: 0, sim_time: simTime }));
    } catch { /* the socket is closed; the timer is stopped by the caller */ }
  }, HEARTBEAT_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

const pageHeartbeats = new WeakMap<Page, () => void>();
/** One routed connection per page; stop the old timer on reconnect and the current one on page close. */
export function startPageHeartbeat(page: Page, socket: WebSocketRoute, simTime: string): void {
  if (!pageHeartbeats.has(page)) page.once("close", () => { pageHeartbeats.get(page)?.(); pageHeartbeats.delete(page); });
  pageHeartbeats.get(page)?.();
  pageHeartbeats.set(page, startHeartbeat(socket, simTime));
}
