/**
 * Stop task engine (docs/specs/01 FR-50; 05 StopTask; 02 §E.6).
 * Owner T31.04 (TASK-31, Anjim Hossain). Pure; sim time only, never wall-clock (NFR-06).
 * EVA roles may update only their own tasks or crew_id null (02 §E.4 "own tasks").
 */
import {
  PROTOCOL_VERSION,
  type Command,
  type Crew,
  type CrewId,
  type LogEvent,
  type LogEventData,
  type PlanExport,
  type RejectCode,
  type StopTask,
  type StopTaskKind,
  type StopTaskReason,
  type StopTaskSeed,
  type Waypoint,
} from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import {
  logged,
  type CommandOutcome,
  type EngineState,
  type PendingEvent,
} from "./reducer";
import type { TickContext, TickResult } from "./tick";

function reject(command: Command, code: RejectCode, message: string): CommandOutcome {
  return {
    result: {
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: command.command_id,
      ok: false,
      code,
      message,
    },
    events: [],
  };
}

function accepted(command: Command, events: PendingEvent[]): CommandOutcome {
  return {
    result: {
      v: PROTOCOL_VERSION,
      type: "COMMAND_RESULT",
      command_id: command.command_id,
      ok: true,
      event_seq: 0,
    },
    events,
  };
}

/** A task's text is team-authored content (05 StopTask); the key names the `text` field of TASK_ADDED's data. */
const TEXT_PROVENANCE = { "data.text": "assumed" } as const;

/** The most tasks per selected crew at a stop (FR-50; FD-031, BD-163 supersedes BD-109). */
export const MAX_TASKS_PER_STOP = 4;
/** The longest task text (05 StopTask). */
export const MAX_TASK_TEXT = 60;

/** A shared task occupies a slot for each crew member (N-32, FD-031). Dropped tasks are filtered by the caller. */
function taskLimit(tasks: readonly Pick<StopTask, "stop_id" | "crew_id">[], stop_id: string, crew_id: CrewId | null): string | null {
  for (const crew of crew_id === null ? CREW_IDS : [crew_id]) {
    const count = tasks.filter(t => t.stop_id === stop_id && (t.crew_id === null || t.crew_id === crew)).length;
    if (count >= MAX_TASKS_PER_STOP) return `${crew} at stop ${stop_id} already has ${MAX_TASKS_PER_STOP} tasks (FR-50, FD-031)`;
  }
  return null;
}

/** The TASK_ADDED a seed becomes, authored by the plan: actor `system`, origin `plan`, text labelled `assumed`. */
function seedEvent(t: StopTaskSeed, sim_time: string): PendingEvent {
  const data: LogEventData["TASK_ADDED"] = {
    task_id: t.task_id,
    stop_id: t.stop_id,
    crew_id: t.crew_id ?? null,
    kind: t.kind,
    text: t.text,
    origin: "plan",
  };
  return { sim_time, kind: "TASK_ADDED", actor: "system", data: data as Record<string, unknown>, provenance: { ...TEXT_PROVENANCE } };
}

/** TASK_ADDED events seeded from `scenario.stop_tasks` at session load. Called by session.ts (T22.12) after SESSION_LOADED. */
export function seedTasks(scenario: LoadedScenario): PendingEvent[] {
  return (scenario.scenario.stop_tasks ?? []).map((t) => seedEvent(t, scenario.scenario.start_utc));
}

/**
 * The tasks of `PUBLISH_PLAN {plan, stop_tasks?}` (01 FR-54, FR-50; BD-91, BD-120, BD-155): `raw` is checked against the plan
 * being published, with the rules the loader applies to scenario `stop_tasks` plus those of ADD_STOP_TASK. Returns what the
 * command logs after PLAN_REVISED, or the reason it is `INVALID`. A stop with no entry has no task, so the FR-50 "1–4" is
 * "at most 4 per selected crew" here, counting shared tasks for both and tasks ops added by hand (BD-163).
 *
 * A published list is the planner's whole set of drafts (N-70, BD-155): the session's tasks of origin `plan` are replaced by it.
 * `seeds` are the entries to add: new ones, and ones whose stop, crew, kind or text differ from the task of that id (the reducer
 * puts the new task in place of the old). An entry equal to its task is kept, with no event, so a repeated publish adds nothing.
 * `drops` are the ids of open `plan` tasks at a stop that is still in the plan and that the list no longer names; the tasks at a
 * removed stop are dropped by `onPlanRevised`, not here. An id that names a task of another origin is `INVALID`: a planner
 * replaces its own drafts only. `state` is the state before the command; with no `stop_tasks` nothing changes.
 */
