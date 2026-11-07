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
 * TODO(decision): alert wording. 04 §D.2 sets "action first, at most sixty characters"; only the
 * radiation text comes from a spec example (05 §F.6). TODO(decision): clear rules for consumables
 * and buddy alerts (02 gives one only for radiation, TASK-22 spec question 2): they do not clear
 * here, so they stay until a decision.
 */
import { rateAt, triggerState } from "@marswalk/compute";
import type { Alert, AlertCode, AlertLevel, CrewId, LogEventData, ParamSet, ProvenanceMap } from "@marswalk/protocol";
import type { EngineState, PendingEvent } from "./reducer";
import type { TickContext, TickResult } from "./tick";

const MESSAGES = {
  radiation: "Radiation surge — shelter now", // 05 §F.6 example
  o2Caution: "O₂ low — plan the return", // TODO(decision): wording
  o2Warning: "O₂ critical — return now", // TODO(decision): wording
  buddy: "Buddy too far — close up", // TODO(decision): wording
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
    for (const a of open) {
      const data: LogEventData["ALERT_CLEARED"] = { alert_id: a.alert_id };
      events.push({ sim_time: t, kind: "ALERT_CLEARED", actor: "system", data, provenance: {} });
    }
  }
  return { state, events, deltas: [] };
}

/** CONSUMABLES_LOW from the alert ParamSet O₂ thresholds: a caution, then a warning, once each per crew member. */
export function consumablesTick(state: EngineState, ctx: TickContext): TickResult {
  const params = alertParams(ctx);
  const caution = num(params, "o2_caution_frac");
  const warning = num(params, "o2_warning_frac");
  const open = active(state, "CONSUMABLES_LOW");
  const has = (crew: CrewId, level: AlertLevel) => open.some((a) => a.level === level && a.subjects.includes(crew));
  const events: PendingEvent[] = [];
  for (const c of onEva(state)) {
    const level: AlertLevel | null = c.o2_frac <= warning ? "warning" : c.o2_frac <= caution ? "caution" : null;
    if (!level || has(c.crew_id, level) || (level === "caution" && has(c.crew_id, "warning"))) continue;
    events.push(
      raise(
        state,
        ctx.next_seq + events.length,
        "CONSUMABLES_LOW",
        level,
        [c.crew_id],
        level === "warning" ? MESSAGES.o2Warning : MESSAGES.o2Caution,
        { o2_frac: c.o2_frac, threshold_frac: level === "warning" ? warning : caution },
        { "data.o2_frac": "simulated", "data.threshold_frac": "assumed" },
      ),
    );
  }
  return { state, events, deltas: [] };
}

/** BUDDY_SEPARATION from `buddy_max_m` in the alert ParamSet; distance in projected metres. */
export function buddyTick(state: EngineState, ctx: TickContext): TickResult {
  const crew = onEva(state);
  if (crew.length < 2 || active(state, "BUDDY_SEPARATION").length > 0) return { state, events: [], deltas: [] };
  const max = num(alertParams(ctx), "buddy_max_m");
  const [a, b] = crew;
  const distance_m = Math.hypot(a.x_m - b.x_m, a.y_m - b.y_m);
  if (distance_m <= max) return { state, events: [], deltas: [] };
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
