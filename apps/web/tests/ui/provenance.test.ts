import { describe, it } from "vitest";

// FR-15, NFR-05: no numeric element without data-provenance in any role view. T12.02 / TASK-12.
describe("provenance DOM check", () => {
  it.todo("every metric element on SCR-02–SCR-08 has data-provenance and a source id");
  it.todo("every metric element on SCR-11–SCR-14 and SCR-17 has data-provenance (6 classes)");
  it.todo("HUD collapses chips to glyphs but keeps data-provenance on each value");
});
