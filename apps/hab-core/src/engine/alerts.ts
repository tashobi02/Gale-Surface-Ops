/**
 * Alert evaluation: radiation, consumables, buddy distance (docs/specs/02 §D.13–§D.14; FR-35, FR-38).
 * Stub created by T22.01 (contract C14); owner T22.10 (TASK-22). Pure; sim time only, never wall-clock (NFR-06).
 * Thresholds come from the alert ParamSet, never from code. Warnings latch until acked and
 * cleared (03 §E.7). Haven and comm alerts live in haven.ts (T23.03) and links.ts (T26.01).
 */
import type { EngineState } from "./reducer";
import type { TickContext, TickResult } from "./tick";

/** RADIATION_ALERT raise and clear from the replayed rate (02 §D.13). */
export function radiationTick(state: EngineState, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-22): T22.10 not implemented");
}

/** CONSUMABLES_LOW from the alert ParamSet O₂ thresholds. */
export function consumablesTick(state: EngineState, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-22): T22.10 not implemented");
}

/** BUDDY_SEPARATION from `buddy_max_m` in the alert ParamSet. */
export function buddyTick(state: EngineState, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-22): T22.10 not implemented");
}
