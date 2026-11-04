import { describe, it } from "vitest";

// docs/specs/02 §D.5 and §C.4.1 (FR-11). TASK-06.
describe("mars24", () => {
  it.todo("matches marstime at 3 reference timestamps within 0.1° solar elevation");
  it.todo("matches marstime at 3 reference timestamps within 1 min LTST");
  it.todo("converts east to west longitude: west = (360 − east) mod 360, tested at Gale");
  it.todo("sunrise/sunset use a flat horizon (elevation 0°)");
});
