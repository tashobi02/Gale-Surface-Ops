/**
 * Session manager (docs/specs/05 §C.2 Session; 02 §A.6; FR-30, FR-34, NFR-10). Contract C14, frozen
 * by T22.01; implementation T22.12. Owns the authoritative state: loads a scenario (SESSION_LOADED,
 * then the seeded TASK_ADDED events), runs clock → tick → append each step, applies commands
 * through commands.ts (T23.02), and resumes from disk after a restart.
 *
 * The server (T20.04) converts real elapsed time into sim steps and calls `advance`; the session
 * and engine never read wall-clock time (NFR-06).
 *
 * Rules (proposed 2026-11-07, T22.12; tests: tests/session.test.ts):
 * - Ticks run only while the session is RUNNING; LOADED, PAUSED and ENDED hold sim time.
 * - tick() returns a state that already contains its events (tick.ts "State rule"); the session
 *   appends them and checks that the log gives the seqs tick used. Command events are reduced here.
 * - A snapshot is written after any append batch that crosses a multiple of SNAPSHOT_EVERY, so a
 *   snapshot never splits one tick's or one command's events. The tick's state is stored before its
 *   events are appended, so the snapshot holds the state after the tick and the current `log_hash`
 *   (tests: tests/sessionTick.test.ts).
 * - Resume: state from the latest snapshot (or the initial state; a snapshot without `motion`, written
 *   before T22.09, gets `{}`), then the tail is merged with re-run ticks: ticks step sim time up to each tail event; events a tick produces must equal the
 *   next tail events (else the resume fails), and the other tail events (load, commands) are
 *   reduced as read. Ticks after the last logged event are not re-run, so a resumed session
 *   restarts at the sim time of its last event.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION, type Command, type DoseSeries, type CommandRef, type CommandResult, type LogEvent, type LogEventData, type PlanExport, type ProvenanceMap, type Snapshot } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand } from "./commands";
import { SIM_STEP_S } from "./engine/clock";
import { invalidateHavenCache } from "./engine/haven";
import { buildHabSite, prepareSite, relocateCrew, type HabSite } from "./engine/liveSetup";
import { arrivedAt, jumpEnded, nextStopTarget, type JumpEnd } from "./engine/nextStop";
import { initialState, logged, reduce, type EngineState, type PendingEvent, type StateChange } from "./engine/reducer";
import { relayCoverageGrid } from "./engine/rovers";
import { seedTasks } from "./engine/tasks";
import { tick } from "./engine/tick";
import { canonicalJson, openLog, resumeLog, SNAPSHOT_EVERY, type EventLog } from "./log";
import { loadCandidateComm, type LoadedScenario } from "./scenario";

export interface SessionHandle {
  /** Full state for SNAPSHOT and `GET /api/session`; the server supplies the connected clients. */
  snapshot(clients: Snapshot["clients"]): Snapshot;
  /**
   * Validate and apply one command; exactly one COMMAND_RESULT per command (02 §E.6).
   * `client_id` keys the 05 Command dedupe rule and `command_ref`; server.ts passes the HELLO
   * `client_id`. Without one (tests, headless replay) the role stands in for the client.
   *
   * `replaced` is true when the command replaced the session (RESET_SESSION, LOAD_SCENARIO; T32.15). `events` are then the
   * old session's events the command logged (the reset's SESSION_RESET; none for a load), `result.event_seq` is the
   * last of them (or, for a load, the new session's first), and the server answers with a fresh SNAPSHOT of the new
   * session instead of the new session's own events.
   */
  apply(command: Command, client_id?: string): { result: CommandResult; events: LogEvent[]; replaced?: boolean };
  /** Run `steps` fixed 1-s sim steps; events go out immediately, deltas are coalesced by the server. */
  advance(steps: number): { events: LogEvent[]; deltas: StateChange[] };
  /**
   * Log that a HELLO displaced the holder of a role (02 §E.4): one `ROLE_TAKEN_OVER` event, actor `system`, at the
   * current sim time. The server calls it; the engine reads no wall clock for it (NFR-06).
   */
  recordRoleTakeOver(data: LogEventData["ROLE_TAKEN_OVER"]): LogEvent;
  /** Logged events after `seq` (reconnect, 02 §E.6). */
  eventsAfter(seq: number): LogEvent[];
  /**
   * The hab site in use (T32.14): the chosen candidate's mast, comm grid and haven field; null when the Site has no
   * candidates or the scenario no routing grid. Recomputed by SELECT_HAB_SITE; the haven field is built on first
   * read for the candidate a session starts with. Not part of any snapshot or log (typed arrays), read by tools,
   * the link graph (TASK-26) and the tests.
   */
  habSite(): HabSite | null;
  /**
   * The coverage grid of a utility rover parked as a relay (N-11, 02 §E.5 `GET /api/relay-coverage/<vehicle_id>`): the u8 grid in
   * the `comm_hab` layout and the `relay_coverage_rev` it belongs to; null when the vehicle is not a parked relay. Derived from
   * the state and the grid, cached per rover position and revision; not part of any snapshot or log.
   */
  relayCoverage(vehicle_id: string): { rev: number; width: number; height: number; data: Uint8Array } | null;
  /**
   * The loaded scenario's own plan, unchanged by PLAN_REVISED (the snapshot's `plan` is the engine's current one, whose
   * waypoints the reducer replaces). The post-EVA report diffs revisions against it and reads its planned timing (FR-46).
   */
  initialPlan(): PlanExport | null;
  /**
   * What the post-EVA report needs that the log does not hold (FR-46; BD-76, BD-132): the scenario's dose series (the planned
   * background dose is its `background_rate` times the planned EVA hours) and the crew trace sampled every 30 sim-s by this
   * session, which a resume re-derives (U-24). Both are copied by the report builder.
   */
  reportInputs(): { dose: DoseSeries | null; trace: NonNullable<EngineState["trace"]> };
}

