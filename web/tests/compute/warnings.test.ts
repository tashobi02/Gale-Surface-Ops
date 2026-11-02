import { describe, it } from "vitest";

// docs/specs/01 FR-10, 02 §E.2 rule, 05 §E.6 (FR-10, FR-16). TASK-05.
describe("warnings", () => {
  it.todo("status PARTIAL with totals null when any leg is NO_ROUTE");
  it.todo("flags 100 % of segments over the hard slope limit");
  it.todo("emits CAUTION_SLOPE, LOW_TI, LOW_RES_DEM, EVA_DURATION_EXCEEDED, WALKBACK_EXCEEDED, DARKNESS");
  it.todo("missing TI layer yields TI_UNKNOWN (unknown severity), never silence");
});
