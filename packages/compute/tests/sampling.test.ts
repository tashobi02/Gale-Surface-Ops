import { describe, expect, it, vi } from "vitest";
import {
  makeHazardWallGrid,
  makeNanIslandGrid,
  makePlaneGrid,
  makeRampGrid,
  withoutTi,
} from "../../../apps/web/tests/fixtures/grids";
import { samplePoint, sampleProfile } from "../src/sampling";
import * as snapModule from "../src/snap";

// Mock snap.ts so samplePoint tests can verify snap integration (T05.06 / T05.17)
vi.mock("../src/snap", () => ({
  SNAP_RADIUS_M: 50,
  snapToPassable: vi.fn(),
}));

// docs/specs/02 §D.1, §E.2 and 01 FR-03, FR-08. TASK-05 (T05.06).
describe("samplePoint", () => {
  it("returns OUTSIDE_AOI with null values outside the AOI (02 §D.1)", () => {
    const grid = makePlaneGrid({
      width: 10,
      height: 10,
      cell_m: 5,
      origin_m: [0, 0],
    });

    // Grid extent: x in [0, 50], y in [-50, 0]
    // Point north of origin (y > 0)
    const resultNorth = samplePoint(grid, 25, 10, 50, 15);
    expect(resultNorth.inside_aoi).toBe(false);
    expect(resultNorth.passable).toBe(false);
    expect(resultNorth.reason).toBe("OUTSIDE_AOI");
    expect(resultNorth.lat).toBeNull();
    expect(resultNorth.lon_e).toBeNull();
    expect(resultNorth.elevation_m).toBeNull();
    expect(resultNorth.slope_p90_deg).toBeNull();
    expect(resultNorth.ti_tiu).toBeNull();
    expect(resultNorth.flags).toEqual([]);
    expect(resultNorth.snap).toBeNull();

    // Point east of grid (x > 50)
    const resultEast = samplePoint(grid, 60, -25, 50, 15);
    expect(resultEast.inside_aoi).toBe(false);
    expect(resultEast.reason).toBe("OUTSIDE_AOI");
    expect(resultEast.elevation_m).toBeNull();
  });

  it("returns OUTSIDE_AOI for nonfinite (NaN, Infinity) coordinates", () => {
    const grid = makePlaneGrid({
      width: 10,
      height: 10,
      cell_m: 5,
      origin_m: [0, 0],
    });

    for (const invalid of [NaN, Infinity, -Infinity]) {
      const resX = samplePoint(grid, invalid, -25, 50, 15);
      expect(resX.inside_aoi).toBe(false);
      expect(resX.reason).toBe("OUTSIDE_AOI");
      expect(resX.lat).toBeNull();

      const resY = samplePoint(grid, 25, invalid, 50, 15);
      expect(resY.inside_aoi).toBe(false);
      expect(resY.reason).toBe("OUTSIDE_AOI");
      expect(resY.lat).toBeNull();
    }
  });

  it("returns NO_DATA for NaN cells (02 §D.1)", () => {
    // 30x30 grid with NaN island in the middle
    const grid = makeNanIslandGrid({
      width: 30,
      height: 30,
      cell_m: 5,
      origin_m: [0, 0],
      island_row: 10,
      island_col: 10,
      island_width: 5,
      island_height: 5,
    });

    // Centre of cell (12, 12): x = 12.5 * 5 = 62.5, y = -12.5 * 5 = -62.5
    const result = samplePoint(grid, 62.5, -62.5, 50, 15);
    expect(result.inside_aoi).toBe(true);
    expect(result.passable).toBe(false);
    expect(result.reason).toBe("NO_DATA");
    expect(result.lat).toBeNull();
    expect(result.lon_e).toBeNull();
    expect(result.elevation_m).toBeNull();
    expect(result.slope_p90_deg).toBeNull();
    expect(result.ti_tiu).toBeNull();
    expect(result.flags).toContain("NO_DATA");
  });

  it("samples passable inside-AOI points with nearest slope/flags, bilinear elevation, and TI", () => {
    const grid = makePlaneGrid({
      width: 20,
      height: 20,
      cell_m: 10,
      slope_deg: 10,
      direction: "east",
      origin_m: [0, 0],
    });

    // Inside cell (5, 5): x = 55, y = -55
    const result = samplePoint(grid, 55, -55, 50, 15);
    expect(result.inside_aoi).toBe(true);
    expect(result.passable).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.slope_p90_deg).toBe(10);
    expect(result.flags).toEqual([]);
    expect(result.ti_tiu).toBe(300);
    expect(typeof result.elevation_m).toBe("number");
    expect(result.snap).toBeNull();
  });

  it("returns ti_tiu as null when TI sidecar is absent (05 §E.6)", () => {
    const grid = withoutTi(
      makePlaneGrid({
        width: 10,
        height: 10,
        cell_m: 10,
        origin_m: [0, 0],
      }),
    );

    const result = samplePoint(grid, 25, -25, 50, 15);
    expect(result.inside_aoi).toBe(true);
    expect(result.ti_tiu).toBeNull();
  });

  it("reports HARD_HAZARD and queries snapToPassable for hazard cells", () => {
    const mockSnap = vi.mocked(snapModule.snapToPassable);
    mockSnap.mockReturnValue({ x_m: 105, y_m: -55, distance_m: 10 });

    const grid = makeHazardWallGrid({
      width: 20,
      height: 20,
      cell_m: 10,
      wall_col: 10,
      origin_m: [0, 0],
    });

    // Point on the hazard wall: col 10 -> x = 105, row 5 -> y = -55
    const result = samplePoint(grid, 105, -55, 50, 15);
    expect(result.inside_aoi).toBe(true);
    expect(result.passable).toBe(false);
    expect(result.reason).toBe("HARD_HAZARD");
    expect(result.flags).toContain("HARD_HAZARD");
    expect(result.snap).toEqual({ x_m: 105, y_m: -55, distance_m: 10 });
    expect(mockSnap).toHaveBeenCalledWith(grid, 105, -55, { hard_slope_limit_deg: 15 }, 50);
  });

  it("reports SLOPE_OVER_LIMIT and queries snapToPassable for steep cells", () => {
    const mockSnap = vi.mocked(snapModule.snapToPassable);
    mockSnap.mockReturnValue({ x_m: 15, y_m: -15, distance_m: 20 });

    // Ramp with 20° slope
    const grid = makeRampGrid({
      width: 20,
      height: 20,
      cell_m: 10,
      ramp_slope_deg: 20,
      origin_m: [0, 0],
    });

    // With 15° hard slope limit, 20° is over limit
    const result = samplePoint(grid, 35, -35, 50, 15);
    expect(result.inside_aoi).toBe(true);
    expect(result.passable).toBe(false);
    expect(result.reason).toBe("SLOPE_OVER_LIMIT");
    expect(result.slope_p90_deg).toBe(20);
    expect(result.snap).toEqual({ x_m: 15, y_m: -15, distance_m: 20 });
    expect(mockSnap).toHaveBeenCalledWith(grid, 35, -35, { hard_slope_limit_deg: 15 }, 50);
  });

  it("computes lat and lon_e matching spherical equirectangular projection (C7, 02 §C.1, 02 §E.2)", () => {
    // 02 §E.2 reference example: (x=2990.0, y=-2595.0) -> lat -4.74378, lon_e 137.43061
    const grid = makePlaneGrid({
      width: 100,
      height: 100,
      cell_m: 100,
      origin_m: [-5000, 5000],
    });

    const result = samplePoint(grid, 2990.0, -2595.0, 50, 15);
    expect(result.lat).not.toBeNull();
    expect(result.lon_e).not.toBeNull();
    expect(result.lat!).toBeCloseTo(-4.74378, 4);
    expect(result.lon_e!).toBeCloseTo(137.43061, 4);

    // At origin (0, 0), lat and lon_e should equal site projection center (-4.70, 137.38)
    const resultOrigin = samplePoint(grid, 0, 0, 50, 15);
    expect(resultOrigin.lat!).toBeCloseTo(-4.70, 4);
    expect(resultOrigin.lon_e!).toBeCloseTo(137.38, 4);
  });
});

