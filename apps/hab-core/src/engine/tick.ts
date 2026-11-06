/**
 * One simulation step (docs/specs/02 §D.14). Contract C14, frozen by T22.01; implementation T22.09.
 *
 * tick.ts itself moves crew along the plan, handles dwell, and updates O₂ and dose by calling
 * @marswalk/compute (never inline science). Every other concern is an `EngineModule` in its own
 * file with its own owner, called in `MODULE_ORDER`, so TASK-23, TASK-26, TASK-29 and TASK-31 never
 * edit this file. Alerts keep the 02 §D.14 fixed order: radiation → consumables → haven time →
 * comm link → buddy distance. Per-tick positions become STATE_DELTAs, not LogEvents (05 LogEvent).
 * Nothing here reads wall-clock time (NFR-06).
 */
import type { LoadedScenario } from "../scenario";
import { buddyTick, consumablesTick, radiationTick } from "./alerts";
import { conditionsTick } from "./conditions";
import { contingencyTick } from "./contingencyOps";
import { earthTick } from "./earth";
import { havenTick } from "./haven";
import { linksTick } from "./links";
import type { EngineState, PendingEvent, StateChange } from "./reducer";
import { roversTick } from "./rovers";
import { tasksTick } from "./tasks";
import { vehiclesTick } from "./vehicles";

export interface TickContext {
  scenario: LoadedScenario;
  /** Sim seconds in this step; the clock uses a fixed 1 s step (02 §D.14, clock.ts). */
  dt_s: number;
  /**
   * The `seq` the log will give the next event. tick.ts reduces each module's events with
   * consecutive seqs from here before calling the next module (see "State rule" below).
   */
  next_seq: number;
}

export interface TickResult {
  state: EngineState;
  events: PendingEvent[];
  deltas: StateChange[];
}

/**
 * A pure per-tick concern: same state and context in, same result out.
 *
 * State rule (one convention for every module owner):
 * - A module changes only state that is never logged (positions, O₂, dose, haven, links,
 *   conditions, Earth status, vehicle paths and ETAs) directly in the `state` it returns.
 * - Everything a LogEvent describes (alerts, options, tasks, plan, vehicle and crew activity
 *   changes) is changed only by returning the event; the module does not apply it itself.
 * - tick.ts reduces each module's events (seq from `ctx.next_seq`) before calling the next module,
 *   so later modules see them (contingencyTick sees this tick's new warnings). `tick()`'s result
 *   state therefore already includes all its events: the session appends them to the log (which
 *   must assign the same seqs) and does not reduce them again.
 */
export type EngineModule = (state: EngineState, ctx: TickContext) => TickResult;

/**
 * Call order after crew motion, consumables and dose (tick.ts).
 * TODO(decision): 02 §D.14 fixes only the alert order; the order of the non-alert modules here
 * (vehicles, rovers, conditions, earth, tasks before alerts; contingency last) is proposed by T22.01.
 */
export const MODULE_ORDER: readonly EngineModule[] = [
  vehiclesTick, // T23.05: pressurized rover motion, arrival, sheltering
  roversTick, // T29.03: utility rover motion, battery, relay node
  conditionsTick, // T22.16: FR-36 conditions feed
  earthTick, // T26.04: Earth message delivery, forecasts
  tasksTick, // T31.04: simulated crew completes tasks at dwell end
  radiationTick, // T22.10: RADIATION_ALERT
  consumablesTick, // T22.10: CONSUMABLES_LOW
  havenTick, // T23.03: haven per crew, HAVEN_TIME_EXCEEDED
  linksTick, // T26.01: link graph, LINK_LOST/RESTORED, COMM_SHADOW
  buddyTick, // T22.10: BUDDY_SEPARATION
  contingencyTick, // T23.07: OPTIONS_PROPOSED on a new warning
];

export function tick(state: EngineState, scenario: LoadedScenario, dt_s: number, next_seq: number): TickResult {
  throw new Error("TODO(TASK-22): T22.09 not implemented");
}
