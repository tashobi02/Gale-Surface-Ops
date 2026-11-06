/**
 * Mock WebSocket message sequences for the killer-demo beats (T20.02, fixture F7; 01 §E.1, 03 §C.6).
 * MOCK DATA for tests and mock-mode screens only: it never ships and the demo never loads it.
 * Value sources: README.md in this folder (02 §E.6 examples or placeholders).
 *
 * JSON imports widen string literals, so the cast below cannot catch drift by itself;
 * fixtures.test.ts checks message, entity and enum shapes against tables typed from protocol v0
 * (see its header for what is and is not covered).
 */
import type { ServerMessage } from "@marswalk/protocol";

export const BEATS = [
  "connect",
  "walking",
  "radiation-alert",
  "options-proposed",
  "summon-accepted",
  "comm-shadow",
  "link-lost-restored",
  "stop-task-ticked",
] as const;
export type Beat = (typeof BEATS)[number];

const files = import.meta.glob<ServerMessage[]>("./*.json", { eager: true, import: "default" });

export const wsFixtures = Object.fromEntries(
  Object.entries(files).map(([path, messages]) => [path.slice(2, -".json".length), messages]),
) as Record<Beat, ServerMessage[]>;
