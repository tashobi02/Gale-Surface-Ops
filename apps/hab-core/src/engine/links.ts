/**
 * Surface link graph, LINK_LOST / LINK_RESTORED and COMM_SHADOW (docs/specs/02 §D.11; FR-42).
 * Stub created by T22.01 (contract C14); owner T26.01 (TASK-26); fallback T26.08 may replace it. Pure; sim time only, never wall-clock (NFR-06).
 * Link states from @marswalk/compute; unlinked crew are marked `stale`.
 */
import type { EngineState } from "./reducer";
import type { TickContext, TickResult } from "./tick";

/** Recompute `links` and `crew[].linked`; emit link events and COMM_SHADOW on the remaining route. */
export function linksTick(state: EngineState, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-26): T26.01 not implemented");
}
