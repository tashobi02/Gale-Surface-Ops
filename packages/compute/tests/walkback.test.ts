import { describe, expect, it } from "vitest";
import { maxWalkbackKm } from "../src/walkback";

// docs/specs/02 §D.3 walkback definition (FR-09). TASK-05 (T05.12).
describe("maxWalkbackKm", () => {
  it("computes walkback on a loop route as min(distance back along route, remaining distance to end) (02 §D.3)", () => {
    // 6 km symmetric loop sampled at 1 km intervals
    const loopPoints = [0, 1000, 2000, 3000, 4000, 5000, 6000];
    // At s = 0: min(0, 6000) = 0
    // At s = 1000: min(1000, 5000) = 1000
    // At s = 2000: min(2000, 4000) = 2000
    // At s = 3000: min(3000, 3000) = 3000
    // At s = 4000: min(4000, 2000) = 2000
    // At s = 5000: min(5000, 1000) = 1000
    // At s = 6000: min(6000, 0) = 0
    // Max walkback = 3000 m = 3.0 km
    expect(maxWalkbackKm(loopPoints, true)).toBeCloseTo(3.0, 4);

    // Asymmetric sampling: points at [0, 1200, 3100, 5000]
    // At 1200: min(1200, 3800) = 1200
    // At 3100: min(3100, 1900) = 1900
    // Max = 1900 m = 1.9 km
    const asymmLoop = [0, 1200, 3100, 5000];
    expect(maxWalkbackKm(asymmLoop, true)).toBeCloseTo(1.9, 4);
  });

  it("computes walkback on a one-way route as distance back along the route to start (02 §D.3, 03 §C.2)", () => {
    // One-way excursion: maximum is at the final point
    const oneWayPoints = [0, 1500, 3200, 5400];
    // At s = 0: 0
    // At s = 1500: 1500
    // At s = 3200: 3200
    // At s = 5400: 5400
    // Max walkback = 5400 m = 5.4 km
    expect(maxWalkbackKm(oneWayPoints, false)).toBeCloseTo(5.4, 4);
  });

  it("handles edge cases: empty array and single point", () => {
    expect(maxWalkbackKm([], true)).toBe(0);
    expect(maxWalkbackKm([], false)).toBe(0);
    expect(maxWalkbackKm([0], true)).toBe(0);
    expect(maxWalkbackKm([0], false)).toBe(0);
  });
});
