import { describe, it } from "vitest";

// docs/specs/02 §D.14, NFR-06, NFR-14. TASK-22.
describe("engine determinism", () => {
  it.todo("two headless runs of the same scenario + seed give the same log_hash");
  it.todo("replaying session.jsonl over the initial state reproduces the live state");
  it.todo("no Date.now() / new Date() inside src/engine (static check)");
});

describe("alerts", () => {
  it.todo("RADIATION_ALERT fires at the first sample satisfying the trigger");
  it.todo("warnings latch until acknowledged and cleared (03 §E.7)");
});

// docs/specs/01 FR-50 (acceptance criteria); 05 StopTask, Scenario stop_tasks. TASK-31.
describe("stop tasks", () => {
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
