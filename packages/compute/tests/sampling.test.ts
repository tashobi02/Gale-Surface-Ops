import { describe, it } from "vitest";

// docs/specs/02 §D.1 and 01 FR-03 acceptance (FR-03, FR-08). TASK-05.
describe("samplePoint", () => {
  it.todo("returns OUTSIDE_AOI with no values outside the AOI");
  it.todo("returns NO_DATA for NaN cells");
  it.todo("matches the rasterio readout at 10 sampled cells (elevation exact, slope ±0.1°)");
  it.todo("reports SLOPE_OVER_LIMIT and a snap candidate for steep cells");
});

describe("sampleProfile", () => {
  it.todo("samples elevation bilinearly every 5 m along the path");
});
