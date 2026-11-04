/**
 * One simulation step (docs/specs/02 §D.14): move crew along the plan and vehicles along their
 * paths, update consumables and dose, recompute link states, then evaluate alerts in fixed order
 * (radiation → consumables → haven → comm link → buddy distance) and emit semantic events.
 * Per-tick positions become STATE_DELTAs, not LogEvents (05 LogEvent). TASK-22, TASK-23, TASK-26.
 */
import type { LogEvent } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { EngineState } from "./reducer";

export interface TickResult {
  state: EngineState;
  events: Omit<LogEvent, "seq">[];
  deltas: { path: string; value: unknown }[];
}

export function tick(state: EngineState, scenario: LoadedScenario, dt_s: number): TickResult {
  throw new Error("TODO(TASK-22): not implemented");
}
