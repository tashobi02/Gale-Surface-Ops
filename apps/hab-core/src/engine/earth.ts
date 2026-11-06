/**
 * Earth messages and forecasts (docs/specs/02 §D.12; FR-43).
 * Stub created by T22.01 (contract C14); owner T26.04 (TASK-26). Pure; sim time only, never wall-clock (NFR-06).
 * Delivery times from the precomputed EarthLinkTable via @marswalk/compute.
 */
import type { Command } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { CommandOutcome, EngineState } from "./reducer";
import type { TickContext, TickResult } from "./tick";

/** Update `earth`; deliver due messages and scenario forecasts as EARTH_MSG_DELIVERED. */
export function earthTick(state: EngineState, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-26): T26.04 not implemented");
}

/** SEND_MESSAGE: queue with its delivery time; log EARTH_MSG_QUEUED. */
export function handleSendMessage(state: EngineState, scenario: LoadedScenario, command: Command): CommandOutcome {
  throw new Error("TODO(TASK-26): T26.04 not implemented");
}
