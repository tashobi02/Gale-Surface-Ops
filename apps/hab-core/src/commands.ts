/**
 * Command validation and dispatch (docs/specs/02 §E.4 permissions, §E.6 results; 05 Command; FR-31).
 * Checks role (PERMISSIONS plus the "self" rules), simulated surface link (NO_LINK), args (INVALID)
 * and state (BUSY), in that order, then turns the command into LogEvents. Commands are never logged
 * themselves. TASK-23 (T23.01 tests, T23.02 implementation).
 *
 * Delegated (each stays in its owner's module, which checks its own args and state): SUMMON_VEHICLE
 * → engine/vehicles (T23.05), APPROVE_OPTION and ABORT → engine/contingencyOps (T23.07),
 * SEND_MESSAGE → engine/earth (TASK-26), TASK_ROVER → ./rover (FR-41, TASK-29), UPDATE_STOP_TASK and
 * ADD_STOP_TASK → engine/tasks (FR-50, T31.04; "own tasks" is checked there, 02 §E.4).
 * Rules where 02 is silent (proposed 2026-11-07, tests/commands.test.ts header): EVA "self" means
 * SUMMON_VEHICLE `args.crew` includes the issuer, and ACK_ALERT's alert has the issuer in `subjects`.
 *
 * Signature widened 2026-11-07 (T23.02; contract C14, owner of this file and of its only caller,
 * session.ts T22.12): the handler needs the scenario, the issuing client, the next seq and the
 * accepted-command memory (05 Command dedupe rule).
 */
import {
  PERMISSIONS,
  PROTOCOL_VERSION,
  type AlertLevel,
  type Command,
  type CommandRef,
  type CommandResult,
  type CrewId,
  type LogEvent,
  type LogEventData,
  type LogEventKind,
  type PlanExport,
  type RejectCode,
  type Role,
} from "@marswalk/protocol";
import { handleAbort, handleApproveOption } from "./engine/contingencyOps";
import { handleSendMessage } from "./engine/earth";
import type { CommandOutcome, EngineState, PendingEvent } from "./engine/reducer";
import { handleAddStopTask, handleUpdateStopTask } from "./engine/tasks";
import { handleSummon } from "./engine/vehicles";
import { handleTaskRover } from "./rover";
import { checkPlan, type LoadedScenario } from "./scenario";

export interface CommandContext {
  scenario: LoadedScenario;
  /** The connection that sent the command; with `command_id` it forms the `command_ref`. */
  client_id: string;
  /** The seq the log will give the first event of this command (for `event_seq` and `a-<seq>` ids). */
  next_seq: number;
  accepted: AcceptedCommands;
}

/** Work only the session manager can do (T22.12): replace the session, or run to the next event. */
export type SessionEffect = { kind: "load"; scenario_id: string } | { kind: "jump" };

export interface HandledCommand extends CommandOutcome {
  effect?: SessionEffect;
}

/** Accepted `(client_id, command_id)` → its first COMMAND_RESULT (05 Command, decided 2026-11-07). */
export class AcceptedCommands {
  private readonly results = new Map<string, CommandResult>();

  get(client_id: string, command_id: string): CommandResult | undefined {
    return this.results.get(key(client_id, command_id));
  }

  /** Remember an accepted result; rejected results are ignored, so the command may be retried. */
  record(client_id: string, command_id: string, result: CommandResult): void {
    const k = key(client_id, command_id);
    if (result.ok && !this.results.has(k)) this.results.set(k, result);
  }

  /** Rebuild from the log after a restart: every event with a `command_ref` except COMMAND_REJECTED. */
  static fromLog(events: readonly LogEvent[]): AcceptedCommands {
    const accepted = new AcceptedCommands();
    for (const e of events) {
      if (!e.command_ref || e.kind === "COMMAND_REJECTED") continue;
      const { client_id, command_id } = e.command_ref;
      // The first event of a command is its event_seq; record() keeps the first.
      accepted.record(client_id, command_id, { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id, ok: true, event_seq: e.seq });
    }
    return accepted;
  }
}

const key = (client_id: string, command_id: string): string => `${client_id}\u0000${command_id}`;

class Rejection extends Error {
  constructor(
    readonly code: RejectCode,
    message: string,
  ) {
    super(message);
  }
}

const reject = (code: RejectCode, message: string): never => {
  throw new Rejection(code, message);
};

type Status = EngineState["session"]["status"];
const DURING_EVA: readonly Status[] = ["RUNNING", "PAUSED"];
const SPEEDS = [1, 10, 60] as const;
const LEVELS: readonly AlertLevel[] = ["warning", "caution", "advisory"];
const KNOWN_KINDS: ReadonlySet<string> = new Set(Object.values(PERMISSIONS).flat());

