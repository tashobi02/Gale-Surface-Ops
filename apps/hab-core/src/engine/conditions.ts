/**
 * Conditions feed values in the engine (docs/specs/01 FR-36; 02 §D.5 solar, §D.12 Earth link, §D.13 dose rate).
 * Stub created by T22.01 (contract C14); owner T22.16 (TASK-22). Pure; sim time only, never wall-clock (NFR-06).
 * TODO(decision): protocol v0 has no SNAPSHOT field for these values; T22.16 proposes one through
 * a `contract-change:` subtask in TASK-20, or ops derives them from existing fields.
 */
import type { EngineState } from "./reducer";
import type { TickContext, TickResult } from "./tick";
import type { ProvenanceMap } from "@marswalk/protocol";

/**
 * FR-36 values at the hab. Field set proposed by T22.01 from T22.16 step 2; T22.16 may refine it
 * (a change here is a `contract-change:` in TASK-22). null until the first tick.
 */
export interface ConditionsState {
  ltst: string | null;
  sun_elevation_deg: number | null;
  dose_rate_background_ugy_h: number | null;
  dose_rate_event_ugy_h: number | null;
  provenance: ProvenanceMap;
}

/** Update `conditions`: LTST and sun elevation via Mars24 (east → west longitude), dose rates. */
export function conditionsTick(state: EngineState, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-22): T22.16 not implemented");
}
