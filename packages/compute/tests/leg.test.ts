import type { MissionScenario } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { makePlaneGrid, makeRampGrid } from "../../../apps/web/tests/fixtures/grids";
import { toLeg } from "../src/leg";
import type { LegSearch } from "../src/route";
import { sampleProfile } from "../src/sampling";
import { stepTimeH, suitedSpeedKmh } from "../src/timeModel";

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

// docs/specs/02 §D.2 (Post-processing row), 05 PlanResult (Leg; FR-07, FR-08). TASK-05 (T05.10).
describe("toLeg", () => {
  it("applies Douglas–Peucker 2 m simplification to geometry only while metrics use unsimplified path (02 §D.2)", () => {
    // 20x20 flat plane grid, 5 m cells
    const grid = makePlaneGrid({
      width: 20,
      height: 20,
      cell_m: 5,
      slope_deg: 0,
      origin_m: [0, 0],
    });

    // 11 collinear cells in row 5 from col 2 to col 12
    const cells: number[] = [];
    for (let c = 2; c <= 12; c++) {
      cells.push(5 * 20 + c);
    }

    const search: LegSearch = { status: "OK", cells };
    const leg = toLeg(grid, "wp-0", "wp-1", search, defaultScenario);

    expect(leg.status).toBe("OK");
    if (leg.status === "OK") {
      // Cell path length must be the full unsimplified count (11 cells)
      expect(leg.cell_path_length).toBe(11);

      // Collinear path within 2 m tolerance simplifies to just start and end (2 vertices)
      expect(leg.geometry.length).toBe(2);
      expect(leg.geometry[0]).toEqual([
        0 + (2 + 0.5) * 5,
        0 - (5 + 0.5) * 5,
      ]);
      expect(leg.geometry[1]).toEqual([
        0 + (12 + 0.5) * 5,
        0 - (5 + 0.5) * 5,
      ]);

      // Metrics: 10 steps of 5 m = 50 m
      expect(leg.distance_m).toBeCloseTo(50, 4);
    }
  });

  it("computes distance_m, walk_time_min, climb_m, descent_m, max_slope_deg through output properties on a flat plane", () => {
    const grid = makePlaneGrid({
      width: 15,
      height: 15,
      cell_m: 5,
      slope_deg: 0,
      origin_m: [0, 0],
    });

    // Path from (0, 0) to (5, 5) diagonally: 6 cells
    const cells: number[] = [];
    for (let i = 0; i < 6; i++) {
      cells.push(i * 15 + i);
    }

    const search: LegSearch = { status: "OK", cells };
    const leg = toLeg(grid, "wp-1", "wp-2", search, defaultScenario);

    expect(leg.status).toBe("OK");
    if (leg.status === "OK") {
      expect(leg.climb_m).toBe(0);
      expect(leg.descent_m).toBe(0);
      expect(leg.max_slope_deg).toBe(0);

      // 5 diagonal steps of 5 * sqrt(2)
      const expectedDist = 5 * (5 * Math.SQRT2);
      expect(leg.distance_m).toBeCloseTo(expectedDist, 4);

      // Walk time must equal the sum of step costs in minutes
      const flatSpeed = suitedSpeedKmh(0, defaultScenario.suited_flat_speed_kmh);
      let expectedTimeH = 0;
      for (let i = 0; i < 5; i++) {
        expectedTimeH += stepTimeH(5 * Math.SQRT2, 0, flatSpeed, 1.0);
      }
      expect(leg.walk_time_min).toBeCloseTo(expectedTimeH * 60, 4);
    }
  });

  it("computes climb_m and descent_m accurately on an uphill ramp (no descent)", () => {
    // 20x20 ramp rising to the east at 10°
    const grid = makeRampGrid({
      width: 20,
      height: 20,
      cell_m: 5,
      ramp_slope_deg: 10,
      direction: "east",
      origin_m: [0, 0],
    });

    // 8 cells going east along row 3 (cols 2 to 9)
    const cells: number[] = [];
    for (let c = 2; c <= 9; c++) {
      cells.push(3 * 20 + c);
    }

    const search: LegSearch = { status: "OK", cells };
    const leg = toLeg(grid, "wp-start", "wp-stop", search, defaultScenario);

    expect(leg.status).toBe("OK");
    if (leg.status === "OK") {
      // Uphill ramp: descent must be exactly 0
      expect(leg.descent_m).toBe(0);

      // Total climb must equal elevation delta between end and start cell
      const startElev = grid.elevation[cells[0]];
      const endElev = grid.elevation[cells[cells.length - 1]];
      expect(leg.climb_m).toBeCloseTo(endElev - startElev, 4);

      // Max slope is 10°
      expect(leg.max_slope_deg).toBeCloseTo(10, 1);
    }
  });

  it("assembles profile via sampleProfile every 5 m along the path (05 §C, 01 FR-08)", () => {
    const grid = makePlaneGrid({
      width: 10,
      height: 10,
      cell_m: 5,
      slope_deg: 0,
      origin_m: [0, 0],
    });

    const cells = [0, 1, 2, 3, 4];
    const search: LegSearch = { status: "OK", cells };
    const leg = toLeg(grid, "wp-0", "wp-1", search, defaultScenario);

    expect(leg.status).toBe("OK");
    if (leg.status === "OK") {
      expect(leg.profile.dist_m[0]).toBe(0);
      expect(leg.profile.dist_m).toEqual([0, 5, 10, 15, 20]);
      expect(leg.profile.elev_m.length).toBe(5);
      expect(leg.profile.slope_class.length).toBe(5);
      expect(leg.profile.slope_class.every((c) => c === "ok")).toBe(true);
    }
  });

  it("converts NO_ROUTE search result to a NoRouteLeg with reason and nearest_reachable", () => {
    const search: LegSearch = {
      status: "NO_ROUTE",
      reason: "DISCONNECTED_BY_SLOPE",
      nearest_reachable: { x_m: 42.5, y_m: -37.5 },
    };

    const dummyGrid = makePlaneGrid({ width: 5, height: 5, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
    const leg = toLeg(dummyGrid, "wp-0", "wp-1", search, defaultScenario);

    expect(leg.status).toBe("NO_ROUTE");
    expect(leg.from).toBe("wp-0");
    expect(leg.to).toBe("wp-1");
    if (leg.status === "NO_ROUTE") {
      expect(leg.reason).toBe("DISCONNECTED_BY_SLOPE");
      expect(leg.nearest_reachable).toEqual({ x_m: 42.5, y_m: -37.5 });
      // Metrics must not be present on a NO_ROUTE leg
      expect("distance_m" in leg).toBe(false);
      expect("geometry" in leg).toBe(false);
      expect("profile" in leg).toBe(false);
    }
  });

  it("converts START_BLOCKED NO_ROUTE search result without requiring nearest_reachable", () => {
    const search: LegSearch = {
      status: "NO_ROUTE",
      reason: "START_BLOCKED",
      nearest_reachable: { x_m: 10, y_m: -10 },
    };

    const dummyGrid = makePlaneGrid({ width: 5, height: 5, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
    const leg = toLeg(dummyGrid, "wp-start", "wp-stop", search, defaultScenario);

    expect(leg.status).toBe("NO_ROUTE");
    expect(leg.from).toBe("wp-start");
    expect(leg.to).toBe("wp-stop");
    if (leg.status === "NO_ROUTE") {
      expect(leg.reason).toBe("START_BLOCKED");
    }
  });

  it("handles single-cell paths (start === end)", () => {
    const grid = makePlaneGrid({ width: 5, height: 5, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
    const search: LegSearch = { status: "OK", cells: [12] };
    const leg = toLeg(grid, "wp-0", "wp-0", search, defaultScenario);

    expect(leg.status).toBe("OK");
    if (leg.status === "OK") {
      expect(leg.distance_m).toBe(0);
      expect(leg.walk_time_min).toBe(0);
      expect(leg.climb_m).toBe(0);
      expect(leg.descent_m).toBe(0);
      expect(leg.cell_path_length).toBe(1);
      expect(leg.geometry.length).toBe(1);
    }
  });
});
