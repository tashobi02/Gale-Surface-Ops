/**
 * A real `ws` client for the real-scenario tests (backend package 27): HELLO, COMMAND and a message log with the wall time
 * each message arrived (`performance.now()`, a monotonic clock, used only here, never in the engine).
 */
import WebSocket from "ws";
import { PROTOCOL_VERSION, type ClientMessage, type Command, type CommandResult, type Role, type ServerMessage } from "@marswalk/protocol";

export interface Timed {
  at_ms: number;
  message: ServerMessage;
}

export interface WsClient {
  ws: WebSocket;
  role: Role;
  received: Timed[];
  send(m: ClientMessage): void;
  /** Send a COMMAND now; resolves with its COMMAND_RESULT and the monotonic time it was sent at. */
  command(kind: Command["kind"], args?: Record<string, unknown>, timeoutMs?: number): Promise<{ result: CommandResult; sent_ms: number }>;
  waitFor(pred: (m: ServerMessage) => boolean, timeoutMs?: number, from?: number): Promise<Timed>;
  close(): void;
}

export async function connectWs(url: string, role: Role, client_id: string, last_seq = 0): Promise<WsClient> {
  const ws = new WebSocket(`${url.replace(/^http/, "ws")}/ws`);
  const received: Timed[] = [];
  ws.on("message", (raw) => received.push({ at_ms: performance.now(), message: JSON.parse(raw.toString()) as ServerMessage }));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  let n = 0;
  const client: WsClient = {
    ws,
    role,
    received,
    send: (m) => ws.send(JSON.stringify(m)),
    waitFor: async (pred, timeoutMs = 5000, from = 0) => {
      const deadline = performance.now() + timeoutMs;
      for (;;) {
        const hit = received.slice(from).find((t) => pred(t.message));
        if (hit) return hit;
        if (performance.now() > deadline) throw new Error(`${client_id}: timed out waiting for a message after ${timeoutMs} ms`);
        await new Promise((r) => setTimeout(r, 2));
      }
    },
    command: async (kind, args = {}, timeoutMs = 10_000) => {
      const command_id = `${client_id}-${++n}`;
      const from = received.length;
      const sent_ms = performance.now();
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "COMMAND", command_id, role, command: { kind, args } }));
      const hit = await client.waitFor((m) => m.type === "COMMAND_RESULT" && m.command_id === command_id, timeoutMs, from);
      return { result: hit.message as CommandResult, sent_ms };
    },
    close: () => ws.close(),
  };
  client.send({ v: PROTOCOL_VERSION, type: "HELLO", role, client_id, display_name: "", last_seq });
  await client.waitFor((m) => m.type === "SNAPSHOT");
  return client;
}
