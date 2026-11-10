/**
 * Stop task engine (docs/specs/01 FR-50; 05 StopTask; 02 §E.6).
 * Owner T31.04 (TASK-31, Anjim Hossain). Pure; sim time only, never wall-clock (NFR-06).
 * EVA roles may update only their own tasks or crew_id null (02 §E.4 "own tasks").
 */
import {
  PROTOCOL_VERSION,
  type Command,
  type CrewId,
  type LogEvent,
  type LogEventData,
  type RejectCode,
  type StopTask,
  type StopTaskKind,
  type StopTaskReason,
  type StopTaskState,
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

/** TASK_ADDED events seeded from `scenario.stop_tasks` at session load. Called by session.ts (T22.12) after SESSION_LOADED. */
export function seedTasks(scenario: LoadedScenario): PendingEvent[] {
  const stopTasks = scenario.scenario.stop_tasks ?? [];
  return stopTasks.map((t) => {
    const data: LogEventData["TASK_ADDED"] = {
      task_id: t.task_id,
      stop_id: t.stop_id,
      crew_id: t.crew_id ?? null,
      kind: t.kind,
      text: t.text,
      origin: "plan",
    };
    return {
      sim_time: scenario.scenario.start_utc,
      kind: "TASK_ADDED",
      actor: "system",
      data: data as Record<string, unknown>,
      provenance: {
        "data.state": "simulated",
        "data.text": "assumed",
      },
    };
  });
}

/** UPDATE_STOP_TASK: "own tasks" check; log TASK_UPDATED. */
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

  if (task.state === "DROPPED") {
    return reject(command, "INVALID", `cannot update a DROPPED task: ${taskId}`);
  }

  // "own tasks" check (02 §E.4, FR-50)
  if (command.role === "eva:EV1" && task.crew_id === "EV2") {
    return reject(command, "FORBIDDEN_ROLE", "eva:EV1 may not update EV2 task");
  }
  if (command.role === "eva:EV2" && task.crew_id === "EV1") {
    return reject(command, "FORBIDDEN_ROLE", "eva:EV2 may not update EV1 task");
  }

  const nextState = a.state as StopTaskState;
  if (!["TODO", "DONE", "SKIPPED"].includes(nextState)) {
    return reject(command, "INVALID", `invalid stop task state: ${String(nextState)}`);
  }

  const validReasons: readonly StopTaskReason[] = ["time", "terrain", "alert", "other"];
  if (nextState === "SKIPPED") {
    if (!a.reason || !validReasons.includes(a.reason as StopTaskReason)) {
      return reject(command, "INVALID", "SKIPPED requires reason: time | terrain | alert | other");
    }
  }

  const reason = nextState === "SKIPPED" ? (a.reason as StopTaskReason) : null;

  const data: LogEventData["TASK_UPDATED"] = {
    task_id: task.task_id,
    stop_id: task.stop_id,
    crew_id: task.crew_id,
    state: nextState,
    reason,
  };

  const event: PendingEvent = {
    sim_time: state.session.clock.sim_time,
    kind: "TASK_UPDATED",
    actor: command.role,
    data: data as Record<string, unknown>,
    provenance: {},
  };

  return accepted(command, [event]);
}

/** ADD_STOP_TASK (ops): log TASK_ADDED with origin `ops`. */
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

  const text = a.text;
  if (typeof text !== "string" || text.trim().length === 0 || text.length > 60) {
    return reject(command, "INVALID", "ADD_STOP_TASK text must be 1-60 characters");
  }

  const waypoints = state.plan?.waypoints ?? [];
  const stopWaypoints = waypoints.filter((w) => w.role === "stop");
  const targetWp = stopWaypoints.find((w) => w.id === stopId);
  if (!targetWp) {
    return reject(command, "INVALID", `unknown stop_id: ${stopId}`);
  }

  // Current or next stop check (01 FR-50)
  const targetCrewId = (a.crew_id as CrewId) ?? null;
  const crewList = targetCrewId
    ? state.crew.filter((c) => c.crew_id === targetCrewId)
    : state.crew;

  const validStopIds = new Set<string>();
  for (const c of crewList) {
    if (c.activity === "AT_STOP" && c.stop_index !== null) {
      const curWp = waypoints[c.stop_index];
      if (curWp && curWp.role === "stop") validStopIds.add(curWp.id);
      const nextWp = waypoints[c.stop_index + 1];
      if (nextWp && nextWp.role === "stop") validStopIds.add(nextWp.id);
    } else {
      const m = state.motion[c.crew_id];
      if (m) {
        const legs = state.plan?.result.legs ?? [];
        const leg = legs[m.leg_index];
        if (leg) {
          const toWp = waypoints.find((w) => w.id === leg.to);
          if (toWp && toWp.role === "stop") {
            validStopIds.add(toWp.id);
            const toIdx = waypoints.indexOf(toWp);
            const afterWp = waypoints[toIdx + 1];
            if (afterWp && afterWp.role === "stop") validStopIds.add(afterWp.id);
          }
        }
      }
      if (c.stop_index !== null) {
        const nextWp = waypoints[c.stop_index + 1];
        if (nextWp && nextWp.role === "stop") validStopIds.add(nextWp.id);
      } else {
        const firstStop = stopWaypoints[0];
        if (firstStop) validStopIds.add(firstStop.id);
        const secondStop = stopWaypoints[1];
        if (secondStop) validStopIds.add(secondStop.id);
      }
    }
  }

  if (!validStopIds.has(stopId)) {
    return reject(command, "INVALID", `stop ${stopId} is not the current or next stop`);
  }

  const taskId = (a.task_id as string) || `t-ops-${state.session.last_seq + 1}`;
  const kind = (a.kind as StopTaskKind) || "other";

  const data: LogEventData["TASK_ADDED"] = {
    task_id: taskId,
    stop_id: stopId,
    crew_id: targetCrewId,
    kind,
    text,
    origin: "ops",
  };

  const event: PendingEvent = {
    sim_time: state.session.clock.sim_time,
    kind: "TASK_ADDED",
    actor: "ops",
    data: data as Record<string, unknown>,
    provenance: {
      "data.state": "simulated",
      "data.text": "assumed",
    },
  };

  return accepted(command, [event]);
}

/** After PLAN_REVISED: TASK_DROPPED (actor `system`) for open tasks at dropped stops. Called by session.ts (T22.12) after it appends a PLAN_REVISED. */
export function onPlanRevised(state: EngineState, revised: LogEvent): PendingEvent[] {
  const d = revised.data as unknown as LogEventData["PLAN_REVISED"];
  const droppedStops = new Set<string>();

  const oldWaypoints = state.plan?.waypoints ?? [];
  const revisedWpIds = new Set(d.waypoints.map((w) => w.id));

  for (const w of oldWaypoints) {
    if (w.role === "stop" && !revisedWpIds.has(w.id)) {
      droppedStops.add(w.id);
    }
  }

  if (Array.isArray(d.stops_dropped)) {
    for (const idx of d.stops_dropped) {
      const w = oldWaypoints[idx];
      if (w) droppedStops.add(w.id);
    }
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
        provenance: {},
      });
    }
  }

  return events;
}

/** At the end of each dwell the simulated crew member's open tasks become DONE. */
export function tasksTick(state: EngineState, ctx: TickContext): TickResult {
  const events: PendingEvent[] = [];
  let current = state;

  const simulatedCrewIds: CrewId[] = ["EV2"];

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
          provenance: {},
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