describe("sampleProfile", () => {
  it("samples elevation and slope classification every 5 m along a path (05 §C Leg, 01 FR-08)", () => {
    const grid = makePlaneGrid({
      width: 20,
      height: 20,
      cell_m: 10,
      slope_deg: 10,
      direction: "east",
      origin_m: [0, 0],
    });

    // Straight 20 m path along east axis (x goes 10 -> 30, y stays -10)
    const path: [number, number][] = [
      [10, -10],
      [30, -10],
    ];

    const profile = sampleProfile(grid, path, 10, 15);
    // Samples at d = 0, 5, 10, 15, 20 m
    expect(profile.dist_m).toEqual([0, 5, 10, 15, 20]);
    expect(profile.elev_m.length).toBe(5);
    expect(profile.slope_class.length).toBe(5);
    // On 10° plane with caution=10, hard=15: slope is not > caution, so "ok" (or caution if >= caution)
    profile.slope_class.forEach((sc) => {
      expect(["ok", "caution", "over_limit"]).toContain(sc);
    });
  });

  it("classifies slope as ok, caution, or over_limit against scenario limits (01 FR-08)", () => {
    // 20° ramp: caution 10°, hard 15° -> 20° slope should be "over_limit"
    const grid = makeRampGrid({
      width: 10,
      height: 10,
      cell_m: 10,
      ramp_slope_deg: 20,
      origin_m: [0, 0],
    });

    const path: [number, number][] = [
      [10, -10],
      [20, -10],
    ];

    const profile = sampleProfile(grid, path, 10, 15);
    expect(profile.dist_m).toEqual([0, 5, 10]);
    profile.slope_class.forEach((sc) => {
      expect(sc).toBe("over_limit");
    });
  });

  it("samples the end of the leg even when total distance is not a multiple of 5 m", () => {
    const grid = makePlaneGrid({
      width: 20,
      height: 20,
      cell_m: 10,
      slope_deg: 0,
      origin_m: [0, 0],
    });

    // 12 m path
    const path: [number, number][] = [
      [0, 0],
      [12, 0],
    ];

    const profile = sampleProfile(grid, path, 10, 15);
    // Profile must include 0, 5, 10 and the exact leg end at 12 m
    expect(profile.dist_m).toEqual([0, 5, 10, 12]);
    expect(profile.elev_m.length).toBe(4);
    expect(profile.slope_class.length).toBe(4);
  });

  it("classifies the leg-end sample with the same thresholds as the 5 m samples", () => {
    // Plane at 12 deg: above the 10 deg caution threshold, below the 15 deg hard limit
    const grid = makePlaneGrid({ width: 20, height: 20, cell_m: 10, slope_deg: 12, origin_m: [0, 0] });
    const profile = sampleProfile(grid, [[0, -5], [12, -5]], 10, 15);
    expect(profile.dist_m).toEqual([0, 5, 10, 12]);
    expect(profile.slope_class).toEqual(["caution", "caution", "caution", "caution"]);
  });

  it("keeps comm, elevation and slope arrays equal in length when the leg end is outside the grid", () => {
    const grid = makePlaneGrid({ width: 4, height: 4, cell_m: 10, slope_deg: 0, origin_m: [0, 0] });
    // The grid spans x 0..40 m; the path ends 2 m past the east edge, off a 5 m sample boundary
    const profile = sampleProfile(grid, [[30, -5], [42, -5]], 10, 15);
    expect(profile.dist_m).toEqual([0, 5, 10, 12]);
    expect(profile.slope_class[3]).toBe("over_limit");
    expect(profile.comm).toHaveLength(profile.dist_m.length);
    expect(profile.comm?.[3]).toBe(0);
    expect(profile.elev_m).toHaveLength(profile.dist_m.length);
    expect(profile.slope_class).toHaveLength(profile.dist_m.length);
  });

  it("omits comm and keeps the other arrays equal in length when the grid has no commHab", () => {
    const grid = makePlaneGrid({ width: 4, height: 4, cell_m: 10, slope_deg: 0, origin_m: [0, 0] });
    const withoutComm = { ...grid, commHab: undefined } as unknown as typeof grid;
    for (const path of [
      [[0, -5], [12, -5]], // leg end inside the grid
      [[30, -5], [42, -5]], // leg end outside the grid
    ] as [number, number][][]) {
      const profile = sampleProfile(withoutComm, path, 10, 15);
      expect(profile.comm).toBeUndefined();
      expect(profile.elev_m).toHaveLength(profile.dist_m.length);
      expect(profile.slope_class).toHaveLength(profile.dist_m.length);
    }
  });
});
