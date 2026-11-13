/**
 * Command validation and dispatch (docs/specs/02 §E.4 permissions, §E.6 results; 05 Command; FR-31).
 * Checks role (PERMISSIONS plus the "self" rules), simulated surface link (NO_LINK), args (INVALID)
 * and state (BUSY), in that order, then turns the command into LogEvents. Commands are never logged
 * themselves. TASK-23 (T23.01 tests, T23.02 implementation).
 *
 * Delegated (each stays in its owner's module, which checks its own args and state): SUMMON_VEHICLE
 * → engine/vehicles (T23.05), APPROVE_OPTION and ABORT → engine/contingencyOps (T23.07),
 * JUMP_NEXT_STOP → the session manager runs the ticks (effect "next_stop", engine/nextStop.ts, T32.10),
 * START_EVENT → engine/liveEvents (T32.12), SELECT_HAB_SITE and SET_MISSION_SETUP → engine/liveSetup (T32.14),
 * RESET_SESSION → the session manager (effect "reset"; any status, presenter only), SEND_MESSAGE → engine/earth (TASK-26), TASK_ROVER → ./rover (FR-41, TASK-29), UPDATE_STOP_TASK and
 * ADD_STOP_TASK → engine/tasks (FR-50, T31.04; "own tasks" and the undo rules are checked there, 02 §E.4, §E.6).
 * Every accepted PLAN_REVISED is followed by the TASK_DROPPED events of the stops it removed (`withTaskDrops`).
 * SET_CREW_MOTION (QoL Q2, Proposed 2026-11-13) is a simulation control, not a real EVA function: HOLD or RESUME one crew
 * member's walk. Its "self" rule: an EVA role names its own `crew_id`; ops may name either (decided 2026-11-13, docs/plan/qol/decisions.md).
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
  type StopTaskSeed,
} from "@marswalk/protocol";
import { handleAbort, handleApproveOption } from "./engine/contingencyOps";
import { handleSendMessage } from "./engine/earth";
import { startEvent } from "./engine/liveEvents";
import { selectHabSite, setMissionSetup, type SiteEffect } from "./engine/liveSetup";
import { nextStopTarget, warningLatched } from "./engine/nextStop";
import { isWaiting, logged, type CommandOutcome, type EngineState, type PendingEvent } from "./engine/reducer";
import { checkPublishedTasks, handleAddStopTask, handleUpdateStopTask, onPlanRevised, publishedTaskEvents, replacedTaskDrops } from "./engine/tasks";
import { handleSummon } from "./engine/vehicles";
import { handleTaskRover, taskRoverArgsError } from "./rover";
import { checkPlan, type LoadedScenario } from "./scenario";

export interface CommandContext {
  scenario: LoadedScenario;
  /** The connection that sent the command; with `command_id` it forms the `command_ref`. */
  client_id: string;
  /** The seq the log will give the first event of this command (for `event_seq` and `a-<seq>` ids). */
  next_seq: number;
  accepted: AcceptedCommands;
}

/**
 * Work only the session manager can do (T22.12): replace the session, run to the next event, run to the next stop, swap
 * the hab site after SITE_SELECTED is logged (T32.14), or reset (T32.14: the manager logs SESSION_RESET, which names the
 * next session id only it knows, then starts that session).
 */
export type SessionEffect = { kind: "load"; scenario_id: string } | { kind: "jump" } | { kind: "next_stop" } | { kind: "reset" } | SiteEffect;

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
    const events = out.result.ok ? withTaskDrops(state, out.events, ctx.next_seq, ref) : out.events.map((e) => ({ ...e, command_ref: ref }));
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

/**
 * Gives the command's events its `command_ref` and, after each PLAN_REVISED of an accepted command (APPROVE_OPTION,
 * ABORT, PUBLISH_PLAN), logs a TASK_DROPPED, actor `system`, for every open task at a stop the revision removed
 * (01 FR-50, T31.04). `onPlanRevised` reads the state BEFORE the revision, which is `state` here (the command has
 * not been reduced yet). Each drop is placed straight after its PLAN_REVISED, so the first event of the command,
 * and `event_seq`, are unchanged. A drop is a system event: its `command_ref` is null (05 LogEvent).
 */
