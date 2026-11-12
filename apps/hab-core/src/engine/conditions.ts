/**
 * Conditions feed values in the engine (docs/specs/01 FR-36; 02 §D.5 solar, §D.12 Earth link, §D.13 dose rate).
 * Stub created by T22.01 (contract C14); owner T22.16 (TASK-22). Pure; sim time only, never wall-clock (NFR-06).
 * SNAPSHOT carries them as `conditions` since protocol v0.2 (BD-75); STATE_DELTA paths are `conditions/<key>`.
 */
import type { EngineState } from "./reducer";
import type { TickContext, TickResult } from "./tick";
import type { ConditionsState } from "@marswalk/protocol";

/** FR-36 values at the hab; the type lives in packages/protocol (SNAPSHOT `conditions`, BD-75). null until the first tick. */
export type { ConditionsState };

/** Update `conditions`: LTST and sun elevation via Mars24 (east → west longitude), dose rates. */
export function conditionsTick(state: EngineState, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-22): T22.16 not implemented");
}