export interface SessionOptions {
  /** Find a scenario by id for `LOAD_SCENARIO` other than the one loaded; without it only a reload works. */
  resolveScenario?: (scenario_id: string) => LoadedScenario;
  /**
   * The id the first session of this manager starts under (default: the next free `s-<n>`). A headless replay of an exported
   * command list starts under the id the list came from, which SESSION_LOADED holds, so the hash can match (BD-121).
   */
  firstSessionId?: string;
}

/** Provenance classes of the SNAPSHOT fields (05 §C.2 Crew, Vehicle; 02 §E.6 example). */
const SNAPSHOT_PROVENANCE: ProvenanceMap = {
  "crew.x_m": "simulated",
  "crew.y_m": "simulated",
  "crew.o2_frac": "simulated",
  "crew.dose_event_ugy": "simulated",
  "crew.dose_event_unsheltered_ugy": "simulated",
  "crew.haven.minutes": "modelled",
  "crew.linked": "simulated",
  "vehicles.x_m": "simulated",
  "vehicles.y_m": "simulated",
  "vehicles.eta_s": "modelled",
  "earth.light_time_s": "derived",
  // Protocol v0.2 (contract §4, §5): a view never computes or defaults these; null renders as "—".
  "crew.o2_remaining_min": "simulated",
  "crew.next_stop_bearing_deg": "derived",
  "crew.next_stop_distance_m": "derived",
  "crew.next_stop_eta_s": "modelled",
  "crew.link_hops": "simulated",
  "crew.link_via": "simulated",
  "crew.last_linked_sim_time": "simulated",
  "vehicles.queue.eta_s": "modelled",
  "vehicles.queue.battery_wh_after": "modelled",
  "conditions.ltst": "derived",
  "conditions.sun_elevation_deg": "derived",
  "conditions.sol": "derived",
  "conditions.dose_rate_background_ugy_h": "replayed",
  "conditions.dose_rate_event_ugy_h": "replayed",
};

