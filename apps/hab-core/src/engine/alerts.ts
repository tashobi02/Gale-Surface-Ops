/**
 * Alert evaluation: radiation, consumables, buddy distance (docs/specs/02 §D.13–§D.14; FR-35, FR-38).
 * Stub created by T22.01 (contract C14); owner T22.10 (TASK-22). Pure; sim time only, never wall-clock (NFR-06).
 * Thresholds come from the alert ParamSet, never from code. Warnings latch until acked and
 * cleared (03 §E.7; the reducer applies the latch). Haven and comm alerts live in haven.ts (T23.03)
 * and links.ts (T26.01).
 *
 * Each module returns its events and leaves the state as it was (tick.ts state rule); tick.ts
 * reduces them, with seqs from `ctx.next_seq`, so the alert_id `a-<seq>` (05 Alert) is known here.
 * The radiation trigger and the replayed rate are compute functions (eventDose.ts, T05b.15); this
 * module only turns their changes into events.
 *
 * Decided 2026-11-07 by the product & systems lead:
 * - CONSUMABLES_LOW compares the O₂ time left (compute `o2RemainingS`, T05b.17) with the time to
 *   the nearest haven (`crew.haven`, T23.03). The message says where to go: back to the hab, or to
 *   a pressurized rover to restock. Margins `o2_caution_margin` and `o2_warning_margin` come from
 *   the alert ParamSet.
 * - CONSUMABLES_LOW clears when the margin is above `o2_clear_margin` (a little above the caution
 *   margin, so it cannot flicker at the threshold) or the crew member is in the hab;
 *   BUDDY_SEPARATION clears when the crew are within `buddy_max_m` again or fewer than two are out.
 * - Wording is action first, at most 60 characters (04 §D.2); the radiation text is 05 §F.6's.
 */
import { o2RemainingS, rateAt, triggerState } from "@marswalk/compute";
import type { Alert, AlertCode, AlertLevel, CrewId, LogEventData, ParamSet, ProvenanceMap } from "@marswalk/protocol";
import type { EngineState, PendingEvent } from "./reducer";
import type { TickContext, TickResult } from "./tick";

const MESSAGES = {
  radiation: "Radiation surge — shelter now", // 05 §F.6 example
  o2CautionHab: "O₂ low — plan return to hab",
  o2CautionRover: "O₂ low — plan restock at rover",
  o2WarningHab: "O₂ critical — return to hab now",
  o2WarningRover: "O₂ critical — go to rover now",
  buddy: "Buddy too far — close up",
} as const;

function alertParams(ctx: TickContext): ParamSet {
  const p = Object.values(ctx.scenario.params).find((x) => x.kind === "alert");
  if (!p) throw new Error("alerts: the scenario has no alert ParamSet (05 Scenario)");
  return p;
}

/** A numeric ParamSet value; a missing one is a scenario error, never a default in code. */
function num(p: ParamSet, key: string): number {
  const value = (p.values as Record<string, unknown>)[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`alerts: ParamSet ${p.param_set_id} has no number ${key}`);
  return value;
}

const active = (state: EngineState, code: AlertCode): Alert[] => state.alerts.filter((a) => a.code === code && a.cleared_seq === null);

function raise(
  state: EngineState,
  seq: number,
  code: AlertCode,
  level: AlertLevel,
  subjects: string[],
  message: string,
  values: Record<string, unknown>,
  provenance: ProvenanceMap,
): PendingEvent {
  const data: LogEventData["ALERT_RAISED"] = { alert_id: `a-${seq}`, code, level, subjects, message, ...values };
  return { sim_time: state.session.clock.sim_time, kind: "ALERT_RAISED", actor: "system", data, provenance };
}

const onEva = (state: EngineState) => state.crew.filter((c) => c.activity !== "IN_HAB");

/** RADIATION_ALERT raise and clear from the replayed rate (02 §D.13). */
export function radiationTick(state: EngineState, ctx: TickContext): TickResult {
  const params = alertParams(ctx);
  const t = state.session.clock.sim_time;
  const trigger = triggerState(ctx.scenario.dose, t, params);
  const open = active(state, "RADIATION_ALERT");
  const events: PendingEvent[] = [];
  if (trigger === "alert" && open.length === 0) {
    const threshold = num(params, "rad_k_background") * ctx.scenario.dose.background_rate;
    events.push(
      raise(
        state,
        ctx.next_seq,
        "RADIATION_ALERT",
        "warning",
        state.crew.map((c) => c.crew_id),
        MESSAGES.radiation,
        { rate_ugy_h: rateAt(ctx.scenario.dose, t), threshold_ugy_h: threshold, source: `replayed:${ctx.scenario.dose.source_id}` },
        { "data.rate_ugy_h": "replayed", "data.threshold_ugy_h": "assumed" },
      ),
    );
  } else if (trigger === "nominal") {
    for (const a of open) events.push(cleared(state, a.alert_id));
  }
  return { state, events, deltas: [] };
}

function cleared(state: EngineState, alert_id: string): PendingEvent {
  const data: LogEventData["ALERT_CLEARED"] = { alert_id };
  return { sim_time: state.session.clock.sim_time, kind: "ALERT_CLEARED", actor: "system", data, provenance: {} };
}

