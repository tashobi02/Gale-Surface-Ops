/**
 * Test helpers: a real Hab Core client store fed by the T20.02 WebSocket fixtures, and a recording wrapper
 * that captures every command a control sends and answers it with a chosen CommandResult.
 */
import { PROTOCOL_VERSION, type CommandResult, type RejectCode, type ServerMessage } from "@marswalk/protocol";
import { connectHab, type HabClient, type SocketLike } from "../../src/net/habClient";
import { wsFixtures, type Beat } from "../fixtures/ws";

class MockSocket implements SocketLike {
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(_data: string): void {}
  close(): void {}
}

/** The client store after the `connect` beat and then `beat`, as `role` sees it. */
export function storeFromBeat(beat: Beat, role: "eva:EV1" | "eva:EV2" | "ops" = "eva:EV1"): HabClient {
  const socket = new MockSocket();
  const client = connectHab({
    role,
    clientId: "c-test",
    displayName: role,
    url: "ws://localhost/ws",
    socketFactory: () => socket,
  });
  const messages: ServerMessage[] = [...wsFixtures.connect, ...(beat === "connect" ? [] : wsFixtures[beat])];
  for (const message of messages) socket.onmessage?.({ data: JSON.stringify(message) });
  return client;
}

export interface SentCommand {
  kind: string;
  args: Record<string, unknown>;
}

export function accepted(): CommandResult {
  return { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: "k-test", ok: true, event_seq: 1 };
}

export function rejected(code: RejectCode, message: string): CommandResult {
  return { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: "k-test", ok: false, code, message };
}

/** Wraps `real`: `send` records the command and resolves to `answer(command)`; everything else is the real store. */
export function recordingClient(
  real: HabClient,
  answer: (command: SentCommand) => CommandResult | Promise<CommandResult> = () => accepted(),
): { client: HabClient; sent: SentCommand[] } {
  const sent: SentCommand[] = [];
  const client: HabClient = {
    ...real,
    send: async (command) => {
      const entry: SentCommand = { kind: command.kind, args: (command.args ?? {}) as Record<string, unknown> };
      sent.push(entry);
      return answer(entry);
    },
  };
  return { client, sent };
}
