/** Package 18: controllable server messages; scientific display examples are from 04 §E.5/E.6. */
import { readFileSync } from "node:fs";
import type { Page, WebSocketRoute } from "@playwright/test";
import type { ServerMessage, Snapshot } from "@marswalk/protocol";
import { evaFixture, type EvaFixtureState } from "./evaFixture";

export function surfaceSnapshot(state: EvaFixtureState = "walking"): Snapshot {
  const snapshot = evaFixture(state);
  snapshot.plan = (JSON.parse(readFileSync(new URL("../../../hab-core/tests/fixtures/fake-scenario/scenario.json", import.meta.url), "utf8")) as { plan: Snapshot["plan"] }).plan;
  snapshot.crew = snapshot.crew.map((c) => ({ ...c, stop_index: null, next_stop_bearing_deg: 40, next_stop_distance_m: 420, next_stop_eta_s: 540 }));
  return snapshot;
}

export async function openSurfaceFixture(page: Page, role: "eva" | "hud", snapshot = surfaceSnapshot(), commands?: { kind: string; args: Record<string, unknown> }[]) {
  let socket: WebSocketRoute | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stopHeartbeat = (): void => { if (heartbeat) clearInterval(heartbeat); heartbeat = undefined; };
  await page.routeWebSocket("**/ws", (ws) => {
    socket = ws;
    ws.onMessage((message) => {
      const request = JSON.parse(String(message)) as { type?: string; command_id?: string; command?: { kind: string; args: Record<string, unknown> } };
      if (request.type === "COMMAND" && request.command) {
        commands?.push(request.command);
        ws.send(JSON.stringify({ v: snapshot.v, type: "COMMAND_RESULT", command_id: request.command_id, ok: true, event_seq: snapshot.seq }));
      }
      if (request.type === "HELLO") {
        ws.send(JSON.stringify(snapshot));
        stopHeartbeat();
        heartbeat = setInterval(() => ws.send(JSON.stringify({ v: 1, type: "PING", seq: snapshot.seq })), 1000);
      }
    });
    ws.onClose(stopHeartbeat);
  });
  await page.goto(`/?site=mock_site#/${role}/EV1`);
  const value = role === "hud" ? '[data-hud-value="o2"]' : '[data-slot="o2"] .value';
  await page.locator(value).filter({ hasText: String(Math.round(snapshot.crew.find((c) => c.crew_id === "EV1")!.o2_frac * 100)) }).waitFor();
  return {
    snapshot,
    send: (message: ServerMessage) => socket!.send(JSON.stringify(message)),
    stop: stopHeartbeat,
    dispose: stopHeartbeat,
  };
}