function suitParams(ctx: TickContext, crew_id: CrewId): ParamSet {
  const id = ctx.scenario.scenario.crew.find((c) => c.crew_id === crew_id)?.suit_param_set;
  const p = id === undefined ? undefined : ctx.scenario.params[id];
  if (!p) throw new Error(`alerts: crew ${crew_id} has no suit ParamSet in the scenario (05 Scenario)`);
  return p;
}

/**
 * CONSUMABLES_LOW from the O₂ margin = O₂ time left ÷ time to the nearest haven: a caution at
 * `o2_caution_margin`, a warning (which replaces the caution) at `o2_warning_margin`. Cleared once
 * the margin is above `o2_clear_margin` (hysteresis, decided 2026-11-07) or the crew member is back
 * in the hab; between the caution and clear margins an open alert stays and none is raised.
 * A haven 0 min away (or less) means the crew member is there, so nothing is raised. A haven that
 * cannot be reached (`minutes` Infinity) gives margin 0, a warning with `haven_min` null. A NaN
 * O₂ fraction or haven time is an engine error and throws, so it can never clear a live alert.
 * TODO(verify): a terrain refuge (T2) gives shelter but no O₂; until T2 the haven is the hab or a
 * pressurized rover, and a refuge haven is worded as the hab.
 */
export function consumablesTick(state: EngineState, ctx: TickContext): TickResult {
  const params = alertParams(ctx);
  const caution = num(params, "o2_caution_margin");
  const warning = num(params, "o2_warning_margin");
  const clearAbove = num(params, "o2_clear_margin");
  if (clearAbove < caution) throw new Error(`alerts: ParamSet ${params.param_set_id} o2_clear_margin ${clearAbove} is below o2_caution_margin ${caution}`);
  const open = active(state, "CONSUMABLES_LOW");
  const events: PendingEvent[] = [];
  for (const c of state.crew) {
    const mine = open.filter((a) => a.subjects.includes(c.crew_id));
    if (Number.isNaN(c.o2_frac) || Number.isNaN(c.haven.minutes)) throw new Error(`consumablesTick: crew ${c.crew_id} has a NaN O₂ fraction or haven time`);
    const safe = c.activity === "IN_HAB" || c.haven.minutes <= 0;
    const o2_s = safe ? Infinity : o2RemainingS(c.o2_frac, "walking", suitParams(ctx, c.crew_id));
    const reachable = Number.isFinite(c.haven.minutes);
    const margin = safe ? Infinity : reachable ? o2_s / (c.haven.minutes * 60) : 0;
    const level: AlertLevel | null = margin <= warning ? "warning" : margin <= caution ? "caution" : null;
    if (level === null) {
      if (margin > clearAbove) for (const a of mine) events.push(cleared(state, a.alert_id));
      continue; // between the caution and clear margins: keep what is open, raise nothing
    }
    if (mine.some((a) => a.level === "warning") || (level === "caution" && mine.length > 0)) continue;
    for (const a of mine) events.push(cleared(state, a.alert_id)); // the warning replaces the caution
    const rover = c.haven.kind === "vehicle";
    const message = level === "warning" ? (rover ? MESSAGES.o2WarningRover : MESSAGES.o2WarningHab) : rover ? MESSAGES.o2CautionRover : MESSAGES.o2CautionHab;
    events.push(
      raise(
        state,
        ctx.next_seq + events.length,
        "CONSUMABLES_LOW",
        level,
        [c.crew_id],
        message,
        {
          o2_remaining_min: o2_s / 60,
          haven_min: reachable ? c.haven.minutes : null,
          haven_kind: c.haven.kind,
          margin,
          threshold_margin: level === "warning" ? warning : caution,
        },
        { "data.o2_remaining_min": "simulated", "data.haven_min": "modelled", "data.margin": "simulated", "data.threshold_margin": "assumed" },
      ),
    );
  }
  return { state, events, deltas: [] };
}

/**
 * BUDDY_SEPARATION from `buddy_max_m` in the alert ParamSet; distance in projected metres.
 * Cleared once the two are within `buddy_max_m` again or fewer than two crew are out.
 */
export function buddyTick(state: EngineState, ctx: TickContext): TickResult {
  const crew = onEva(state);
  const open = active(state, "BUDDY_SEPARATION");
  const clearAll = (): TickResult => ({ state, events: open.map((a) => cleared(state, a.alert_id)), deltas: [] });
  if (crew.length < 2) return clearAll();
  const max = num(alertParams(ctx), "buddy_max_m");
  const [a, b] = crew;
  const distance_m = Math.hypot(a.x_m - b.x_m, a.y_m - b.y_m);
  if (distance_m <= max) return clearAll();
  if (open.length > 0) return { state, events: [], deltas: [] };
  const event = raise(
    state,
    ctx.next_seq,
    "BUDDY_SEPARATION",
    "caution",
    [a.crew_id, b.crew_id],
    MESSAGES.buddy,
    { distance_m, threshold_m: max },
    { "data.distance_m": "simulated", "data.threshold_m": "assumed" },
  );
  return { state, events: [event], deltas: [] };
}
