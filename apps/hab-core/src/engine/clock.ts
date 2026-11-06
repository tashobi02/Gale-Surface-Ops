/**
 * Mission clock (docs/specs/02 §D.14; FR-34). T22.04.
 * Fixed step Δt = 1 s sim time; speeds 1×, 10×, 60×; pause; jump to the next scheduled event.
 * Sim time is an integer number of seconds from the scenario start (`t_s`); ISO-8601 only at the
 * edges (`simTimeIso`). Never reads wall-clock time (NFR-06): the server passes real elapsed
 * milliseconds into `advanceReal`. ISO strings are parsed with `Date.parse(<string>)`, which is a
 * pure function of its argument.
 */
export const SIM_STEP_S = 1;
export type ClockSpeed = 1 | 10 | 60;

export interface ClockState {
  /** Scenario start, ISO-8601 UTC. */
  start_utc: string;
  /** Sim seconds since `start_utc` (integer). */
  t_s: number;
  speed: ClockSpeed;
  paused: boolean;
  /** Real milliseconds not yet turned into a whole step. */
  carry_ms: number;
}

export function createClock(start_utc: string, speed: ClockSpeed = 1): ClockState {
  if (Number.isNaN(Date.parse(start_utc))) throw new Error(`invalid start_utc: ${start_utc}`);
  return { start_utc, t_s: 0, speed, paused: false, carry_ms: 0 };
}

/** Whole sim steps for `elapsed_ms` of real time at the current speed; the remainder carries over. */
export function advanceReal(clock: ClockState, elapsed_ms: number): { clock: ClockState; steps: number } {
  if (clock.paused || !(elapsed_ms > 0)) return { clock, steps: 0 };
  const sim_ms = (clock.carry_ms ?? 0) + elapsed_ms * clock.speed;
  const steps = Math.floor(sim_ms / (SIM_STEP_S * 1000));
  const carry_ms = sim_ms - steps * SIM_STEP_S * 1000;
  return { clock: { ...stepClock(clock, steps), carry_ms }, steps };
}

export function stepClock(clock: ClockState, steps: number): ClockState {
  if (!Number.isInteger(steps) || steps < 0) throw new Error(`steps must be a non-negative integer: ${steps}`);
  return { ...clock, t_s: clock.t_s + steps * SIM_STEP_S };
}

export function setSpeed(clock: ClockState, speed: ClockSpeed): ClockState {
  return { ...clock, speed };
}

export function setPaused(clock: ClockState, paused: boolean): ClockState {
  return { ...clock, paused, carry_ms: 0 };
}

/** Land exactly on the first scheduled event strictly after now; unchanged if there is none. */
export function jumpToNextEvent(clock: ClockState, event_times_utc: string[]): ClockState {
  const start_ms = Date.parse(clock.start_utc);
  const next = event_times_utc
    .map((t) => Math.round((Date.parse(t) - start_ms) / 1000))
    .filter((t_s) => Number.isFinite(t_s) && t_s > clock.t_s)
    .sort((a, b) => a - b)[0];
  return next === undefined ? clock : { ...clock, t_s: next, carry_ms: 0 };
}

/** ISO-8601 UTC without milliseconds, e.g. 2024-05-20T00:00:03Z. */
export function simTimeIso(clock: ClockState): string {
  return new Date(Date.parse(clock.start_utc) + clock.t_s * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
