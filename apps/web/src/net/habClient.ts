/**
 * WebSocket client for the Hab Core (docs/specs/02 §E.6; FR-31, FR-32, NFR-13).
 * HELLO with role + last_seq; applies SNAPSHOT, STATE_DELTA and EVENT in seq order; reconnects with
 * backoff 0.5 s → 5 s; raises "HAB LINK LOST" (SCR-18) after LINK_LOST_AFTER_MS without a PING;
 * EVA roles queue commands while unlinked and resend them flagged `queued_offline`. TASK-20 (protocol),
 * TASK-24 (EVA queueing).
 */
import type { CommandMessage, Role, ServerMessage, Snapshot } from "@marswalk/protocol";

export interface HabClient {
  readonly role: Role;
  state(): Snapshot | null;
  send(command: CommandMessage["command"]): Promise<{ ok: boolean; message?: string }>;
  onMessage(listener: (message: ServerMessage) => void): () => void;
  onLinkChange(listener: (linked: boolean) => void): () => void;
  close(): void;
}

export function connectHab(url: string, role: Role, clientId: string): HabClient {
  throw new Error("TODO(TASK-20): not implemented");
}
