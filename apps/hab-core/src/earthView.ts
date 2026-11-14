/**
 * What the Earth console sees: the crew and alert state one light time old (N-130, BD-157; 01 FR-43, FR-48; 02 §D.12).
 * Earth receives what left Mars `light_time_s` ago, so at sim time t the view is the state at t - light_time_s. Pure over the log
 * and the 30 s crew trace; sim time only, no clock (NFR-06). No science: the delay is the Earth-link table's light time, which
 * the engine already holds in `state.earth`. A store-and-forward wait for a relay pass (the delivery rule of a message) is not
 * added; the caller gives the link state beside the view.
 */
import type { Alert, CrewId, LogEvent, LogEventData, ProvenanceMap } from "@marswalk/protocol";

export interface EarthViewInput {
  /** Sim time now (UTC). */
  now_utc: string;
  /** One-way light time at now; null before the Earth table starts. */
  light_time_s: number | null;
  /** The session's crew trace (`EngineState.trace`): positions every 30 sim-s. */
  trace: readonly { crew_id: CrewId; points: readonly { sim_time: string; x_m: number; y_m: number }[] }[];
  /** The session log, in order. */
  events: readonly LogEvent[];
}

export interface EarthView {
  /** The instant the view shows: now minus the light time. Null when the light time is not known. */
  as_of_utc: string | null;
  light_time_s: number | null;
  delay_model: "light_time";
  /** Each crew member's last trace point at or before `as_of_utc`; a crew member with none yet is absent. */
  crew: { crew_id: CrewId; x_m: number; y_m: number; sample_utc: string }[];
  /** The alerts raised at or before `as_of_utc` and not cleared at or before it. */
  alerts: { alert_id: string; code: Alert["code"]; level: Alert["level"]; subjects: string[]; message: string; raised_utc: string }[];
  source_ids: Record<string, string>;
  provenance: ProvenanceMap;
}

export function earthView(input: EarthViewInput): EarthView {
  const provenance: ProvenanceMap = { crew: "simulated", alerts: "simulated", as_of_utc: "derived" };
  const source_ids: Record<string, string> = { crew: "engine:trace", alerts: "engine:log", as_of_utc: "earth_link" };
  if (input.light_time_s === null) return { as_of_utc: null, light_time_s: null, delay_model: "light_time", crew: [], alerts: [], source_ids, provenance };
  const asOfMs = Date.parse(input.now_utc) - Math.round(input.light_time_s * 1000);
  const crew: EarthView["crew"] = [];
  for (const t of input.trace) {
    let last: (typeof t.points)[number] | undefined;
    for (const p of t.points) if (Date.parse(p.sim_time) <= asOfMs) last = p;
    if (last !== undefined) crew.push({ crew_id: t.crew_id, x_m: last.x_m, y_m: last.y_m, sample_utc: last.sim_time });
  }
  const open = new Map<string, EarthView["alerts"][number]>();
  for (const e of input.events) {
    if (Date.parse(e.sim_time) > asOfMs) continue;
    if (e.kind === "ALERT_RAISED") {
      const d = e.data as unknown as LogEventData["ALERT_RAISED"];
      open.set(d.alert_id, { alert_id: d.alert_id, code: d.code, level: d.level, subjects: [...d.subjects], message: d.message, raised_utc: e.sim_time });
    } else if (e.kind === "ALERT_CLEARED") {
      open.delete((e.data as unknown as LogEventData["ALERT_CLEARED"]).alert_id);
    }
  }
  return { as_of_utc: new Date(asOfMs).toISOString().replace(".000Z", "Z"), light_time_s: input.light_time_s, delay_model: "light_time", crew, alerts: [...open.values()], source_ids, provenance };
}
