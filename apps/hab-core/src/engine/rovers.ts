/**
 * Utility rover motion, battery and relay node (docs/specs/02 §D.9, §D.11; FR-41, FR-42).
 * Stub created by T22.01 (contract C14); owner T29.03 (TASK-29). Pure; sim time only, never wall-clock (NFR-06).
 * Uses the shared motion helper from vehicles.ts. TASK_ROVER validation stays in src/rover.ts.
 */
import type { EngineState } from "./reducer";
import type { TickContext, TickResult } from "./tick";

/** Move `utility_rover` vehicles only, subtract battery (02 §D.9), park a RELAY rover as a link node. */
export function roversTick(state: EngineState, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-29): T29.03 not implemented");
}