/** A step limit for JUMP_NEXT_EVENT when no event comes: the maximum EVA duration of the plan in force (0 with no plan, T32.07). */
const jumpLimitSteps = (state: EngineState): number => (state.plan === null ? 0 : Math.ceil((state.plan.scenario.max_eva_duration_h * 3600) / SIM_STEP_S));

const addSeconds = (iso: string, s: number): string => new Date(Date.parse(iso) + s * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

class Session implements SessionHandle {
  private state: EngineState;
  private log: EventLog;
  private accepted: AcceptedCommands;
  /** The scenario as loaded: what RESET_SESSION starts again from. */
  private baseScenario: LoadedScenario;
  /** The scenario in use: `baseScenario` with the chosen candidate's comm grid and mast after SELECT_HAB_SITE. */
  private scenario: LoadedScenario;
  /** The chosen hab; undefined until first needed (the haven field costs a Dijkstra pass), null when there is none. */
  private site: HabSite | null | undefined;
  /** Memo of `relayCoverageGrid` (a pure function of the rover and the scenario), keyed by rover, revision and position. */
  private readonly relayCache = new Map<string, { width: number; height: number; data: Uint8Array }>();

  constructor(
    scenario: LoadedScenario,
    private readonly varDir: string,
    private readonly options: SessionOptions,
    resumed?: { log: EventLog; state: EngineState; accepted: AcceptedCommands; scenario: LoadedScenario },
  ) {
    this.baseScenario = scenario;
    this.scenario = resumed?.scenario ?? scenario;
    if (resumed) {
      this.log = resumed.log;
      this.state = resumed.state;
      this.accepted = resumed.accepted;
    } else {
      const started = startSession(scenario, varDir, options.firstSessionId);
      this.log = started.log;
      this.state = started.state;
      this.accepted = new AcceptedCommands();
    }
  }

  initialPlan(): PlanExport | null {
    return this.scenario.scenario.plan ?? null;
  }

  relayCoverage(vehicle_id: string): { rev: number; width: number; height: number; data: Uint8Array } | null {
    const v = this.state.vehicles.find((x) => x.vehicle_id === vehicle_id);
    const rev = v?.relay_coverage_rev ?? null;
    if (v === undefined || rev === null) return null;
    const key = `${vehicle_id}|${rev}|${v.x_m}|${v.y_m}`;
    const hit = this.relayCache.get(key);
    if (hit !== undefined) return { rev, ...hit };
    const grid = relayCoverageGrid(this.scenario, v);
    if (grid === null) return null;
    this.relayCache.clear(); // one live revision per rover is enough
    this.relayCache.set(key, grid);
    return { rev, ...grid };
  }

  reportInputs(): { dose: DoseSeries | null; trace: NonNullable<EngineState["trace"]> } {
    return { dose: this.scenario.dose, trace: this.state.trace ?? [] };
  }

  habSite(): HabSite | null {
    if (this.site === undefined) this.site = buildHabSite(this.scenario, this.state.session.hab_candidate_id);
    return this.site;
  }

  snapshot(clients: Snapshot["clients"]): Snapshot {
    const s = this.state;
    return {
      v: PROTOCOL_VERSION,
      type: "SNAPSHOT",
      seq: s.session.last_seq,
      sim_time: s.session.clock.sim_time,
      session: { ...s.session, log_hash: this.log.hash() },
      plan: s.plan,
      crew: s.crew,
      vehicles: s.vehicles,
      alerts: s.alerts,
      options: s.options,
      tasks: s.tasks,
      earth: { ...s.earth, queue: s.earthQueue },
      clients,
      provenance: SNAPSHOT_PROVENANCE,
      conditions: s.conditions,
      task_library: this.scenario.scenario.task_library ?? [],
      // Scenario files written before the live-session shape (backend 01b, 25) have no event_library: [] until then.
      event_library: (this.scenario.scenario.event_library ?? []).map(({ event_id, title, kind, label, source_id, provenance }) => ({ event_id, title, kind, label, source_id, provenance })),
      next_stop_target: nextStopTarget(s),
    };
  }

  /**
   * Evaluate one command and journal it (BD-93, BD-121): one `CommandJournalLine` goes to `commands.jsonl` of the session the
   * command was evaluated in, after its events are written. Not journaled: a resent command id (answered from memory, nothing
   * logged), a LOAD_SCENARIO that replaced the session or found no scenario (nothing was logged), anything else that logged no
   * event. A JUMP_NEXT_EVENT that ran to the limit without an event is journaled: it moved sim time.
   */
  apply(command: Command, client_id: string = command.role): { result: CommandResult; events: LogEvent[]; replaced?: boolean } {
    const log = this.log;
    const sim_time = this.state.session.clock.sim_time;
    const after_seq = log.lastSeq();
    const out = this.evaluate(command, client_id);
    if (out.events.length > 0 || (out.result.ok && command.kind === "JUMP_NEXT_EVENT")) {
      log.journal({ sim_time, after_seq, role: command.role, kind: command.kind, args: command.args ?? {}, command_id: command.command_id, client_id });
    }
    return out;
  }

  private evaluate(command: Command, client_id: string): { result: CommandResult; events: LogEvent[]; replaced?: boolean } {
    const out = handleCommand(this.state, command, { scenario: this.scenario, client_id, next_seq: this.log.lastSeq() + 1, accepted: this.accepted });
    if (out.effect?.kind === "load") {
      // Reloading the scenario in use starts from the scenario as loaded, not with the comm grid of a chosen candidate.
      const scenario = out.effect.scenario_id === this.scenario.scenario.scenario_id ? this.baseScenario : this.options.resolveScenario?.(out.effect.scenario_id);
      if (!scenario) return { result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code: "INVALID", message: `unknown scenario ${out.effect.scenario_id}` }, events: [] };
      const started = startSession(scenario, this.varDir);
      this.baseScenario = scenario;
      this.scenario = scenario;
      this.site = undefined;
      invalidateHavenCache();
      this.log = started.log;
      this.state = started.state;
      this.accepted = new AcceptedCommands();
      return { result: okResult(command, this.log.after(0)[0].seq), events: [], replaced: true };
    }
    if (out.effect?.kind === "reset") return this.resetSession(command, client_id);
    if (out.effect?.kind === "site") return this.selectSite(command, client_id, out);
    if (out.effect?.kind === "next_stop") return this.jumpToNextStop(command, client_id);
    if (out.effect?.kind === "jump") {
      const { events } = this.runTicks(jumpLimitSteps(this.state), true);
      const result = okResult(command, events[0]?.seq ?? this.log.lastSeq());
      return { result, events };
    }
    const events = this.appendAll(out.events, (e) => {
      this.state = reduce(this.state, e);
    });
    if (events.length > 0 && out.result.ok && out.result.event_seq !== events[0].seq) {
      throw new Error(`apply: event_seq ${out.result.event_seq} is not the first logged seq ${events[0].seq}`);
    }
    return { result: out.result, events };
  }

  /**
   * RESET_SESSION (02 §D.17; BD-115): SESSION_RESET is appended to the old log (its last line; nothing is written there
   * again), then `s-<n+1>` of the same scenario and seed starts in LOADED from the scenario as loaded, the accepted-command
   * memory starts empty and the haven cache is dropped. The command is answered with the SESSION_RESET's seq; the
   * clients get it as an EVENT of the old session, then a fresh SNAPSHOT (server.ts).
   */
  private resetSession(command: Command, client_id: string): { result: CommandResult; events: LogEvent[]; replaced: true } {
    const data: LogEventData["SESSION_RESET"] = { session_id: this.state.session.session_id, next_session_id: nextSessionId(this.varDir) };
    const closing: PendingEvent = { sim_time: this.state.session.clock.sim_time, kind: "SESSION_RESET", actor: command.role, data, provenance: {}, command_ref: { client_id, command_id: command.command_id } };
    const events = this.appendAll([closing], (e) => {
      this.state = reduce(this.state, e);
    });
    const started = startSession(this.baseScenario, this.varDir);
    if ((started.state.session.session_id) !== data.next_session_id) throw new Error(`resetSession: started ${started.state.session.session_id}, SESSION_RESET named ${data.next_session_id}`);
    this.scenario = this.baseScenario;
    this.site = undefined;
    invalidateHavenCache();
    this.log = started.log;
    this.state = started.state;
    this.accepted = new AcceptedCommands();
    return { result: okResult(command, events[0].seq), events, replaced: true };
  }

  /**
   * SELECT_HAB_SITE after validation (02 §D.17; BD-116): the candidate's comm grid and mast and its haven field are
   * prepared first, so a missing asset answers INVALID with nothing logged; then SITE_SELECTED is logged, the crew are
   * placed in the chosen hab and the haven cache is dropped.
   */
  private selectSite(command: Command, client_id: string, out: ReturnType<typeof handleCommand>): { result: CommandResult; events: LogEvent[] } {
    const effect = out.effect as { kind: "site"; candidate_id: string };
    let prepared: ReturnType<typeof prepareSite>;
    try {
      prepared = prepareSite(this.scenario, effect.candidate_id);
    } catch (err) {
      const message = `SELECT_HAB_SITE: cannot load hab candidate ${effect.candidate_id}: ${err instanceof Error ? err.message : String(err)}`;
      const rejection: PendingEvent = { sim_time: this.state.session.clock.sim_time, kind: "COMMAND_REJECTED", actor: command.role, data: { code: "INVALID", message }, provenance: {}, command_ref: { client_id, command_id: command.command_id } };
      const events = this.appendAll([rejection], (e) => {
        this.state = reduce(this.state, e);
      });
      return { result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code: "INVALID", message }, events };
    }
    this.scenario = prepared.scenario;
    this.site = prepared.site;
    invalidateHavenCache();
    const events = this.appendAll(out.events, (e) => {
      this.state = relocateCrew(reduce(this.state, e), this.scenario, effect.candidate_id);
    });
    if (out.result.ok && out.result.event_seq !== events[0].seq) throw new Error(`selectSite: event_seq ${out.result.event_seq} is not the first logged seq ${events[0].seq}`);
    return { result: out.result, events };
  }

  /**
   * JUMP_NEXT_STOP (02 §D.17; BD-92, BD-113): the ordinary 1-s ticks, without waiting, until every crew member on EVA is
   * at the target stop or a tick's events end the jump (`jumpEnded`), bounded by the plan's maximum EVA duration. The
   * run is made on a copy of the state first, so a jump that reaches no end condition changes nothing and is answered
   * INVALID. The tick events keep their own sim seconds; CLOCK_JUMPED, the command's own event (its `event_seq`), is
   * logged after them. Speed and pause are untouched. The jump also runs while PAUSED (the EVA is running).
   */
  private jumpToNextStop(command: Command, client_id: string): { result: CommandResult; events: LogEvent[] } {
    const target = nextStopTarget(this.state);
    if (target === null) throw new Error("jumpToNextStop: commands.ts accepted a jump with no stop left");
    const ref: CommandRef = { client_id, command_id: command.command_id };
    const from_sim_time = this.state.session.clock.sim_time;
    const limit = jumpLimitSteps(this.state);
    let state = this.state;
    let seq = this.log.lastSeq() + 1;
    const ticked: PendingEvent[] = [];
    let ended_by: JumpEnd | null = null;
    for (let i = 0; i < limit && ended_by === null && (state.session.status === "RUNNING" || state.session.status === "PAUSED"); i++) {
      const r = stepOnce(state, this.scenario, seq);
      state = r.state;
      ticked.push(...r.events);
      seq += r.events.length;
      ended_by = jumpEnded(r.events) ?? (arrivedAt(state, target) ? "arrival" : null);
    }
    if (ended_by === null) {
      const message = `JUMP_NEXT_STOP: no end condition within the plan's maximum EVA duration (stop ${target.stop_id} cannot be reached)`;
      const rejection: PendingEvent = { sim_time: from_sim_time, kind: "COMMAND_REJECTED", actor: command.role, data: { code: "INVALID", message }, provenance: {}, command_ref: ref };
      const events = this.appendAll([rejection], (e) => {
        this.state = reduce(this.state, e);
      });
      return { result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code: "INVALID", message }, events };
    }
    const data: LogEventData["CLOCK_JUMPED"] = { reason: "next_stop", from_sim_time, to_sim_time: state.session.clock.sim_time, stop_id: target.stop_id, ended_by };
    const closing: PendingEvent = { sim_time: data.to_sim_time, kind: "CLOCK_JUMPED", actor: command.role, data, provenance: {}, command_ref: ref };
    // The state after the ticks is stored first (as runTicks does): the snapshot appendAll may write is the state after the jump.
    this.state = state;
    let expected = this.log.lastSeq() + 1;
    const events = this.appendAll([...ticked, closing], (e) => {
      if (e.seq !== expected) throw new Error(`jumpToNextStop: the log gave seq ${e.seq} to an event numbered ${expected}`);
      expected++;
      if (e.kind === "CLOCK_JUMPED") this.state = reduce(this.state, e);
    });
    const result = okResult(command, events[events.length - 1].seq);
    this.accepted.record(client_id, command.command_id, result);
    return { result, events };
  }

  advance(steps: number): { events: LogEvent[]; deltas: StateChange[] } {
    if (!Number.isInteger(steps) || steps < 0) throw new Error(`advance: steps must be a non-negative integer: ${steps}`);
    if (this.state.session.status !== "RUNNING") return { events: [], deltas: [] };
    return this.runTicks(steps, false);
  }

  recordRoleTakeOver(data: LogEventData["ROLE_TAKEN_OVER"]): LogEvent {
    const pending: PendingEvent = { sim_time: this.state.session.clock.sim_time, kind: "ROLE_TAKEN_OVER", actor: "system", data, provenance: {}, command_ref: null };
    return this.appendAll([pending], (e) => {
      this.state = reduce(this.state, e);
    })[0];
  }

  eventsAfter(seq: number): LogEvent[] {
    return this.log.after(seq);
  }

  /** Step up to `steps` ticks (stopping after the first step with events when `untilEvent`). */
  private runTicks(steps: number, untilEvent: boolean): { events: LogEvent[]; deltas: StateChange[] } {
    const events: LogEvent[] = [];
    const deltas: StateChange[] = [];
    for (let i = 0; i < steps && this.state.session.status === "RUNNING"; i++) {
      const next_seq = this.log.lastSeq() + 1;
      const r = stepOnce(this.state, this.scenario, next_seq);
      // tick's state already contains its events. Store it first: appendAll fills in `log_hash` and
      // writes the snapshot from `this.state`, which must be the state after the tick (T22.12).
      this.state = r.state;
      let expected = next_seq;
      events.push(
        ...this.appendAll(r.events, (e) => {
          if (e.seq !== expected) throw new Error(`runTicks: the log gave seq ${e.seq} to an event tick numbered ${expected}`);
          expected++;
        }),
      );
      deltas.push(...r.deltas);
      if (untilEvent && r.events.length > 0) break;
    }
    return { events, deltas };
  }

  /** Append in order, run `each` after every append, then snapshot if the batch crossed a multiple of SNAPSHOT_EVERY. */
  private appendAll(pending: PendingEvent[], each: (e: LogEvent) => void): LogEvent[] {
    const before = this.log.lastSeq();
    const appended = pending.map((p) => {
      const e = this.log.append(p);
      each(e);
      return e;
    });
    this.state = { ...this.state, session: { ...this.state.session, log_hash: this.log.hash() } };
    if (Math.floor(this.log.lastSeq() / SNAPSHOT_EVERY) > Math.floor(before / SNAPSHOT_EVERY)) this.log.snapshot(this.state);
    return appended;
  }
}