/** The crew id of an EVA role, or null for every other role. */
function selfOf(role: Role): CrewId | null {
  return role === "eva:EV1" ? "EV1" : role === "eva:EV2" ? "EV2" : null;
}

export function handleCommand(state: EngineState, command: Command, ctx: CommandContext): HandledCommand {
  const ref: CommandRef = { client_id: ctx.client_id, command_id: command.command_id };
  const previous = ctx.accepted.get(ctx.client_id, command.command_id);
  if (previous) return { result: previous, events: [] };

  try {
    if (!KNOWN_KINDS.has(command.kind)) reject("INVALID", `unknown command kind ${String(command.kind)}`);
    checkRole(state, command);
    checkLink(state, command);
    const out = dispatch(state, command, ctx);
    const events = out.events.map((e) => ({ ...e, command_ref: ref }));
    let result = out.result;
    if (result.ok) {
      result = { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: events.length > 0 ? ctx.next_seq : result.event_seq };
      if (events.length > 0) ctx.accepted.record(ctx.client_id, command.command_id, result);
    } else if (events.length === 0) {
      return rejectedOutcome(state, command, ref, result.code, result.message);
    }
    return out.effect ? { result, events, effect: out.effect } : { result, events };
  } catch (err) {
    if (err instanceof Rejection) return rejectedOutcome(state, command, ref, err.code, err.message);
    throw err;
  }
}

function rejectedOutcome(state: EngineState, command: Command, ref: CommandRef, code: RejectCode, message: string): HandledCommand {
  const data: LogEventData["COMMAND_REJECTED"] = { code, message };
  return {
    result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code, message },
    events: [{ sim_time: state.session.clock.sim_time, kind: "COMMAND_REJECTED", actor: command.role, data, provenance: {}, command_ref: ref }],
  };
}

/** PERMISSIONS (02 §E.4) and the EVA "self" rules. */
function checkRole(state: EngineState, command: Command): void {
  const allowed = PERMISSIONS[command.role] as readonly string[] | undefined;
  if (!allowed || !allowed.includes(command.kind)) reject("FORBIDDEN_ROLE", `${command.role} may not send ${command.kind}`);
  const self = selfOf(command.role);
  if (!self) return;
  if (command.kind === "SUMMON_VEHICLE") {
    const crew = command.args.crew;
    if (Array.isArray(crew) && !crew.includes(self)) reject("FORBIDDEN_ROLE", `${command.role} may summon only for a crew that includes ${self}`);
  }
  if (command.kind === "ACK_ALERT") {
    const alert = state.alerts.find((a) => a.alert_id === command.args.alert_id);
    if (alert && !alert.subjects.includes(self)) reject("FORBIDDEN_ROLE", `${command.role} may acknowledge only alerts about ${self}`);
  }
}

/** NO_LINK: an EVA role's suit is unlinked on L-surf; the client keeps the command queued (02 §E.6). */
function checkLink(state: EngineState, command: Command): void {
  const self = selfOf(command.role);
  if (!self) return;
  const crew = state.crew.find((c) => c.crew_id === self);
  if (crew && !crew.linked) reject("NO_LINK", `${self} suit is unlinked; the command stays queued`);
}

function requireState(state: EngineState, allowed: readonly Status[], what: string): void {
  if (!allowed.includes(state.session.status)) reject("BUSY", `${what} is not possible while the session is ${state.session.status}`);
}

function ok(state: EngineState, command: Command, kind: LogEventKind, data: LogEventData[LogEventKind]): HandledCommand {
  const event: PendingEvent = { sim_time: state.session.clock.sim_time, kind, actor: command.role, data: data as Record<string, unknown>, provenance: {} };
  // event_seq is filled in by handleCommand from ctx.next_seq.
  return { result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: 0 }, events: [event] };
}

