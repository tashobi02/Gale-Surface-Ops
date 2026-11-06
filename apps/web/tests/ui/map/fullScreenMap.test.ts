import { describe, it } from "vitest";

// docs/specs/01 FR-32; 04 §E.5; mockup handoff DV-13, DV-14, G-42, G-43, G-48. TASK-07, TASK-24.
describe("MapControls", () => {
  it.todo("eva-full shows +, −, FIT, FOLLOW, LAYERS and CLOSE, each a labelled button at least 56 px");
  it.todo("ops and planner show + / − / FIT only");
  it.todo("every action works without drag, wheel or pinch");
});

describe("FullScreenMap", () => {
  it.todo("opens from the mini-map and from FULL; CLOSE returns the normal layout");
  it.todo("fixed geography: the alert slot, metadata strip and action row keep their position");
  it.todo("HAVEN and O₂ stay visible: in their row in portrait, stacked at the left in landscape");
  it.todo("landscape map takes at least 80 % of the width; HAVEN keeps the top-left origin");
  it.todo("a warning closes the full-screen map");
  it.todo("at most two scientific layers; a third turns the oldest off and says so");
  it.todo("positions are drawn in working-projection metres (no EPSG:3857, no ol/sphere)");
});