export function checkPublishedTasks(state: EngineState, plan: PlanExport, raw: unknown): { seeds: StopTaskSeed[]; drops: string[] } | { error: string } {
  if (raw === undefined) return { seeds: [], drops: [] };
  if (!Array.isArray(raw)) return { error: "PUBLISH_PLAN stop_tasks must be an array of tasks" };
  const stops = new Set(plan.waypoints.filter((w) => w.role === "stop").map((w) => w.id));
  const byId = new Map(state.tasks.map((t) => [t.task_id, t]));
  const ids = new Set<string>();
  const draftsPerStop = new Map<string, number>();
  // Ops tasks remain and count per crew; the planner's drafts are replaced by the whole list (N-70).
  const retained = state.tasks.filter(t => t.state !== "DROPPED" && t.origin !== "plan");
  const entries: StopTaskSeed[] = [];
  for (const [i, entry] of raw.entries()) {
    const at = `PUBLISH_PLAN stop_tasks[${i}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return { error: `${at} must be an object` };
    const t = entry as Record<string, unknown>;
    if (typeof t.task_id !== "string" || t.task_id.length === 0) return { error: `${at} needs a task_id` };
    // "/" would break the STATE_DELTA path of the task ("tasks/<task_id>/state").
    if (t.task_id.includes("/")) return { error: `${at} task_id may not contain /` };
    if (ids.has(t.task_id)) return { error: `${at} task_id ${t.task_id} appears twice` };
    const existing = byId.get(t.task_id);
    if (existing !== undefined && existing.origin !== "plan") return { error: `${at} task_id ${t.task_id} is a task that ${existing.origin} added; a published list replaces only the plan's own tasks` };
    ids.add(t.task_id);
    if (typeof t.stop_id !== "string" || !stops.has(t.stop_id)) return { error: `${at} stop_id ${String(t.stop_id)} is not a stop Waypoint of the plan (U-61)` };
    if (typeof t.text !== "string" || t.text.trim().length === 0 || t.text.length > MAX_TASK_TEXT) return { error: `${at} text must be 1-${MAX_TASK_TEXT} characters` };
    if (!KINDS.includes(t.kind as StopTaskKind)) return { error: `${at} kind must be one of ${KINDS.join(", ")}` };
    const crew_id = t.crew_id ?? null;
    if (crew_id !== null && !CREW_IDS.includes(crew_id as CrewId)) return { error: `${at} crew_id must be EV1, EV2 or null` };
    // FR-54 keeps the authored list to four drafts per stop; the runtime total is per crew (FD-031).
    const drafts = (draftsPerStop.get(t.stop_id) ?? 0) + 1;
    if (drafts > MAX_TASKS_PER_STOP) return { error: `stop ${t.stop_id} has more than ${MAX_TASKS_PER_STOP} planner drafts (FR-54)` };
    draftsPerStop.set(t.stop_id, drafts);
    const limit = taskLimit([...retained, ...entries], t.stop_id, crew_id as CrewId | null);
    if (limit !== null) return { error: limit };
    entries.push({ task_id: t.task_id, stop_id: t.stop_id, crew_id: crew_id as CrewId | null, kind: t.kind as StopTaskKind, text: t.text });
  }
  const same = (e: StopTaskSeed): boolean => {
    const old = byId.get(e.task_id);
    return old !== undefined && old.state !== "DROPPED" && old.stop_id === e.stop_id && old.crew_id === e.crew_id && old.kind === e.kind && old.text === e.text;
  };
  const drops = state.tasks.filter((t) => t.origin === "plan" && t.state === "TODO" && stops.has(t.stop_id) && !ids.has(t.task_id)).map((t) => t.task_id);
  return { seeds: entries.filter((e) => !same(e)), drops };
}

/** One TASK_ADDED per published task, in list order, at `sim_time`; the same events as `seedTasks` gives at load. */
export function publishedTaskEvents(seeds: readonly StopTaskSeed[], sim_time: string): PendingEvent[] {
  return seeds.map((t) => seedEvent(t, sim_time));
}

