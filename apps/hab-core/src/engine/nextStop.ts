/**
 * Next stop: the crew-wide target and the end conditions of JUMP_NEXT_STOP (docs/specs/02 §D.17; 01 FR-51, U-63;
 * backend decisions BD-92, BD-97, BD-104, BD-113). Pure; sim time only, never wall-clock (NFR-06). T32.10.
 *
 * Rules (decided by the orchestrator, 12 Nov 2026; tests: tests/nextStop.test.ts):
 * - The target is the lowest-index stop of the plan in force that not every crew member on EVA has reached. A crew
 *   member has reached stop k when `Crew.stop_index >= k` (the reducer sets it on ARRIVED_STOP and keeps it on
 *   LEFT_STOP). "On EVA" is WALKING or AT_STOP; a crew member sent to a haven, sheltered or in the hab is not
 *   counted. Before EVA_STARTED (LOADED) every crew member counts, so the first stop is the target.
 * - The jump itself runs in session.ts through the ordinary tick; this module only names the target and says when a
 *   tick's events end the jump. With several in one tick the order is: warning alert, plan_revised, eva_ended,
 *   sheltered; arrival is judged from the state (`arrivedAt`).
 */
import type { Crew, LogEvent, LogEventData } from "@marswalk/protocol";
import type { EngineState } from "./reducer";

export interface NextStopTarget {
  stop_id: string;
  stop_index: number;
}

export type JumpEnd = LogEventData["CLOCK_JUMPED"]["ended_by"];

/** The crew members a jump waits for. */
function counted(state: EngineState): Crew[] {
  if (state.session.status === "LOADED") return state.crew;
  return state.crew.filter((c) => c.activity === "WALKING" || c.activity === "AT_STOP");
}

/** The crew-wide next stop of the plan in force, or null with no plan, no crew on EVA or no stop left (BD-104). */
export function nextStopTarget(state: EngineState): NextStopTarget | null {
  if (state.plan === null) return null;
  const crew = counted(state);
  if (crew.length === 0) return null;
  const stops = state.plan.waypoints.filter((w) => w.role === "stop");
  const stop_index = Math.min(...crew.map((c) => c.stop_index ?? 0)) + 1;
  const stop = stops[stop_index - 1];
  return stop === undefined ? null : { stop_id: stop.id, stop_index };
}

/** True when every crew member on EVA has reached `target` (and at least one is on EVA). */
export function arrivedAt(state: EngineState, target: NextStopTarget): boolean {
  const crew = counted(state);
  return crew.length > 0 && crew.every((c) => (c.stop_index ?? 0) >= target.stop_index);
}

/** True while a warning-level alert is raised and not yet cleared (U-63: the jump is BUSY then). */
export function warningLatched(state: EngineState): boolean {
  return state.alerts.some((a) => a.level === "warning" && a.cleared_seq === null);
}

/** What the events of one tick say about the jump: the end condition they name, or null (02 §D.17; arrival is separate). */
export function jumpEnded(events: readonly Pick<LogEvent, "kind" | "data">[]): Exclude<JumpEnd, "arrival"> | null {
  if (events.some((e) => e.kind === "ALERT_RAISED" && (e.data as { level?: string }).level === "warning")) return "alert";
  if (events.some((e) => e.kind === "PLAN_REVISED")) return "plan_revised";
  if (events.some((e) => e.kind === "EVA_ENDED")) return "eva_ended";
  if (events.some((e) => e.kind === "CREW_SHELTERED")) return "sheltered";
  return null;
}
