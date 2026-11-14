/**
 * Library events on demand: START_EVENT and the time-shifted dose series (docs/specs/02 §D.17, §D.13; 01 FR-52, FR-38;
 * 05 EventLibraryEntry; backend decisions BD-97, BD-99, BD-114). Pure; sim time only, never wall-clock (NFR-06). T32.12.
 *
 * `seriesUtc` is the one helper that maps sim time onto the recorded series: `series_start_utc + (t − t0)`, null before
 * the press. `doseAt` builds on it and is what tick.ts, alerts.ts and contingencyOps.ts read, so there is no second
 * dose model: after the press the compute functions read the scenario's series at the mapped time; before it they read a
 * constant series at `DoseSeries.background_rate` (02 §D.17). Sun, LTST, light time and relay passes are not shifted.
 *
 * Hand-off: firing a library event's scheduled inputs at `t0 + t_offset_s` is package 18's (T26.04, engine/earth.ts);
 * `inputTime` and `dueInputs` are the helpers it and the conditions feed (T22.16) call. The state lives in
 * `Session.started_events` (reduced from EVENT_STARTED), never in this module.
 *
 * Rules (decided by the orchestrator, 12 Nov 2026, BD-97, BD-114; tests: tests/liveEvents.test.ts):
 * - START_EVENT: `INVALID` for a missing or unknown `event_id`; `BUSY` when the event already started, when another
 *   SPACE_WEATHER event is in progress (the scenario has one dose series), or when the EVA has ended. Allowed before the
 *   EVA starts and while the clock is paused. The presenter and ops roles may send it (N-200, BD-165) (commands.ts checks PERMISSIONS).
 * - `inputTime(state, entry, input)` takes the state (the press time is `t0`); the plan's two-argument form had no `t0`.
 * - `dueInputs` windows are half-open `[from, to)`, like the tick step they serve.
 */
import type { Command, CommandResult, DoseSeries, EventLibraryEntry, EventLibraryInput, LogEventData } from "@marswalk/protocol";
import { PROTOCOL_VERSION } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import type { CommandOutcome, EngineState, PendingEvent } from "./reducer";

/** Sample time of the constant background series: a sentinel before any sim time, not a science value. */
const BACKGROUND_FROM = "1970-01-01T00:00:00Z";

const isoSeconds = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

const rejected = (command: Command, code: "INVALID" | "BUSY", message: string): CommandResult => ({ v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code, message });

/** The library entry with this id, or undefined. */
export function libraryEntry(scenario: LoadedScenario, event_id: string): EventLibraryEntry | undefined {
  return (scenario.scenario.event_library ?? []).find((e) => e.event_id === event_id);
}

/** The space-weather event in progress (the first started, in press order), or null. */
export function activeEvent(state: EngineState, scenario: LoadedScenario): { entry: EventLibraryEntry; t0_sim_time: string } | null {
  for (const s of state.session.started_events) {
    const entry = libraryEntry(scenario, s.event_id);
    if (entry !== undefined && entry.kind === "SPACE_WEATHER") return { entry, t0_sim_time: s.t0_sim_time };
  }
  return null;
}

/** START_EVENT (02 §D.17): logs EVENT_STARTED at the current sim time `t0`. */
export function startEvent(state: EngineState, scenario: LoadedScenario, command: Command): CommandOutcome {
  const id = command.args?.event_id;
  if (typeof id !== "string" || id.length === 0) return { result: rejected(command, "INVALID", "START_EVENT needs args.event_id"), events: [] };
  const entry = libraryEntry(scenario, id);
  if (entry === undefined) return { result: rejected(command, "INVALID", `unknown event ${id}`), events: [] };
  if (state.session.started_events.some((s) => s.event_id === id)) return { result: rejected(command, "BUSY", `event ${id} already started in this session`), events: [] };
  const running = activeEvent(state, scenario);
  if (running !== null && entry.kind === "SPACE_WEATHER") return { result: rejected(command, "BUSY", `event ${running.entry.event_id} is in progress; the scenario has one dose series (BD-114)`), events: [] };
  if (state.session.status === "ENDED") return { result: rejected(command, "BUSY", "the EVA has ended; reset the session to start an event"), events: [] };
  const t0_sim_time = state.session.clock.sim_time;
  const data: LogEventData["EVENT_STARTED"] = { event_id: id, t0_sim_time, series_start_utc: entry.series_start_utc, source_id: entry.source_id };
  const event: PendingEvent = { sim_time: t0_sim_time, kind: "EVENT_STARTED", actor: command.role, data, provenance: {} };
  // event_seq is filled in by handleCommand from ctx.next_seq.
  return { result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: 0 }, events: [event] };
}

/** The recorded series time played at `simTime`: `series_start_utc + (t − t0)`; null before the press or if not started. */
export function seriesUtc(state: EngineState, entry: EventLibraryEntry, simTime: string): string | null {
  const started = state.session.started_events.find((s) => s.event_id === entry.event_id);
  if (started === undefined) return null;
  const elapsed_ms = Date.parse(simTime) - Date.parse(started.t0_sim_time);
  if (!(elapsed_ms >= 0)) return null;
  return isoSeconds(Date.parse(entry.series_start_utc) + elapsed_ms);
}

/** Sim time at which a library input fires: `t0 + t_offset_s` (BD-99); null before the press. */
export function inputTime(state: EngineState, entry: EventLibraryEntry, input: EventLibraryInput): string | null {
  const started = state.session.started_events.find((s) => s.event_id === entry.event_id);
  return started === undefined ? null : isoSeconds(Date.parse(started.t0_sim_time) + input.t_offset_s * 1000);
}

export interface DueInput {
  event_id: string;
  input: EventLibraryInput;
  sim_time: string;
}

/** Inputs of started events due in the sim-time window `[fromSim, toSim)`, in time order (ties: press order, library order). */
export function dueInputs(state: EngineState, scenario: LoadedScenario, fromSim: string, toSim: string): DueInput[] {
  const from = Date.parse(fromSim);
  const to = Date.parse(toSim);
  const due: DueInput[] = [];
  for (const s of state.session.started_events) {
    const entry = libraryEntry(scenario, s.event_id);
    if (entry === undefined) continue;
    for (const input of entry.inputs ?? []) {
      const sim_time = inputTime(state, entry, input);
      if (sim_time === null) continue;
      const t = Date.parse(sim_time);
      if (t >= from && t < to) due.push({ event_id: entry.event_id, input, sim_time });
    }
  }
  return due.sort((a, b) => Date.parse(a.sim_time) - Date.parse(b.sim_time));
}

export interface DoseSource {
  /** What compute reads: the scenario's series after the press, a constant background series before it. */
  series: DoseSeries;
  /** The time to read it at: the mapped series time after the press, `simTime` before it. */
  t_utc: string;
  /** The event playing, or null before any press. */
  event_id: string | null;
}

/** The dose series and time to read at sim time `simTime` (02 §D.17); the single place that decides. */
export function doseAt(state: EngineState, scenario: LoadedScenario, simTime: string): DoseSource {
  const active = activeEvent(state, scenario);
  const mapped = active === null ? null : seriesUtc(state, active.entry, simTime);
  if (active !== null && mapped !== null) return { series: scenario.dose, t_utc: mapped, event_id: active.entry.event_id };
  return { series: { ...scenario.dose, samples: [[BACKGROUND_FROM, scenario.dose.background_rate]] }, t_utc: simTime, event_id: null };
}