/** The report trace's period, sim seconds (05 U-24: "decimated to 30 s"; BD-76). */
const TRACE_STEP_S = 30;

/**
 * Add one trace point per crew member when the sim clock, as a UTC second count, is a multiple of 30 s (BD-76). The points are
 * the positions of the state the tick produced, `simulated`; they are state, not log, so the same ticks always give the same
 * points and a resume re-derives the ones after its snapshot. Pure.
 */
function sampleTrace(state: EngineState): EngineState {
  const seconds = Date.parse(state.session.clock.sim_time) / 1000;
  if (!Number.isInteger(seconds) || seconds % TRACE_STEP_S !== 0) return state;
  const previous = new Map((state.trace ?? []).map((t) => [t.crew_id, t.points]));
  const trace = state.crew.map((c) => ({ crew_id: c.crew_id, points: [...(previous.get(c.crew_id) ?? []), { sim_time: state.session.clock.sim_time, x_m: c.x_m, y_m: c.y_m }] }));
  return { ...state, trace };
}

/** One 1-s step: sim time first (never logged), then tick (02 §D.14), then the report trace sample. */
function stepOnce(state: EngineState, scenario: LoadedScenario, next_seq: number): ReturnType<typeof tick> {
  const stepped: EngineState = { ...state, session: { ...state.session, clock: { ...state.session.clock, sim_time: addSeconds(state.session.clock.sim_time, SIM_STEP_S) } } };
  const r = tick(stepped, scenario, SIM_STEP_S, next_seq);
  return { ...r, state: sampleTrace(r.state) };
}

