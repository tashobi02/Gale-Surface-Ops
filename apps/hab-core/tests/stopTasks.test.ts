import { describe, it } from "vitest";

// Stop task list (FR-50): commands, events and engine behaviour. TASK-31 (T31.03).

// docs/specs/01 FR-50; 02 §E.4, §E.6; 05 StopTask. TASK-31.
describe("UPDATE_STOP_TASK", () => {
  // 02 names no code for "right role, wrong crew member"; FORBIDDEN_ROLE chosen 2026-11-06.
  it.todo("eva:EV1 updating a task with crew_id EV2 gets FORBIDDEN_ROLE");
  it.todo("either EVA role may update a task with crew_id null");
  it.todo("ops may update any crew member's task");
  it.todo("planner and earth get FORBIDDEN_ROLE");
  it.todo("an unknown task_id is INVALID");
  it.todo("SKIPPED without a reason (time, terrain, alert, other) is INVALID");
  it.todo("a DROPPED task cannot be updated (INVALID)");
  it.todo("an unlinked suit gets NO_LINK and the client keeps the command queued");
  it.todo("a valid update emits TASK_UPDATED with {task_id, stop_id, crew_id, state, reason} and the issuing role as actor");
  // TODO(decision): FR-50's 5-s undo — a TODO target state from the client, or client-side only.
  it.todo("undo within 5 s returns a DONE or SKIPPED task to TODO");
});

describe("ADD_STOP_TASK", () => {
  it.todo("eva:EV1, eva:EV2, planner and earth get FORBIDDEN_ROLE");
  it.todo("ops adding to the crew member's current or next stop emits TASK_ADDED with origin ops");
  it.todo("a stop other than the current or next one is INVALID");
  // TODO(decision): U-52 — the 1–4 limit per stop or per crew member at a stop (the prototype counts per crew).
  it.todo("a fifth task on a stop is INVALID (1–4 per stop)");
  it.todo("empty text or text over 60 characters is INVALID");
  // TODO(decision): U-46 proposes "ops adds tasks only when no warning is latched"; reject code not chosen.
  it.todo("adding while a warning is latched is rejected");
});

// docs/specs/01 FR-50 (acceptance criteria); 05 StopTask, Scenario stop_tasks. TASK-31.
describe("stop tasks in the engine", () => {
  it.todo("scenario stop_tasks become TASK_ADDED events with origin plan, state TODO, actor system");
  it.todo("TASK_ADDED / TASK_UPDATED / TASK_DROPPED reduce to the tasks in SNAPSHOT");
  it.todo("a plan revision that drops stops turns their TODO tasks into DROPPED (actor system); DONE and SKIPPED stay");
  it.todo("a plan revision keeps the surviving stops' Waypoint ids, so tasks keep their stop (U-61)");
  it.todo("abort in the killer demo turns the remaining stops' open tasks into DROPPED");
  // TODO(decision): U-56 — open tasks at the current stop on abort or rendezvous.
  it.todo("open tasks at the current stop on abort follow the U-56 decision");
  it.todo("the simulated crew member (EV2 in the demo) completes its open tasks at the end of each dwell");
  it.todo("two headless runs give the same TASK_* events (NFR-06)");
  it.todo("post-EVA report task counts per stop equal the counts reduced from the event log");
});
