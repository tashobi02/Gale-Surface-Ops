import { describe, it } from "vitest";

// docs/specs/02 §D.3 reference values (FR-09); table values exact to 0.01 km/h (02 §F.1). TASK-05.
describe("suitedSpeedKmh (v0 = 3.3 km/h)", () => {
  it.todo("0° → 5.04 unsuited, 3.30 suited");
  it.todo("+5° → 3.71 unsuited, 2.43 suited");
  it.todo("+10° → 2.72 unsuited, 1.78 suited");
  it.todo("+15° → 1.97 unsuited, 1.29 suited");
  it.todo("−5° → 5.26 unsuited, 3.45 suited");
  it.todo("−10° → 3.86 unsuited, 2.53 suited");
});

describe("walking time", () => {
  it.todo("1 km flat → 18.18 min");
  it.todo("1 km at constant +10° gradient → 3D length 1015.4 m, ≈ 34.2 min");
  it.todo("EVA timeline adds dwell time per stop");
});