/** Next free `s-<n>` under `varDir/sessions` (05 Session). */
function nextSessionId(varDir: string): string {
  const dir = join(varDir, "sessions");
  const used = existsSync(dir)
    ? readdirSync(dir)
        .map((d) => /^s-(\d+)$/.exec(d))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => Number(m[1]))
    : [];
  return `s-${String((used.length ? Math.max(...used) : 0) + 1).padStart(4, "0")}`;
}

/** New session folder: initial state, SESSION_LOADED, then the seeded TASK_ADDED events (FR-50). */
function startSession(scenario: LoadedScenario, varDir: string, firstId?: string): { log: EventLog; state: EngineState } {
  const session_id = firstId ?? nextSessionId(varDir);
  const dir = join(varDir, "sessions", session_id);
  mkdirSync(dir, { recursive: true });
  const log = openLog(dir);
  let state = initialState(scenario, session_id);
  const s = scenario.scenario;
  const loadedData: LogEventData["SESSION_LOADED"] = { session_id, scenario_id: s.scenario_id, data_version: s.data_version, seed: s.seed, plan_hash: s.plan?.plan_hash ?? null };
  const pending: PendingEvent[] = [{ sim_time: s.start_utc, kind: "SESSION_LOADED", actor: "system", data: loadedData, provenance: {}, command_ref: null }];
  if ((s.stop_tasks ?? []).length > 0) pending.push(...seedTasks(scenario).map((e) => ({ ...e, command_ref: null })));
  for (const p of pending) state = reduce(state, log.append(p));
  state = { ...state, session: { ...state.session, log_hash: log.hash() } };
  return { log, state };
}