/** One TASK_DROPPED (actor `system`) per draft a published list no longer names, for the revision `plan_revision`. */
export function replacedTaskDrops(state: EngineState, ids: readonly string[], plan_revision: number, sim_time: string): PendingEvent[] {
  return ids.map((task_id) => {
    const task = state.tasks.find((t) => t.task_id === task_id)!;
    const data: LogEventData["TASK_DROPPED"] = { task_id, stop_id: task.stop_id, plan_revision };
    return { sim_time, kind: "TASK_DROPPED" as const, actor: "system" as const, data: data as Record<string, unknown>, provenance: { "data.plan_revision": "simulated" } };
  });
}

const REASONS: readonly StopTaskReason[] = ["time", "terrain", "alert", "other"];
const KINDS: readonly StopTaskKind[] = ["observe", "image", "sample", "measure", "deploy", "other"];
const CREW_IDS: readonly CrewId[] = ["EV1", "EV2"];

/** Provenance of a task event: its `state` field is simulated (05 StopTask); keys name fields of the event's `data`. */
const STATE_PROVENANCE = { "data.state": "simulated" } as const;

/** The stop waypoints of a plan in order; stop number n (1-based, as `Crew.stop_index` and `stops_dropped`) is `stops[n - 1]`. */
const stopsOf = (state: EngineState): Waypoint[] => (state.plan?.waypoints ?? []).filter((w) => w.role === "stop");

/**
 * UPDATE_STOP_TASK `{task_id, state, reason?, undo?}` (01 FR-50; 02 §E.6 "Stop-task undo"; 05 args table).
 * Checks run in this order: unknown task (INVALID); "own tasks" (FORBIDDEN_ROLE); for `undo: true` the sender
 * must be the actor of the task's last change, never `system` (FORBIDDEN_ROLE); then everything else is INVALID.
 * NO_LINK comes first, in commands.ts. Transitions: DONE and SKIPPED only from TODO; TODO only with
 * `undo: true`, from DONE or SKIPPED, while no PLAN_REVISED has been logged since the change and its stop is
 * still in the plan. SKIPPED -> SKIPPED with a different reason is a reason revision (N-29, BD-153): the same actor rule
 * and the same staleness rule as an undo. The 5-s window is the tablet's; nothing here reads a clock (NFR-06).
 */
