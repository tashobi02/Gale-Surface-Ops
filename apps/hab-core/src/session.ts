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
import { PROTOCOL_VERSION, type Command, type CommandResult, type LogEvent, type LogEventData, type PlanExport, type ProvenanceMap, type Snapshot } from "@marswalk/protocol";
import { AcceptedCommands, handleCommand } from "./commands";
import { SIM_STEP_S } from "./engine/clock";
import { initialState, logged, reduce, type EngineState, type PendingEvent, type StateChange } from "./engine/reducer";
import { seedTasks } from "./engine/tasks";
import { tick } from "./engine/tick";
import { canonicalJson, openLog, resumeLog, SNAPSHOT_EVERY, type EventLog } from "./log";
import type { LoadedScenario } from "./scenario";

export interface SessionHandle {
  /** Full state for SNAPSHOT and `GET /api/session`; the server supplies the connected clients. */
  snapshot(clients: Snapshot["clients"]): Snapshot;
  /**
   * Validate and apply one command; exactly one COMMAND_RESULT per command (02 §E.6).
   * `client_id` keys the 05 Command dedupe rule and `command_ref`; server.ts passes the HELLO
   * `client_id`. Without one (tests, headless replay) the role stands in for the client.
   */
  apply(command: Command, client_id?: string): { result: CommandResult; events: LogEvent[] };
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
   * The loaded scenario's own plan, unchanged by PLAN_REVISED (the snapshot's `plan` is the engine's current one, whose
   * waypoints the reducer replaces). The post-EVA report diffs revisions against it and reads its planned timing (FR-46).
   */
  initialPlan(): PlanExport | null;
}

export interface SessionOptions {
  /** Find a scenario by id for `LOAD_SCENARIO` other than the one loaded; without it only a reload works. */
  resolveScenario?: (scenario_id: string) => LoadedScenario;
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
  private scenario: LoadedScenario;

  constructor(
    scenario: LoadedScenario,
    private readonly varDir: string,
    private readonly options: SessionOptions,
    resumed?: { log: EventLog; state: EngineState; accepted: AcceptedCommands },
  ) {
    this.scenario = scenario;
    if (resumed) {
      this.log = resumed.log;
      this.state = resumed.state;
      this.accepted = resumed.accepted;
    } else {
      const started = startSession(scenario, varDir);
      this.log = started.log;
      this.state = started.state;
      this.accepted = new AcceptedCommands();
    }
  }

  initialPlan(): PlanExport | null {
    return this.scenario.scenario.plan ?? null;
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
      // Next stop target: computed by work package 06 (BD-104); null until then.
      next_stop_target: null,
    };
  }

  apply(command: Command, client_id: string = command.role): { result: CommandResult; events: LogEvent[] } {
    const out = handleCommand(this.state, command, { scenario: this.scenario, client_id, next_seq: this.log.lastSeq() + 1, accepted: this.accepted });
    if (out.effect?.kind === "load") {
      const scenario = out.effect.scenario_id === this.scenario.scenario.scenario_id ? this.scenario : this.options.resolveScenario?.(out.effect.scenario_id);
      if (!scenario) return { result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code: "INVALID", message: `unknown scenario ${out.effect.scenario_id}` }, events: [] };
      const started = startSession(scenario, this.varDir);
      this.scenario = scenario;
      this.log = started.log;
      this.state = started.state;
      this.accepted = new AcceptedCommands();
      const events = this.log.after(0);
      return { result: { ...okResult(command, events[0].seq) }, events };
    }
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

/** One 1-s step: sim time first (never logged), then tick (02 §D.14). */
function stepOnce(state: EngineState, scenario: LoadedScenario, next_seq: number): ReturnType<typeof tick> {
  const stepped: EngineState = { ...state, session: { ...state.session, clock: { ...state.session.clock, sim_time: addSeconds(state.session.clock.sim_time, SIM_STEP_S) } } };
  return tick(stepped, scenario, SIM_STEP_S, next_seq);
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
function startSession(scenario: LoadedScenario, varDir: string): { log: EventLog; state: EngineState } {
  const session_id = nextSessionId(varDir);
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
    if (Date.parse(e.sim_time) > Date.parse(state.session.clock.sim_time) && state.session.status === "RUNNING") {
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
      i++;
    }
  }
  state = { ...state, session: { ...state.session, log_hash: log.hash() } };
  return new Session(scenario, varDir, options, { log, state, accepted: AcceptedCommands.fromLog(log.after(0)) });
}
