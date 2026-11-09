import type { MissionScenario } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { makePlaneGrid, makeWallWithGapGrid } from "../../../apps/web/tests/fixtures/grids";
import { decodeSlopeDeg } from "../src/grid";
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

// docs/specs/02 §D.2 validation cases (1), (3), (4) and TIMEOUT row (FR-07, NFR-06). TASK-05 (T05.07).
describe("searchLeg", () => {
  it("routes through the single gap in a synthetic wall (02 §D.2 (1))", () => {
    // 30x30 grid with wall at col 15 and gap at row 15
    const grid = makeWallWithGapGrid({
      width: 30,
      height: 30,
      cell_m: 5,
      wall_col: 15,
      gap_row: 15,
      wall_slope_deg: 20,
      origin_m: [0, 0],
    });

    // Start west of the wall: col 5, row 15 -> x = 27.5, y = -77.5
    const from = { x_m: 27.5, y_m: -77.5 };
    // End east of the wall: col 25, row 15 -> x = 127.5, y = -77.5
    const to = { x_m: 127.5, y_m: -77.5 };

    const result = searchLeg(grid, from, to, defaultScenario);
    expect(result.status).toBe("OK");

    if (result.status === "OK") {
      // The single gap is at (row 15, col 15) -> index 15 * 30 + 15 = 465
      const gapIndex = 15 * 30 + 15;
      expect(result.cells).toContain(gapIndex);

      // Verify that no other cell on wall_col (col 15) was traversed
      for (let r = 0; r < 30; r++) {
        if (r !== 15) {
          const wallIndex = r * 30 + 15;
          expect(result.cells).not.toContain(wallIndex);
        }
      }
    }
  });

  it("no returned step violates the hard slope limit when re-sampled (02 §D.2 (3), FR-07)", () => {
    const grid = makeWallWithGapGrid({
      width: 30,
      height: 30,
      cell_m: 5,
      wall_col: 15,
      gap_row: 15,
      wall_slope_deg: 20,
      origin_m: [0, 0],
    });

    const from = { x_m: 27.5, y_m: -77.5 };
    const to = { x_m: 127.5, y_m: -77.5 };

    const result = searchLeg(grid, from, to, defaultScenario);
    expect(result.status).toBe("OK");

    if (result.status === "OK") {
      for (const cellIdx of result.cells) {
        const slopeDeg = decodeSlopeDeg(grid.slopeP90[cellIdx]);
        expect(slopeDeg).not.toBeNull();
        expect(slopeDeg!).toBeLessThanOrEqual(defaultScenario.hard_slope_limit_deg);
      }
    }
  });

  it("gives identical output for repeated runs with ties broken by cell index (02 §D.2 (4), NFR-06)", () => {
    const grid = makePlaneGrid({
      width: 20,
      height: 20,
      cell_m: 5,
      slope_deg: 0,
      origin_m: [0, 0],
    });

    const from = { x_m: 12.5, y_m: -12.5 };
    const to = { x_m: 87.5, y_m: -87.5 };

    const run1 = searchLeg(grid, from, to, defaultScenario);
    const run2 = searchLeg(grid, from, to, defaultScenario);

    expect(run1.status).toBe("OK");
    expect(run2.status).toBe("OK");
    if (run1.status === "OK" && run2.status === "OK") {
      expect(run1.cells).toEqual(run2.cells);
    }
  });

  it("aborts with TIMEOUT after max node expansions (02 §D.2)", () => {
    const grid = makePlaneGrid({
      width: 30,
      height: 30,
      cell_m: 5,
      slope_deg: 0,
      origin_m: [0, 0],
    });

    const from = { x_m: 12.5, y_m: -12.5 };
    const to = { x_m: 137.5, y_m: -137.5 };

    // With a tiny maxExpansions limit, search must terminate with TIMEOUT
    const result = searchLeg(grid, from, to, defaultScenario, 5);
    expect(result.status).toBe("TIMEOUT");
  });
});
