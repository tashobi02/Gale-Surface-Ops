import type { MissionScenario } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import {
  makeHazardWallGrid,
  makeNanIslandGrid,
  makePlaneGrid,
  makeRampGrid,
} from "../../../apps/web/tests/fixtures/grids";
import { searchLeg } from "../src/route";

const defaultScenario: MissionScenario = {
  eva_start_utc: "2026-11-14T08:00:00Z",
  max_eva_duration_h: 6.0,
  dwell_min_per_stop: 20,
  hard_slope_limit_deg: 15,
  caution_slope_deg: 10,
  walkback_limit_km: 5.0,
  suited_flat_speed_kmh: 3.3,
  solar_phase: "max",
  loop: true,
  max_haven_min: 30,
  crew_count: 2,
  vehicle_available: true,
};

// docs/specs/02 §D.2 "No feasible route" row, §E.2 PLAN_RESULT example (FR-07). TASK-05 (T05.08).
describe("noRoute reasons and nearest reachable cell", () => {
  it("returns DISCONNECTED_BY_SLOPE on a uniform 20° ramp with 15° limit (02 §D.2 (2))", () => {
    // 20x20 grid with uniform 20° slope
    const grid = makeRampGrid({
      width: 20,
      height: 20,
      cell_m: 5,
      ramp_slope_deg: 20,
      origin_m: [0, 0],
    });

    const from = { x_m: 12.5, y_m: -12.5 };
    const to = { x_m: 87.5, y_m: -87.5 };

    // With 15° limit, start and end are on 20° slope so start is blocked
    // For DISCONNECTED_BY_SLOPE: make a grid where start is passable (flat), but ramp blocks path to target
    const planeWithRamp = makePlaneGrid({
      width: 20,
      height: 20,
      cell_m: 5,
      slope_deg: 0,
      origin_m: [0, 0],
    });
    // Turn columns 8..12 of the grid into a steep 20° slope barrier
    for (let r = 0; r < 20; r++) {
      for (let c = 8; c <= 12; c++) {
        const idx = r * 20 + c;
        planeWithRamp.slopeP90[idx] = 20 * 4; // 20°
      }
    }

    const startWest = { x_m: 12.5, y_m: -50 }; // col 2, passable
    const targetEast = { x_m: 87.5, y_m: -50 }; // col 17, passable (slope 0°)

    const result = searchLeg(planeWithRamp, startWest, targetEast, defaultScenario);
    expect(result.status).toBe("NO_ROUTE");
    if (result.status === "NO_ROUTE") {
      expect(result.reason).toBe("DISCONNECTED_BY_SLOPE");
      // Nearest reachable cell must be on the western edge of the slope barrier (col 7)
      expect(result.nearest_reachable.x_m).toBeCloseTo(7 * 5 + 2.5, 1);
    }
  });

  it("returns START_BLOCKED when the start waypoint is impassable", () => {
    const grid = makeRampGrid({
      width: 20,
      height: 20,
      cell_m: 5,
      ramp_slope_deg: 20, // 20° > 15° hard limit
      origin_m: [0, 0],
    });

    const from = { x_m: 12.5, y_m: -12.5 };
    const to = { x_m: 87.5, y_m: -87.5 };

    const result = searchLeg(grid, from, to, defaultScenario);
    expect(result.status).toBe("NO_ROUTE");
    if (result.status === "NO_ROUTE") {
      expect(result.reason).toBe("START_BLOCKED");
    }
  });

  it("returns END_BLOCKED when the end waypoint is impassable", () => {
    const grid = makePlaneGrid({
      width: 20,
      height: 20,
      cell_m: 5,
      slope_deg: 0,
      origin_m: [0, 0],
    });

    // Make the target cell impassable (over hard slope limit)
    const targetIdx = 10 * 20 + 10;
    grid.slopeP90[targetIdx] = 25 * 4; // 25° > 15°

    const from = { x_m: 12.5, y_m: -12.5 };
    const to = { x_m: 52.5, y_m: -52.5 }; // cell (10, 10)

    const result = searchLeg(grid, from, to, defaultScenario);
    expect(result.status).toBe("NO_ROUTE");
    if (result.status === "NO_ROUTE") {
      expect(result.reason).toBe("END_BLOCKED");
    }
  });

  it("returns DISCONNECTED_BY_HAZARD when blocked by a hazard wall", () => {
    // 20x20 grid with unbroken hazard wall at col 10
    const grid = makeHazardWallGrid({
      width: 20,
      height: 20,
      cell_m: 5,
      wall_col: 10,
      origin_m: [0, 0],
    });

    const from = { x_m: 12.5, y_m: -50 }; // col 2 (west of wall)
    const to = { x_m: 82.5, y_m: -50 }; // col 16 (east of wall)

    const result = searchLeg(grid, from, to, defaultScenario);
    expect(result.status).toBe("NO_ROUTE");
    if (result.status === "NO_ROUTE") {
      expect(result.reason).toBe("DISCONNECTED_BY_HAZARD");
      // Nearest reachable point is right in front of the wall (col 9)
      expect(result.nearest_reachable.x_m).toBeCloseTo(9 * 5 + 2.5, 1);
    }
  });

  it("returns DISCONNECTED_BY_NODATA when target is surrounded by NaN cells", () => {
    const grid = makePlaneGrid({
      width: 25,
      height: 25,
      cell_m: 5,
      slope_deg: 0,
      origin_m: [0, 0],
    });

    // Surround target cell (15, 15) with NaN cells
    for (let r = 13; r <= 17; r++) {
      for (let c = 13; c <= 17; c++) {
        if (r === 13 || r === 17 || c === 13 || c === 17) {
          const idx = r * 25 + c;
          grid.elevation[idx] = NaN;
          grid.flags[idx] |= 1 << 0; // NO_DATA flag
        }
      }
    }

    const from = { x_m: 12.5, y_m: -12.5 }; // col 2, row 2
    const to = { x_m: 77.5, y_m: -77.5 }; // col 15, row 15 (inside NaN box)

    const result = searchLeg(grid, from, to, defaultScenario);
    expect(result.status).toBe("NO_ROUTE");
    if (result.status === "NO_ROUTE") {
      expect(result.reason).toBe("DISCONNECTED_BY_NODATA");
      // Nearest reachable point is outside the NaN box
      expect(result.nearest_reachable).toBeDefined();
    }
  });

  it("nearest_reachable is the explored cell with the smallest Euclidean distance to target", () => {
    const grid = makeHazardWallGrid({
      width: 20,
      height: 20,
      cell_m: 10,
      wall_col: 10,
      origin_m: [0, 0],
    });

    // Start at (15, -55) (col 1, row 5)
    const from = { x_m: 15, y_m: -55 };
    // Target at (155, -55) (col 15, row 5)
    const to = { x_m: 155, y_m: -55 };

    const result = searchLeg(grid, from, to, defaultScenario);
    expect(result.status).toBe("NO_ROUTE");
    if (result.status === "NO_ROUTE") {
      // The closest cell to (155, -55) on the west side of wall_col=10 is (col 9, row 5)
      // centre: x = 0 + (9 + 0.5) * 10 = 95, y = 0 - (5 + 0.5) * 10 = -55
      expect(result.nearest_reachable.x_m).toBe(95);
      expect(result.nearest_reachable.y_m).toBe(-55);
    }
  });
});
