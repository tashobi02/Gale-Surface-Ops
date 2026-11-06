/**
 * Contingency options, APPROVE_OPTION and ABORT (docs/specs/02 §D.15; FR-44).
 * Stub created by T22.01 (contract C14); owner T23.07 (TASK-23). Pure; sim time only, never wall-clock (NFR-06).
 * Approval and abort log PLAN_REVISED; tasks.ts (T31.04) reacts to it for dropped stops.
 */
import type { Command } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { CommandOutcome, EngineState } from "./reducer";
import type { TickContext, TickResult } from "./tick";

/** On a new warning, build options with @marswalk/compute and log OPTIONS_PROPOSED. */
export function contingencyTick(state: EngineState, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-23): T23.07 not implemented");
}

/** APPROVE_OPTION: revise the plan; log PLAN_REVISED. */
export function handleApproveOption(state: EngineState, scenario: LoadedScenario, command: Command): CommandOutcome {
  throw new Error("TODO(TASK-23): T23.07 not implemented");
}

/** ABORT: abort to hab; log PLAN_REVISED. */
export function handleAbort(state: EngineState, scenario: LoadedScenario, command: Command): CommandOutcome {
  throw new Error("TODO(TASK-23): T23.07 not implemented");
}
