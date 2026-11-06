import { describe, it } from "vitest";

// docs/specs/02 §D.11 validation (FR-42). TASK-05b.
describe("horizonDistanceM", () => {
  it.todo("2 m antenna → 3.69 km; 10 m mast → 8.24 km (√(2Rh), R = 3,396,190 m)");
});

describe("lineOfSight / viewshed", () => {
  it.todo("flat plane with one wall: shadow begins exactly behind the wall");
  it.todo("sphere-sampled grid: targets beyond the combined horizon are not visible");
  it.todo("matches gdal_viewshed at 5 real points (fixture from the pipeline)");
});

describe("linkStates", () => {
  it.todo("suit without LOS to hab is linked via a buddy suit with LOS");
  it.todo("relay rover on a ridge links a suit in a shadow");
  it.todo("out of range ⇒ no edge even with LOS");
});