function okResult(command: Command, event_seq: number): CommandResult {
  return { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq };
}

/** Load a validated scenario into a new session under `varDir/sessions/<session_id>/`. T22.12. */
export function loadSession(scenario: LoadedScenario, varDir: string, options: SessionOptions = {}): SessionHandle {
  return new Session(scenario, varDir, options);
}

/** Resume from `session.jsonl` + the latest snapshot, re-running ticks (see the rules above) (NFR-10). T22.12. */
export function resumeSession(sessionDir: string, scenario: LoadedScenario, options: SessionOptions = {}): SessionHandle {
  const { log, state: snap, tail } = resumeLog(sessionDir);
  const varDir = join(sessionDir, "..", "..");
  const first = log.after(0)[0];
  if (!first || first.kind !== "SESSION_LOADED") throw new Error(`resumeSession: ${sessionDir} does not start with SESSION_LOADED`);
  const session_id = (first.data as LogEventData["SESSION_LOADED"]).session_id;
  // A snapshot written before T22.09 has no `motion`: start from none (the walk restarts from the plan's first leg).
  // A snapshot written before the live-session fields (backend package 04, BD-100) lacks them: they start as the scenario's.
  const fresh = initialState(scenario, session_id);
  let state: EngineState = snap
    ? {
        ...snap,
        motion: snap.motion ?? {},
        session: {
          ...snap.session,
          hab_candidate_id: snap.session.hab_candidate_id === undefined ? fresh.session.hab_candidate_id : snap.session.hab_candidate_id,
          mission_setup: snap.session.mission_setup ?? fresh.session.mission_setup,
          started_events: snap.session.started_events ?? [],
        },
      }
    : fresh;

  let i = 0;
  while (i < tail.length) {
    const e = tail[i];
    // A paused clock also re-runs ticks here: only a JUMP_NEXT_STOP moves sim time while paused (its tick events, then CLOCK_JUMPED).
    if (Date.parse(e.sim_time) > Date.parse(state.session.clock.sim_time) && (state.session.status === "RUNNING" || state.session.status === "PAUSED")) {
      const r = stepOnce(state, scenario, state.session.last_seq + 1);
      for (const produced of r.events) {
        const line = tail[i];
        if (!line || canonicalJson(logged(produced, line.seq)) !== canonicalJson(line)) {
          throw new Error(`resumeSession: re-run tick at ${r.state.session.clock.sim_time} gave ${produced.kind}, the log has ${line?.kind ?? "nothing"} (seq ${line?.seq ?? "-"})`);
        }
        i++;
      }
      state = r.state;
    } else if (Date.parse(e.sim_time) > Date.parse(state.session.clock.sim_time)) {
      // Not running (paused or before START_EVA): sim time did not tick, so the event's time stands.
      throw new Error(`resumeSession: seq ${e.seq} at ${e.sim_time} is later than the held sim time ${state.session.clock.sim_time}`);
    } else {
      state = reduce(state, e);
      // The crew follow a chosen hab; the event carries only the id, so the placement is re-derived here as in apply (T32.14).
      if (e.kind === "SITE_SELECTED") state = relocateCrew(state, scenario, (e.data as LogEventData["SITE_SELECTED"]).candidate_id);
      i++;
    }
  }
  state = { ...state, session: { ...state.session, log_hash: log.hash() } };
  // A session that chose another hab than the scenario's starts with resumes on that candidate's comm grid and mast.
  const chosen = state.session.hab_candidate_id;
  const inUse = chosen !== null && chosen !== (scenario.scenario.mission_setup.hab_candidate_id ?? null) && scenario.site_ref !== undefined
    ? { ...scenario, comm: loadCandidateComm(scenario.site_ref, chosen) }
    : scenario;
  return new Session(scenario, varDir, options, { log, state, accepted: AcceptedCommands.fromLog(log.after(0)), scenario: inUse });
}
