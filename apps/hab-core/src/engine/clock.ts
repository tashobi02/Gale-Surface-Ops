/**
 * Mission clock (docs/specs/02 §D.14; FR-34). Fixed step Δt = 1 s sim time; speeds 1×, 10×, 60×;
 * pause; jump to next scheduled event. Never reads wall-clock inside the engine (NFR-06):
 * the server converts real elapsed time into a number of sim steps. TASK-22.
 */
export const SIM_STEP_S = 1;
export type ClockSpeed = 1 | 10 | 60;

export interface ClockState {
  sim_time: string;
  speed: ClockSpeed;
  paused: boolean;
}

export function stepClock(clock: ClockState, steps: number): ClockState {
  throw new Error("TODO(TASK-22): not implemented");
}