function withTaskDrops(state: EngineState, events: PendingEvent[], first_seq: number, ref: CommandRef): PendingEvent[] {
  const out: PendingEvent[] = [];
  for (const e of events) {
    // A task seeded by the published plan is a system event, like the ones seeded at load (05 LogEvent): no command_ref.
    out.push({ ...e, command_ref: (e.kind === "TASK_ADDED" || e.kind === "TASK_DROPPED") && e.actor === "system" ? null : ref });
    if (e.kind === "PLAN_REVISED") out.push(...onPlanRevised(state, logged(e, first_seq + out.length - 1)).map((d) => ({ ...d, command_ref: null })));
  }
  return out;
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
  if (command.kind === "SET_CREW_MOTION" && typeof command.args?.crew_id === "string" && command.args.crew_id !== self) reject("FORBIDDEN_ROLE", `${command.role} may hold or resume only ${self}`);
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
    case "JUMP_NEXT_STOP":
      // 02 §D.17: INVALID with no EVA running or no stop left, BUSY while a warning-level alert is latched (U-63).
      if (!DURING_EVA.includes(state.session.status)) reject("INVALID", "JUMP_NEXT_STOP needs a running EVA");
      if (nextStopTarget(state) === null) reject("INVALID", "JUMP_NEXT_STOP: no stop is left in the plan");
      if (warningLatched(state)) reject("BUSY", "A warning-level alert is latched; clear it before jumping to the next stop (U-63)");
      return { result: okWithoutEvent(command), events: [], effect: { kind: "next_stop" } };
    case "START_EVENT":
      return startEvent(state, ctx.scenario, command); // args and state are checked there (T32.12, 02 §D.17)
    case "RESET_SESSION":
      // Allowed in every status (03 §E: Running, Paused and Ended all go back to Loaded); the session manager does the rest.
      return { result: okWithoutEvent(command), events: [], effect: { kind: "reset" } };
    case "SELECT_HAB_SITE":
      return selectHabSite(state, ctx.scenario, command); // args, then state, are checked there (T32.14, 02 §D.17)
    case "SET_MISSION_SETUP":
      return setMissionSetup(state, ctx.scenario, command); // args, then state, are checked there (T32.14, 02 §D.17, §E.3)
    case "START_EVA":
      requireState(state, ["LOADED"], "Starting the EVA");
      if (state.plan === null) reject("INVALID", "START_EVA needs a published plan; send PUBLISH_PLAN first (02 §D.17)");
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
      // The tasks come beside the plan (FR-54, BD-91): checked against it, before the state (args before state).
      const tasks = checkPublishedTasks(state, plan as PlanExport, a.stop_tasks);
      if ("error" in tasks) reject("INVALID", tasks.error);
      requireState(state, ["LOADED"], "Publishing a plan");
      // The new plan comes whole; its waypoints and legs are the route the map shows (decided 2026-11-07).
      const p = plan as PlanExport;
      const revised = ok(state, command, "PLAN_REVISED", { plan_revision: state.session.plan_revision + 1, option_id: null, stops_dropped: [], waypoints: p.waypoints, legs: p.result.legs, plan: p });
      // After the PLAN_REVISED (so `event_seq` is the plan's own): a TASK_DROPPED per draft the list no longer names (N-70), then one
      // TASK_ADDED per new or changed task, as the load path seeds them.
      const { seeds, drops } = tasks as { seeds: StopTaskSeed[]; drops: string[] };
      const sim_time = state.session.clock.sim_time;
      return { ...revised, events: [...revised.events, ...replacedTaskDrops(state, drops, state.session.plan_revision + 1, sim_time), ...publishedTaskEvents(seeds, sim_time)] };
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
    case "TASK_ROVER": {
      const bad = taskRoverArgsError(command.args);
      if (bad !== null) reject("INVALID", bad);
      requireState(state, DURING_EVA, "Tasking the rover");
      return handleTaskRover(state, ctx.scenario, command, ctx.next_seq); // vehicle, route and battery are checked there (BD-102)
    }
    case "SEND_MESSAGE":
      return handleSendMessage(state, ctx.scenario, command, ctx.next_seq); // args, then state, are checked there (T26.04, 02 §D.12)
    case "UPDATE_STOP_TASK":
      requireState(state, DURING_EVA, "Updating a stop task");
      return handleUpdateStopTask(state, ctx.scenario, command);
    case "ADD_STOP_TASK":
      requireState(state, DURING_EVA, "Adding a stop task");
      return handleAddStopTask(state, ctx.scenario, command);
    case "SET_CREW_MOTION": {
      const member = state.crew.find((x) => x.crew_id === a.crew_id);
      if (!member) reject("INVALID", "SET_CREW_MOTION needs args.crew_id of a crew member");
      if (a.motion !== "HOLD" && a.motion !== "RESUME") reject("INVALID", "SET_CREW_MOTION needs args.motion HOLD or RESUME");
      requireState(state, DURING_EVA, "Holding or resuming a crew member");
      const crew = member!;
      if (a.motion === "HOLD") {
        const offset_s = ctx.scenario.scenario.crew.find((x) => x.crew_id === crew.crew_id)?.start_offset_s ?? 0;
        if (crew.activity !== "WALKING" && crew.activity !== "AT_STOP") reject("INVALID", `${crew.crew_id} is ${crew.activity}: only a crew member walking or at a stop can hold`);
        if (isWaiting(crew, state.motion[crew.crew_id], offset_s)) reject("INVALID", `${crew.crew_id} has not left the hab yet`);
      } else if (crew.activity !== "HOLDING") {
        reject("INVALID", `${crew.crew_id} is ${crew.activity}, not HOLDING`);
      }
      return ok(state, command, "CREW_MOTION_SET", { crew_id: crew.crew_id, motion: a.motion as "HOLD" | "RESUME", actor: command.role });
    }
    default:
      return reject("INVALID", `unknown command kind ${String((command as Command).kind)}`);
  }
}

/** Accepted with no event of its own; the session manager fills `event_seq` after the effect (T22.12). */
function okWithoutEvent(command: Command): CommandResult {
  return { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: 0 };
}
