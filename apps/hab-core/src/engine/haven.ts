/**
 * Haven per tick and HAVEN_TIME_EXCEEDED (docs/specs/02 §D.8 live form; FR-39).
 * Stub created by T22.01 (contract C14); owner T23.03 (TASK-23, Anjim Hossain). Pure; sim time only, never wall-clock (NFR-06).
 * Haven minutes, kind and target per crew member, labelled `modelled`.
 */
import type { EngineState } from "./reducer";
import type { TickContext, TickResult } from "./tick";

/** Recompute `crew[].haven`; raise HAVEN_TIME_EXCEEDED past the plan's haven rule. */
export function havenTick(state: EngineState, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-23): T23.03 not implemented");
}
