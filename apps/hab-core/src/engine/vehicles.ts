/**
 * Summon, rendezvous dispatch and vehicle motion (docs/specs/02 §D.9–§D.10; FR-40).
 * Stub created by T22.01 (contract C14); owner T23.05 (TASK-23). Pure; sim time only, never wall-clock (NFR-06).
 * Exports the motion helper TASK-29 reuses for the utility rover (T29.03).
 */
import type { Command } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { CommandOutcome, EngineState } from "./reducer";
import type { TickContext, TickResult } from "./tick";

/** SUMMON_VEHICLE: compute the rendezvous with @marswalk/compute; log VEHICLE_DISPATCHED. */
export function handleSummon(state: EngineState, scenario: LoadedScenario, command: Command): CommandOutcome {
  throw new Error("TODO(TASK-23): T23.05 not implemented");
}

/** Move `pressurized_rover` vehicles along their paths at ParamSet speed; VEHICLE_ARRIVED, CREW_SHELTERED. Skips `utility_rover` (rovers.ts). */
export function vehiclesTick(state: EngineState, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-23): T23.05 not implemented");
}

/** Shared motion helper: advance `vehicle_id` along its path by `dt_s` (reused by rovers.ts). */
export function moveAlongPath(state: EngineState, vehicle_id: string, ctx: TickContext): TickResult {
  throw new Error("TODO(TASK-23): T23.05 not implemented");
}