export function handleUpdateStopTask(
  state: EngineState,
  _scenario: LoadedScenario,
  command: Command,
): CommandOutcome {
  const a = command.args ?? {};
  const taskId = a.task_id;
  if (typeof taskId !== "string" || !taskId) {
    return reject(command, "INVALID", "UPDATE_STOP_TASK needs args.task_id");
  }

  const task = state.tasks.find((t) => t.task_id === taskId);
  if (!task) {
    return reject(command, "INVALID", `unknown task_id: ${taskId}`);
  }

  // "own tasks" check (02 §E.4, FR-50)
  if (command.role === "eva:EV1" && task.crew_id === "EV2") {
    return reject(command, "FORBIDDEN_ROLE", "eva:EV1 may not update EV2 task");
  }
  if (command.role === "eva:EV2" && task.crew_id === "EV1") {
    return reject(command, "FORBIDDEN_ROLE", "eva:EV2 may not update EV1 task");
  }

  // Undo: only the role that made the last change may reverse it, and a `system` change cannot be reversed.
  // A task with no such change (never updated, or dropped) is not a role question: it falls through to INVALID.
  const lastActor = state.task_actor?.[taskId];
  if (a.undo === true && (task.state === "DONE" || task.state === "SKIPPED") && lastActor !== undefined && (lastActor === "system" || lastActor !== command.role)) {
    return reject(command, "FORBIDDEN_ROLE", `${command.role} is not the actor of the last change to ${taskId} (${lastActor}); only that role may undo it`);
  }
  // Revising the reason of a SKIPPED task (N-29, BD-153) is judged like an undo: only the actor of the SKIP may do it.
  const revising = a.undo !== true && a.state === "SKIPPED" && task.state === "SKIPPED";
  if (revising && lastActor !== undefined && (lastActor === "system" || lastActor !== command.role)) {
    return reject(command, "FORBIDDEN_ROLE", `${command.role} is not the actor of the last change to ${taskId} (${lastActor}); only that role may revise its reason`);
  }
  if (a.undo !== undefined && typeof a.undo !== "boolean") {
    return reject(command, "INVALID", "UPDATE_STOP_TASK args.undo must be true or false");
  }
  const undo = a.undo === true;

  const target = a.state;
  if (target !== "TODO" && target !== "DONE" && target !== "SKIPPED") {
    return reject(command, "INVALID", `invalid stop task state: ${String(target)}`);
  }

  if (undo) {
    if (target !== "TODO") return reject(command, "INVALID", `undo: true needs state TODO, not ${target}`);
    if (task.state !== "DONE" && task.state !== "SKIPPED") {
      return reject(command, "INVALID", `only a DONE or SKIPPED task can be undone; ${taskId} is ${task.state}`);
    }
    // Stale: a plan revision since the change, or the stop is no longer in the plan (a dropped stop's task is never revived).
    if (state.task_plan_rev?.[taskId] !== state.session.plan_revision) {
      return reject(command, "INVALID", `the plan was revised since the last change to ${taskId}; it cannot be undone`);
    }
    if (!stopsOf(state).some((w) => w.id === task.stop_id)) {
      return reject(command, "INVALID", `stop ${task.stop_id} is no longer in the plan; ${taskId} cannot be undone`);
    }
  } else if (revising) {
    // SKIPPED -> SKIPPED with another reason, while the SKIP is still the last change and its plan revision is current
    // (the same staleness rule as an undo, so no clock is read, NFR-06). The log keeps every reason, so the audit is whole.
    if (lastActor === undefined) return reject(command, "INVALID", `${taskId} has no recorded change to revise`);
    if (typeof a.reason !== "string" || !REASONS.includes(a.reason as StopTaskReason)) {
      return reject(command, "INVALID", "SKIPPED requires reason: time | terrain | alert | other");
    }
    if (a.reason === task.reason) return reject(command, "INVALID", `${taskId} is already skipped for ${task.reason}`);
    if (state.task_plan_rev?.[taskId] !== state.session.plan_revision) {
      return reject(command, "INVALID", `the plan was revised since the last change to ${taskId}; its reason is final`);
    }
    if (!stopsOf(state).some((w) => w.id === task.stop_id)) {
      return reject(command, "INVALID", `stop ${task.stop_id} is no longer in the plan; the reason of ${taskId} is final`);
    }
  } else {
    if (target === "TODO") return reject(command, "INVALID", "state TODO needs undo: true");
    if (task.state !== "TODO") return reject(command, "INVALID", `${taskId} is ${task.state}; ${target} is allowed only from TODO`);
    if (target === "SKIPPED" && (typeof a.reason !== "string" || !REASONS.includes(a.reason as StopTaskReason))) {
      return reject(command, "INVALID", "SKIPPED requires reason: time | terrain | alert | other");
    }
  }

  const data: LogEventData["TASK_UPDATED"] = {
    task_id: task.task_id,
    stop_id: task.stop_id,
    crew_id: task.crew_id,
    state: target,
    reason: target === "SKIPPED" ? (a.reason as StopTaskReason) : null,
    ...(undo ? { undo: true } : {}),
  };

  const event: PendingEvent = {
    sim_time: state.session.clock.sim_time,
    kind: "TASK_UPDATED",
    actor: command.role,
    data: data as Record<string, unknown>,
    provenance: { ...STATE_PROVENANCE },
  };

  return accepted(command, [event]);
}

/**
 * The stop ids that are the current or next stop of any of `crew`: at a stop (stop number n, 1-based) that
 * stop and the next; walking, the next one (`stop_index` is the last stop visited, null = none yet). A crew
 * member who is sheltered, in the hab or heading for a haven has none.
 */
function currentOrNextStops(state: EngineState, crew: readonly Crew[]): Set<string> {
  const stops = stopsOf(state);
  const ids = new Set<string>();
  for (const c of crew) {
    if (c.activity === "AT_STOP" && c.stop_index !== null) {
      for (const w of [stops[c.stop_index - 1], stops[c.stop_index]]) if (w) ids.add(w.id);
    } else if (c.activity === "WALKING") {
      const next = stops[c.stop_index ?? 0];
      if (next) ids.add(next.id);
    }
  }
  return ids;
}

/**
 * ADD_STOP_TASK `{stop_id, text, crew_id?, kind?}` (ops): log TASK_ADDED with origin `ops`. The Hab Core
 * assigns `task_id` (`t-ops-<seq>`) and never overwrites an existing task; an id the client sends is ignored.
 */
