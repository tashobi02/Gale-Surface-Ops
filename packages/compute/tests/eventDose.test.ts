import { describe, it } from "vitest";

// docs/specs/02 §D.13 validation (FR-37, FR-38). TASK-05b.
describe("triggerState", () => {
  it.todo("fires on the second consecutive sample above k × background");
  it.todo("clears only after the rate stays below clear_k × background for clear_min minutes");
});

describe("integrateDose", () => {
  it.todo("hand-checked 3-step series with suit, rover and hab shielding factors");
  it.todo("gaps (null rate) contribute nothing and are reported");
  it.todo("digitised series integral matches the published 8,100 µGy total within the stated tolerance");
});
