import { describe, it } from "vitest";

// docs/specs/02 §D.12 validation (FR-43). TASK-05b.
describe("deliveryTime", () => {
  it.todo("message sent during a pass is delivered at send time + light time");
  it.todo("message sent between passes waits for the next pass start");
  it.todo("conjunction (angle < threshold) returns null");
  it.todo("light time for the scenario date matches a spiceypy spot check within 1 s");
});
