import { describe, it } from "vitest";

// docs/specs/02 §E.4, §E.6. TASK-23.
describe("handleCommand", () => {
  it.todo("rejects a command from a role without permission with FORBIDDEN_ROLE");
  it.todo("rejects an EVA command while that suit is unlinked with NO_LINK");
  it.todo("SUMMON_VEHICLE produces VEHICLE_DISPATCHED with a rendezvous");
  it.todo("SUMMON_VEHICLE with no rendezvous returns NO_RENDEZVOUS and leaves state unchanged");
});

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
  it.todo("a fifth task on a stop is INVALID (1–4 per stop)");
  it.todo("empty text or text over 60 characters is INVALID");
  // TODO(decision): U-46 proposes "ops adds tasks only when no warning is latched"; reject code not chosen.
  it.todo("adding while a warning is latched is rejected");
});
