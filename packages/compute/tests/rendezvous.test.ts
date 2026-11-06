import { describe, it } from "vitest";

// docs/specs/02 §D.10 validation (FR-40). TASK-05b.
describe("rendezvous", () => {
  it.todo("crew on a ridge the vehicle cannot climb → rendezvous at the ridge foot");
  it.todo("vehicle fully blocked → NO_RENDEZVOUS");
  it.todo("tie-break by min crew time then cell index is deterministic");
  it.todo("vehicle path never exceeds the vehicle hard slope limit when re-sampled");
});

describe("rendezvousPair", () => {
  it.todo("chooses the visiting order that minimises the later arrival");
});
