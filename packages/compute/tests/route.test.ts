import { describe, it } from "vitest";

// docs/specs/02 §D.2 validation cases and §F.1 routing row (FR-07, NFR-02, NFR-06). TASK-05.
describe("searchLeg", () => {
  it.todo("routes through the single gap in a synthetic wall");
  it.todo("returns NO_ROUTE / DISCONNECTED_BY_SLOPE on a uniform 20° ramp with a 15° limit");
  it.todo("no returned step violates the hard slope limit when re-sampled");
  it.todo("gives identical output for repeated runs (tie-break by cell index)");
  it.todo("returns START_BLOCKED / END_BLOCKED for impassable endpoints");
  it.todo("returns nearest_reachable as the explored cell closest to the target");
  it.todo("aborts with TIMEOUT after 3 × 10⁶ node expansions");
  it.todo("real grid: 20 random pairs, report p50/p95; 3-stop loop ≤ 2 s");
});

describe("snapToPassable", () => {
  it.todo("snaps an impassable waypoint to the nearest passable cell within 50 m");
  it.todo("returns null when no passable cell lies within 50 m");
});