export function handleAddStopTask(
  state: EngineState,
  _scenario: LoadedScenario,
  command: Command,
): CommandOutcome {
  if (command.role !== "ops") {
    return reject(command, "FORBIDDEN_ROLE", `${command.role} may not send ADD_STOP_TASK`);
  }

  const a = command.args ?? {};
  const stopId = a.stop_id;
  if (typeof stopId !== "string" || !stopId) {
    return reject(command, "INVALID", "ADD_STOP_TASK needs args.stop_id");
  }
  // "/" would break the STATE_DELTA path of the task ("tasks/<task_id>/state").
  if (stopId.includes("/")) return reject(command, "INVALID", "ADD_STOP_TASK stop_id may not contain /");
  if (a.task_id !== undefined && (typeof a.task_id !== "string" || a.task_id.includes("/"))) {
    return reject(command, "INVALID", "ADD_STOP_TASK task_id is assigned by the Hab Core and may not contain /");
  }

  const text = a.text;
  if (typeof text !== "string" || text.trim().length === 0 || text.length > 60) {
    return reject(command, "INVALID", "ADD_STOP_TASK text must be 1-60 characters");
  }

  const kind = a.kind === undefined ? "other" : a.kind;
  if (!KINDS.includes(kind as StopTaskKind)) {
    return reject(command, "INVALID", `ADD_STOP_TASK kind must be one of ${KINDS.join(", ")}`);
  }

  const rawCrew = a.crew_id ?? null;
  if (rawCrew !== null && !CREW_IDS.includes(rawCrew as CrewId)) {
    return reject(command, "INVALID", "ADD_STOP_TASK crew_id must be EV1, EV2 or null");
  }
  const crewId = rawCrew as CrewId | null;
  if (crewId !== null && !state.crew.some((c) => c.crew_id === crewId)) {
    return reject(command, "INVALID", `ADD_STOP_TASK crew_id ${crewId} is not in this session`);
  }

  if (!stopsOf(state).some((w) => w.id === stopId)) {
    return reject(command, "INVALID", `unknown stop_id: ${stopId}`);
  }

  // Current or next stop of the crew member (either one when crew_id is null), 01 FR-50.
  const valid = currentOrNextStops(state, crewId ? state.crew.filter((c) => c.crew_id === crewId) : state.crew);
  if (!valid.has(stopId)) {
    return reject(command, "INVALID", `stop ${stopId} is not the current or next stop`);
  }

  // N-32 / FD-031: per selected crew; a shared task counts for both, a dropped task occupies no slot.
  const limit = taskLimit(state.tasks.filter(t => t.state !== "DROPPED"), stopId, crewId);
  if (limit !== null) return reject(command, "INVALID", limit);

  const base = `t-ops-${state.session.last_seq + 1}`;
  let taskId = base;
  for (let k = 2; state.tasks.some((t) => t.task_id === taskId); k++) taskId = `${base}-${k}`;

  const data: LogEventData["TASK_ADDED"] = {
    task_id: taskId,
    stop_id: stopId,
    crew_id: crewId,
    kind: kind as StopTaskKind,
    text,
    origin: "ops",
  };

  const event: PendingEvent = {
    sim_time: state.session.clock.sim_time,
    kind: "TASK_ADDED",
    actor: "ops",
    data: data as Record<string, unknown>,
    provenance: { ...TEXT_PROVENANCE },
  };

  return accepted(command, [event]);
}

/**
 * After PLAN_REVISED: TASK_DROPPED (actor `system`) for open tasks at dropped stops. `state` must be the
 * state BEFORE the revision (commands.ts passes it): the stops a revision removes are the old plan's stops
 * that the revised waypoints lack, plus `stops_dropped`, which are 1-based stop numbers (05 PLAN_REVISED;
 * the same numbering as `Crew.stop_index`), i.e. the n-th stop waypoint, not `waypoints[n]`.
 */
export function onPlanRevised(state: EngineState, revised: LogEvent): PendingEvent[] {
  const d = revised.data as unknown as LogEventData["PLAN_REVISED"];
  const oldStops = stopsOf(state);
  const droppedStops = new Set<string>();

  if (Array.isArray(d.waypoints)) {
    const kept = new Set(d.waypoints.filter((w) => w.role === "stop").map((w) => w.id));
    for (const w of oldStops) if (!kept.has(w.id)) droppedStops.add(w.id);
  }
  for (const no of Array.isArray(d.stops_dropped) ? d.stops_dropped : []) {
    const w = Number.isInteger(no) && no >= 1 ? oldStops[no - 1] : undefined;
    if (w) droppedStops.add(w.id);
  }

  const events: PendingEvent[] = [];
  for (const task of state.tasks) {
    if (task.state === "TODO" && droppedStops.has(task.stop_id)) {
      const data: LogEventData["TASK_DROPPED"] = {
        task_id: task.task_id,
        stop_id: task.stop_id,
        plan_revision: d.plan_revision,
      };
      events.push({
        sim_time: revised.sim_time,
        kind: "TASK_DROPPED",
        actor: "system",
        data: data as Record<string, unknown>,
        provenance: { "data.plan_revision": "simulated" },
      });
    }
  }

  return events;
}

