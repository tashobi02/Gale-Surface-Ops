/**
 * Earth messages and forecasts (docs/specs/02 §D.12, §D.17; 01 FR-43, FR-37; 05 EarthMessage). T26.04 (backend package 18).
 * Pure; sim time only, never wall-clock (NFR-06). Every delivery time comes from `@marswalk/compute` `deliveryTime`
 * (the simplified DTN rule over the precomputed EarthLinkTable); this module queues, holds and delivers, and does no
 * geometry of its own.
 *
 * Rules (Proposed 2026-11-12, backend package 18; decided by the orchestrator (Claude) under Sadman Shaharier Mahim's
 * authority, 12 Nov 2026; BD-60, BD-99, BD-129; tests: tests/earth.test.ts):
 * - SEND_MESSAGE: `eva:*` and `ops` write to Earth (`to_earth`), `earth` writes to Mars (`to_mars`). `args.body` is a string
 *   of 1 to 280 characters after trimming (`INVALID`; args before state), refused with `BUSY` after the EVA has ended.
 *   It logs EARTH_MSG_QUEUED, `message_id` `m-<seq>`, sent at sim time now.
 * - Blackout (BD-60): where compute returns null (conjunction at the send, or a later pass that starts in conjunction) the
 *   message is held; its delivery is that of a message sent at the first table row after the send at which compute can
 *   deliver it. If no row can, SEND_MESSAGE answers `BUSY` and a scheduled input is not queued. A compute RangeError (a table
 *   with no passes, or a send time before the table) is the same: the message cannot be delivered.
 * - Delivery: each tick logs EARTH_MSG_DELIVERED, once, for every QUEUED message whose `deliver_utc` is at or before sim time.
 * - Scheduled inputs fire in the tick whose step `[sim_time - dt, sim_time)` contains their time: a scenario `events` entry
 *   of kind EARTH_MESSAGE at its `t_utc`, a started library event's input of that kind at `t0 + t_offset_s` (`dueInputs`,
 *   BD-99). Both are Earth to Mars messages sent at `payload.sent_earth_utc`, else at the firing time (05 ScenarioEvent:
 *   `t_utc` is the Earth issue time). Other kinds (DONKI_RECORD, ADVISORY, INJECT) have no engine effect.
 * - `state.earth` (the SNAPSHOT block): light time, next relay pass start, blackout and the link state (AVAILABLE with its
 *   carrier and the pass end, WAITING, BLACKOUT; compute `earthLinkState`, N-31, BD-156) from the table at sim time, unchanged
 *   before the table's first row; a changed field is a STATE_DELTA at `earth/<field>`.
 */
import { deliveryTime, earthLinkState, linkAt, nextPassStart, type EarthDeliveryResult } from "@marswalk/compute";
import { PROTOCOL_VERSION, type Command, type CommandResult, type EarthLinkTable, type LogEventData, type ParamSet } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import { dueInputs } from "./liveEvents";
import type { CommandOutcome, EngineState, PendingEvent, StateChange } from "./reducer";
import type { TickContext, TickResult } from "./tick";

/** Longest message body, in characters after trimming (BD-129: a message-sized bound, not a science value). */
export const MAX_BODY_CHARS = 280;

const PROVENANCE = { state: "simulated", deliver_utc: "derived" } as const;

const rejected = (command: Command, code: "INVALID" | "BUSY", message: string): CommandOutcome => ({
  result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code, message } satisfies CommandResult,
  events: [],
});

function linkParams(scenario: LoadedScenario): ParamSet {
  const p = Object.values(scenario.params).find((x) => x.kind === "link");
  if (!p) throw new Error("earth: the scenario has no link ParamSet (05 Scenario)");
  return p;
}

type Plan = { delivery: EarthDeliveryResult } | { reason: string };

/**
 * Compute's delivery for a message sent at `sent_utc`; where compute returns null the message is held and delivered as if
 * sent at the first later table row at which compute can deliver it (BD-60). `reason` says why there is no delivery.
 */
function plan(table: EarthLinkTable, direction: "to_earth" | "to_mars", sent_utc: string, params: ParamSet): Plan {
  try {
    const first = deliveryTime(table, direction, sent_utc, params);
    if (first !== null) return { delivery: first };
    const sent_ms = Date.parse(sent_utc);
    for (const row of table.rows) {
      if (Date.parse(row.t_utc) <= sent_ms) continue;
      const later = deliveryTime(table, direction, row.t_utc, params);
      if (later !== null) return { delivery: later };
    }
    return { reason: "the Earth link is in blackout and the table holds no later time at which the message can be delivered" };
  } catch (error) {
    if (error instanceof RangeError) return { reason: `the message cannot be delivered: ${error.message}` };
    throw error;
  }
}

