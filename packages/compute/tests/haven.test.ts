import { describe, it } from "vitest";

// docs/specs/02 §D.8 validation (FR-39). TASK-05b.
describe("habTimeField / havenAlongRoute", () => {
  it.todo("flat synthetic grid: crew 1 km from hab → 1 km / 3.3 km/h + ingress");
  it.todo("blocked wall forces a detour; time equals the detour path time");
  it.todo("vehicle slower than walking → haven uses the hab");
  it.todo("planning approximation is never lower than the exact live value at 5 positions");
  it.todo("real grid: full-grid field ≤ 2 s on the weakest laptop (NFR-02)");
});
