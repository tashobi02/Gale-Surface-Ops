import type { MissionScenario } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import {
  makeHazardWallGrid,
  makePlaneGrid,
  makeWallWithGapGrid,
} from "../../../apps/web/tests/fixtures/grids";
import { SNAP_RADIUS_M, snapToPassable } from "../src/snap";

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

// docs/specs/02 §D.2 (Snapping row) and §E.2 (snap null rule; FR-06). TASK-05 (T05.09).
describe("snapToPassable", () => {
  it("snaps an impassable waypoint on a hazard wall to the nearest passable cell within 50 m (FR-06, 02 §D.2)", () => {
    // 20x20 grid with 5 m cells, origin at (0, 0)
    // Hazard wall at col 10 (x from 50 to 55 m; cell centre at 52.5)
    const grid = makeHazardWallGrid({
      width: 20,
      height: 20,
      cell_m: 5,
      wall_col: 10,
      origin_m: [0, 0],
    });

    // Clicked point on hazard wall: row 5, col 10 -> centre at (52.5, -27.5)
    // Clicked slightly off-centre toward the west: x = 51.0, y = -27.5
    // Nearest passable cell is col 9 (x centre = 47.5, y centre = -27.5)
    // Distance = 51.0 - 47.5 = 3.5 m (< 50 m)
    const snapped = snapToPassable(grid, 51.0, -27.5, defaultScenario);
    expect(snapped).not.toBeNull();
    expect(snapped!.x_m).toBe(47.5);
    expect(snapped!.y_m).toBe(-27.5);
    expect(snapped!.distance_m).toBeCloseTo(3.5, 4);
  });

  it("snaps an impassable slope waypoint to the nearest passable cell within 50 m", () => {
    // Wall with gap at col 10 with 20° slope (hard limit is 15°)
    const grid = makeWallWithGapGrid({
      width: 20,
      height: 20,
      cell_m: 5,
      wall_col: 10,
      gap_row: 10,
      wall_slope_deg: 20,
      origin_m: [0, 0],
    });

    // Point on wall at row 5 (not the gap), clicked at (52.5, -27.5)
    // East neighbor col 11 (57.5, -27.5) or west col 9 (47.5, -27.5) are 5.0 m away.
    // If clicked closer to east: x = 53.0, y = -27.5
    // Distance to col 11 (57.5) is 4.5 m; to col 9 (47.5) is 5.5 m
    const snapped = snapToPassable(grid, 53.0, -27.5, defaultScenario);
    expect(snapped).not.toBeNull();
    expect(snapped!.x_m).toBe(57.5);
    expect(snapped!.y_m).toBe(-27.5);
    expect(snapped!.distance_m).toBeCloseTo(4.5, 4);
  });

  it("returns null when no passable cell lies within snap_radius_m (02 §E.2)", () => {
    // 30x30 grid, cell_m = 5 (150 m x 150 m)
    // Fill the grid with a slope of 25° (all impassable under 15° limit)
    const grid = makePlaneGrid({
      width: 30,
      height: 30,
      cell_m: 5,
      slope_deg: 25,
      origin_m: [0, 0],
    });

    const snapped = snapToPassable(grid, 75, -75, defaultScenario);
    expect(snapped).toBeNull();
  });

  it("respects custom snap radius and scenario hard slope limit", () => {
    // Grid with 18° slope
    const grid = makePlaneGrid({
      width: 20,
      height: 20,
      cell_m: 5,
      slope_deg: 18,
      origin_m: [0, 0],
    });

    // With 15° hard limit, all cells are impassable -> null
    const snap15 = snapToPassable(grid, 52.5, -52.5, { hard_slope_limit_deg: 15 });
    expect(snap15).toBeNull();

    // With 20° hard limit, cells are passable -> snaps to cell centre with distance
    const snap20 = snapToPassable(grid, 52.5, -52.5, { hard_slope_limit_deg: 20 });
    expect(snap20).not.toBeNull();
    expect(snap20!.x_m).toBe(52.5);
    expect(snap20!.y_m).toBe(-52.5);
    expect(snap20!.distance_m).toBeCloseTo(0, 4);

    // Custom radius smaller than distance to nearest passable cell returns null
    const snapShortRadius = snapToPassable(
      grid,
      50.0,
      -52.5,
      { hard_slope_limit_deg: 20 },
      2.0, // clicked 2.5 m away from cell centre, radius is 2.0 m
    );
    expect(snapShortRadius).toBeNull();
  });

  it("resolves equal-distance candidates deterministically by cell index", () => {
    // Hazard wall at col 5, cell_m = 10.
    // Row 5, col 5 cell centre is at (55, -55).
    // Clicked exactly on the cell centre: x = 55, y = -55.
    // West neighbour: col 4 -> centre (45, -55), index = 5 * 10 + 4 = 54, dist = 10.
    // East neighbour: col 6 -> centre (65, -55), index = 5 * 10 + 6 = 56, dist = 10.
    // North neighbour: row 4, col 5 is on hazard wall (still impassable).
    // South neighbour: row 6, col 5 is on hazard wall (still impassable).
    // West cell (index 54) has smaller cell index than East cell (index 56).
    const grid = makeHazardWallGrid({
      width: 10,
      height: 10,
      cell_m: 10,
      wall_col: 5,
      origin_m: [0, 0],
    });

    const snapped = snapToPassable(grid, 55, -55, defaultScenario);
    expect(snapped).not.toBeNull();
    expect(snapped!.x_m).toBe(45);
    expect(snapped!.y_m).toBe(-55);
    expect(snapped!.distance_m).toBeCloseTo(10, 4);
  });

  it("returns null when clicked far outside the AOI (> snap radius away)", () => {
    const grid = makePlaneGrid({
      width: 10,
      height: 10,
      cell_m: 5,
      slope_deg: 0,
      origin_m: [0, 0],
    });

    // Grid bounds: x from 0 to 50, y from -50 to 0.
    // Point at (200, -200) is > 150 m away.
    const snapped = snapToPassable(grid, 200, -200, defaultScenario);
    expect(snapped).toBeNull();
  });

  it("exports SNAP_RADIUS_M as 50", () => {
    expect(SNAP_RADIUS_M).toBe(50);
  });
});
