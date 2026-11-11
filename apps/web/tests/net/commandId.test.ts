/**
 * Review of #219 (HIGH): command ids must not collide across connections. The Hab Core dedupes commands by
 * (client_id, command_id) and rebuilds that table from the log (apps/hab-core/src/commands.ts), so a client that
 * restarts its counter (reload, role change, duplicated tab) would get an old cached result back and its command
 * would never run. Each connection therefore carries its own random nonce in the command id.
 * Driven through the real client and the REAL command handler (02 §E.4).
 */
import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientMessage, Command, LogEvent, LogEventData, LogEventKind, Role } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand } from "../../../hab-core/src/commands";
import { initialState, reduce, type EngineState } from "../../../hab-core/src/engine/reducer";
import { readScenario } from "../../../hab-core/src/scenario";
import { connectHab, type SocketLike } from "../../src/net/habClient";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "../../../hab-core/tests/fixtures/fake-scenario"), {
  site_id: "mock_site",
  data_version: "mock_site-fixture",
  dir: null,
});

function apply(state: EngineState, kind: LogEventKind, data: LogEventData[LogEventKind], actor: Role | "system" = "system"): EngineState {
  const event: LogEvent = { seq: state.session.last_seq + 1, sim_time: fake.scenario.start_utc, kind, actor, data: data as Record<string, unknown>, provenance: {}, command_ref: null };
  return reduce(state, event);
}
const running = apply(initialState(fake, "s-0001"), "EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, "ops");

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
  }
}

/** A new connection with the same client id (a reload that kept the id), and the command it sends first. */
function connectAndSend(clientId: string, args: Record<string, unknown>): Extract<ClientMessage, { type: "COMMAND" }> {
  const socket = new FakeSocket();
  const client = connectHab({ role: "ops", clientId, displayName: "Ops console", url: "ws://localhost/ws", socketFactory: () => socket });
  void client.send({ kind: "SET_CLOCK", args });
  const sent = socket.sent.find((m): m is Extract<ClientMessage, { type: "COMMAND" }> => m.type === "COMMAND");
  if (!sent) throw new Error("no COMMAND was sent");
  client.close();
  return sent;
}

function run(accepted: AcceptedCommands, sent: Extract<ClientMessage, { type: "COMMAND" }>) {
  const command = { command_id: sent.command_id, role: sent.role, kind: sent.command.kind, args: sent.command.args } as Command;
  return handleCommand(running, command, { scenario: fake, client_id: "c-same", next_seq: running.session.last_seq + 1, accepted });
}

describe("command ids across connections", () => {
  it("two connections with the same client id never send the same command id", () => {
    const a = connectAndSend("c-same", { speed: 10 });
    const b = connectAndSend("c-same", { speed: 60 });
    expect(a.command_id).not.toBe(b.command_id);
    expect(a.command_id.startsWith("c-same-")).toBe(true);
  });

  it("within one connection ids still count up and a resend keeps its id", () => {
    const socket = new FakeSocket();
    const client = connectHab({ role: "ops", clientId: "c-1", displayName: "x", url: "ws://localhost/ws", socketFactory: () => socket });
    void client.send({ kind: "SET_CLOCK", args: { speed: 10 } });
    void client.send({ kind: "SET_CLOCK", args: { speed: 60 } });
    const ids = socket.sent.filter((m) => m.type === "COMMAND").map((m) => (m as { command_id: string }).command_id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toMatch(/-k1$/);
    expect(ids[1]).toMatch(/-k2$/);
  });

  it("a reconnect that keeps the client id: its first command is applied by the Hab Core, not answered from the dedupe table", () => {
    const accepted = new AcceptedCommands();
    const before = run(accepted, connectAndSend("c-same", { speed: 10 }));
    expect(before.result.ok).toBe(true);
    expect(before.events.length).toBeGreaterThan(0);

    // The page is reloaded with the same client id; its counter starts again at 1.
    const after = run(accepted, connectAndSend("c-same", { speed: 60 }));
    expect(after.result.ok).toBe(true);
    expect(after.events.length).toBeGreaterThan(0);
    expect(after.events[0].data).toMatchObject({ speed: 60 });
  });
});