/**
 * The crew member the simulation completes tasks for (01 FR-50 "for example EV2 in the demo"; BD-73): a one-crew scenario
 * has no simulated completions. Chosen by this constant, never by who is connected (NFR-06).
 */
export const SIMULATED_CREW_ID: CrewId = "EV2";

/**
 * At the end of each dwell the simulated crew member's open tasks at that stop become DONE: its own and the either-tasks
 * (`crew_id: null`). A task assigned to the other crew member is never completed here (BD-109).
 */
export function tasksTick(state: EngineState, ctx: TickContext): TickResult {
  const events: PendingEvent[] = [];
  let current = state;

  const simulatedCrewIds: CrewId[] = [SIMULATED_CREW_ID];

  for (const crewId of simulatedCrewIds) {
    const c = current.crew.find((cr) => cr.crew_id === crewId);
    const m = current.motion[crewId];
    if (!c || !m) continue;

    if (m.phase === "walk" && m.last_wp_id) {
      const openTasks = current.tasks.filter(
        (t) =>
          t.stop_id === m.last_wp_id &&
          t.state === "TODO" &&
          (t.crew_id === crewId || t.crew_id === null),
      );

      for (const task of openTasks) {
        const updateData: LogEventData["TASK_UPDATED"] = {
          task_id: task.task_id,
          stop_id: task.stop_id,
          crew_id: task.crew_id,
          state: "DONE",
          reason: null,
        };
        const event: PendingEvent = {
          sim_time: current.session.clock.sim_time,
          kind: "TASK_UPDATED",
          actor: "system",
          data: updateData as Record<string, unknown>,
          provenance: { ...STATE_PROVENANCE },
        };
        events.push(event);
        current = reduceTaskEvent(current, logged(event, ctx.next_seq + events.length - 1));
      }
    }
  }

  return {
    state: current,
    events,
    deltas: [],
  };
}

/** Reducer case for TASK_ADDED / TASK_UPDATED / TASK_DROPPED; called by reduce (T22.06). */
export function reduceTaskEvent(state: EngineState, event: LogEvent): EngineState {
  switch (event.kind) {
    case "TASK_ADDED": {
      const d = event.data as unknown as LogEventData["TASK_ADDED"];
      const task: StopTask = {
        task_id: d.task_id,
        stop_id: d.stop_id,
        crew_id: d.crew_id ?? null,
        kind: d.kind,
        text: d.text,
        state: "TODO",
        reason: null,
        origin: d.origin ?? "plan",
        updated_sim_time: event.sim_time,
        updated_by: event.actor,
        provenance: { state: "simulated", text: "assumed" },
      };
      return {
        ...state,
        tasks: [...state.tasks.filter((t) => t.task_id !== task.task_id), task],
      };
    }
    case "TASK_UPDATED": {
      const d = event.data as unknown as LogEventData["TASK_UPDATED"];
      return {
        ...state,
        // The plan revision of this change, for the staleness rule of an undo (reducer.ts `task_plan_rev`; #202).
        task_plan_rev: { ...state.task_plan_rev, [d.task_id]: state.session.plan_revision },
        task_actor: { ...state.task_actor, [d.task_id]: event.actor },
        tasks: state.tasks.map((t) =>
          t.task_id === d.task_id
            ? {
                ...t,
                state: d.state,
                reason: d.reason ?? null,
                updated_sim_time: event.sim_time,
                updated_by: event.actor,
              }
            : t,
        ),
      };
    }
    case "TASK_DROPPED": {
      const d = event.data as unknown as LogEventData["TASK_DROPPED"];
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.task_id === d.task_id
            ? {
                ...t,
                state: "DROPPED",
                updated_sim_time: event.sim_time,
                updated_by: event.actor,
              }
            : t,
        ),
      };
    }
    default:
      return state;
  }
}
