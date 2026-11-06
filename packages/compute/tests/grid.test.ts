import { describe, it } from "vitest";

// docs/specs/05 §C RoutingGrid and §E.1 (FR-03, FR-07). TASK-05.
describe("grid", () => {
  it.todo("cell index follows i = floor((origin_y − y)/cell), j = floor((x − origin_x)/cell)");
  it.todo("decodes slope u8 as degrees × 4 with 255 = no data");
  it.todo("reads flag bits NO_DATA, HARD_HAZARD, LOW_TI, TI_UNKNOWN, LOW_RES_DEM");
  it.todo("rejects arrays whose dimensions differ from the manifest");
});