function queued(sim_time: string, actor: PendingEvent["actor"], seq: number, direction: "to_earth" | "to_mars", body: string, sent_utc: string, d: EarthDeliveryResult): PendingEvent {
  const data: LogEventData["EARTH_MSG_QUEUED"] = { message_id: `m-${seq}`, direction, body, sent_utc, deliver_utc: d.deliver_utc, via: d.via };
  return { sim_time, kind: "EARTH_MSG_QUEUED", actor, data, provenance: { ...PROVENANCE } };
}

/** SEND_MESSAGE: queue with its delivery time; log EARTH_MSG_QUEUED. `next_seq` is the seq the log gives the event. */
export function handleSendMessage(state: EngineState, scenario: LoadedScenario, command: Command, next_seq: number): CommandOutcome {
  const raw = command.args?.body;
  const body = typeof raw === "string" ? raw.trim() : "";
  if (typeof raw !== "string" || body.length === 0 || body.length > MAX_BODY_CHARS) return rejected(command, "INVALID", `SEND_MESSAGE needs args.body, 1 to ${MAX_BODY_CHARS} characters`);
  if (state.session.status === "ENDED") return rejected(command, "BUSY", "the EVA has ended; reset the session to send a message");
  const direction = command.role === "earth" ? "to_mars" : "to_earth";
  const sent_utc = state.session.clock.sim_time;
  const p = plan(scenario.earthLink, direction, sent_utc, linkParams(scenario));
  if ("reason" in p) return rejected(command, "BUSY", p.reason);
  // event_seq is filled in by handleCommand from ctx.next_seq.
  return {
    result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: 0 },
    events: [queued(sent_utc, command.role, next_seq, direction, body, sent_utc, p.delivery)],
  };
}

/** Update `earth`; fire due scheduled messages; deliver the queued ones that are due as EARTH_MSG_DELIVERED. */
export function earthTick(state: EngineState, ctx: TickContext): TickResult {
  const scenario = ctx.scenario;
  const params = linkParams(scenario);
  const table = scenario.earthLink;
  const now = state.session.clock.sim_time;
  const now_ms = Date.parse(now);
  const from_ms = now_ms - ctx.dt_s * 1000;

  // ---- the SNAPSHOT earth block ----------------------------------------------------------------------------------
  const deltas: StateChange[] = [];
  let earth = state.earth;
  const row = linkAt(table, now);
  if (row !== null) {
    const link = earthLinkState(table, now, params)!; // a row exists, so the state does
    const next: EngineState["earth"] = {
      light_time_s: row.light_time_s,
      next_pass_utc: nextPassStart(table, now)?.start_utc ?? null,
      blackout: link.state === "BLACKOUT",
      link_state: link.state,
      link_via: link.via,
      link_until_utc: link.until_utc,
    };
    for (const key of ["light_time_s", "next_pass_utc", "blackout", "link_state", "link_via", "link_until_utc"] as const) if (next[key] !== earth[key]) deltas.push({ path: `earth/${key}`, value: next[key] });
    if (deltas.length > 0) earth = next;
  }

  // ---- scheduled Earth messages that fall in this step -----------------------------------------------------------
  const events: PendingEvent[] = [];
  const fresh: { message_id: string; deliver_ms: number }[] = [];
  const fire = (fired_utc: string, payload: Record<string, unknown>): void => {
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (body.length === 0) return;
    const sent = typeof payload.sent_earth_utc === "string" && !Number.isNaN(Date.parse(payload.sent_earth_utc)) ? payload.sent_earth_utc : fired_utc;
    const p = plan(table, "to_mars", sent, params);
    if ("reason" in p) return;
    const seq = ctx.next_seq + events.length;
    events.push(queued(now, "system", seq, "to_mars", body, sent, p.delivery));
    fresh.push({ message_id: `m-${seq}`, deliver_ms: Date.parse(p.delivery.deliver_utc) });
  };
  if (state.session.status !== "ENDED") {
    for (const e of scenario.scenario.events ?? []) {
      const t = Date.parse(e.t_utc);
      if (e.kind === "EARTH_MESSAGE" && t >= from_ms && t < now_ms) fire(e.t_utc, e.payload);
    }
    for (const due of dueInputs(state, scenario, new Date(from_ms).toISOString(), now)) if (due.input.kind === "EARTH_MESSAGE") fire(due.sim_time, due.input.payload);
  }

  // ---- deliveries: queued messages first (queue order), then the ones just queued ------------------------------------
  const delivered = (message_id: string): PendingEvent => ({ sim_time: now, kind: "EARTH_MSG_DELIVERED", actor: "system", data: { message_id } satisfies LogEventData["EARTH_MSG_DELIVERED"], provenance: { ...PROVENANCE } });
  for (const m of state.earthQueue) if (m.state === "QUEUED" && Date.parse(m.deliver_utc) <= now_ms) events.push(delivered(m.message_id));
  for (const m of fresh) if (m.deliver_ms <= now_ms) events.push(delivered(m.message_id));

  return { state: earth === state.earth ? state : { ...state, earth }, events, deltas };
}