/** Args are checked before state in every case (role → link → args → state). */
function dispatch(state: EngineState, command: Command, ctx: CommandContext): HandledCommand {
  const a = command.args ?? {};
  switch (command.kind) {
    case "LOAD_SCENARIO": {
      if (typeof a.scenario_id !== "string" || a.scenario_id.length === 0) reject("INVALID", "LOAD_SCENARIO needs args.scenario_id");
      requireState(state, ["LOADED", "ENDED"], "Loading a scenario");
      return { result: okWithoutEvent(command), events: [], effect: { kind: "load", scenario_id: a.scenario_id as string } };
    }
    case "SET_CLOCK": {
      const hasSpeed = a.speed !== undefined;
      const hasPaused = a.paused !== undefined;
      if (!hasSpeed && !hasPaused) reject("INVALID", "SET_CLOCK needs args.speed or args.paused");
      if (hasSpeed && !SPEEDS.includes(a.speed as (typeof SPEEDS)[number])) reject("INVALID", "SET_CLOCK speed must be 1, 10 or 60 (05 Session)");
      if (hasPaused && typeof a.paused !== "boolean") reject("INVALID", "SET_CLOCK paused must be true or false");
      requireState(state, ["LOADED", "RUNNING", "PAUSED"], "Changing the clock");
      const clock = state.session.clock;
      return ok(state, command, "CLOCK_CHANGED", { speed: (hasSpeed ? a.speed : clock.speed) as (typeof SPEEDS)[number], paused: hasPaused ? (a.paused as boolean) : clock.paused });
    }
    case "JUMP_NEXT_EVENT":
      requireState(state, DURING_EVA, "Jumping to the next event");
      return { result: okWithoutEvent(command), events: [], effect: { kind: "jump" } };
    case "START_EVA":
      requireState(state, ["LOADED"], "Starting the EVA");
      return ok(state, command, "EVA_STARTED", { crew_ids: state.crew.map((c) => c.crew_id), plan_revision: state.session.plan_revision });
    case "PUBLISH_PLAN": {
      const plan = a.plan as Partial<PlanExport> | undefined;
      if (!plan || typeof plan !== "object") reject("INVALID", "PUBLISH_PLAN needs args.plan (a PlanExport)");
      try {
        checkPlan(plan, "PUBLISH_PLAN plan"); // schema and plan_hash, as at load (05 PlanExport)
      } catch (err) {
        reject("INVALID", err instanceof Error ? err.message : String(err));
      }
      if (plan!.data_version !== state.session.data_version) reject("INVALID", `plan data_version ${String(plan!.data_version)} is not the session's ${state.session.data_version}`);
      requireState(state, ["LOADED"], "Publishing a plan");
      // The new plan comes whole; its waypoints and legs are the route the map shows (decided 2026-11-07).
      const p = plan as PlanExport;
      return ok(state, command, "PLAN_REVISED", { plan_revision: state.session.plan_revision + 1, option_id: null, stops_dropped: [], waypoints: p.waypoints, legs: p.result.legs, plan: p });
    }
    case "ACK_ALERT": {
      if (typeof a.alert_id !== "string") reject("INVALID", "ACK_ALERT needs args.alert_id");
      const alert = state.alerts.find((x) => x.alert_id === a.alert_id);
      if (!alert) reject("INVALID", `no active alert ${String(a.alert_id)}`);
      if (alert!.acked_seq !== null) reject("INVALID", `alert ${alert!.alert_id} is already acknowledged`);
      return ok(state, command, "ALERT_ACKED", { alert_id: alert!.alert_id, acked_by: command.role });
    }
    case "INJECT_EVENT": {
      if (!LEVELS.includes(a.level as AlertLevel)) reject("INVALID", "INJECT_EVENT needs args.level: warning, caution or advisory");
      if (typeof a.message !== "string" || a.message.length === 0 || a.message.length > 60) reject("INVALID", "INJECT_EVENT message must be 1–60 characters (04 §D.2)");
      const subjects = a.subjects ?? [];
      if (!Array.isArray(subjects) || subjects.some((x) => typeof x !== "string")) reject("INVALID", "INJECT_EVENT subjects must be crew or vehicle ids");
      requireState(state, DURING_EVA, "Injecting an event");
      return ok(state, command, "ALERT_RAISED", { alert_id: `a-${ctx.next_seq}`, code: "INJECTED", level: a.level as AlertLevel, subjects: [...(subjects as string[])], message: a.message as string });
    }
    case "SUMMON_VEHICLE":
      if (!Array.isArray(a.crew) || a.crew.length === 0) reject("INVALID", "SUMMON_VEHICLE needs args.crew");
      requireState(state, DURING_EVA, "Summoning the vehicle");
      return handleSummon(state, ctx.scenario, command);
    case "APPROVE_OPTION":
      requireState(state, DURING_EVA, "Approving an option");
      return handleApproveOption(state, ctx.scenario, command);
    case "ABORT":
      requireState(state, DURING_EVA, "Aborting");
      return handleAbort(state, ctx.scenario, command);
    case "TASK_ROVER":
      requireState(state, DURING_EVA, "Tasking the rover");
      return handleTaskRover(state, command);
    case "SEND_MESSAGE":
      return handleSendMessage(state, ctx.scenario, command);
    case "UPDATE_STOP_TASK":
      requireState(state, DURING_EVA, "Updating a stop task");
      return handleUpdateStopTask(state, ctx.scenario, command);
    case "ADD_STOP_TASK":
      requireState(state, DURING_EVA, "Adding a stop task");
      return handleAddStopTask(state, ctx.scenario, command);
    default:
      return reject("INVALID", `unknown command kind ${String((command as Command).kind)}`);
  }
}

/** Accepted with no event of its own; the session manager fills `event_seq` after the effect (T22.12). */
function okWithoutEvent(command: Command): CommandResult {
  return { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: 0 };
}
