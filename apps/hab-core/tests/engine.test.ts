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
