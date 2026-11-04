/**
 * HTTP + WebSocket server (docs/specs/02 §E.5–E.6; FR-30, FR-31, NFR-12, NFR-13).
 * Fastify serves the web app and site data; `ws` handles /ws with HELLO → SNAPSHOT, deltas,
 * events, commands, PING every HEARTBEAT_MS. Binds 0.0.0.0 so phones on the habitat LAN can join.
 * No outbound network requests, ever (NFR-01, NFR-08). TASK-20.
 */
export interface ServerOptions {
  site: string;
  scenario?: string;
  port: number;
}

export async function startServer(options: ServerOptions): Promise<void> {
  throw new Error("TODO(TASK-20): not implemented");
}
