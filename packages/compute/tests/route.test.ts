import type { LoadedGridMeta, MissionScenario } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { FIXTURE_PROJ4, makePlaneGrid, makeWallWithGapGrid } from "../../../apps/web/tests/fixtures/grids";
import { decodeSlopeDeg, type LoadedGrid } from "../src/grid";
import { FLAG_BITS } from "@marswalk/protocol";
import { CANCEL_CHECK_EVERY_EXPANSIONS, searchLeg, searchLegAsync } from "../src/route";
import { toLeg } from "../src/leg";
import { stepTimeH } from "../src/timeModel";

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

  it("returns CANCELLED (not TIMEOUT) when shouldCancel returns true at the check interval (02 §E.2)", () => {
    const grid = makePlaneGrid({
      width: 30,
      height: 30,
      cell_m: 5,
      slope_deg: 0,
      origin_m: [0, 0],
    });

    const from = { x_m: 12.5, y_m: -12.5 };
    const to = { x_m: 137.5, y_m: -137.5 };

    let checkCount = 0;
    const shouldCancel = () => {
      checkCount++;
      return checkCount >= 2;
    };

    const result = searchLeg(grid, from, to, defaultScenario, 1000, shouldCancel, 10);
    expect(result.status).toBe("CANCELLED");
    expect(checkCount).toBe(2);
  });

  it("completes with OK when shouldCancel keeps returning false (02 §E.2)", () => {
    const grid = makePlaneGrid({ width: 30, height: 30, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
    const from = { x_m: 12.5, y_m: -12.5 };
    const to = { x_m: 137.5, y_m: -137.5 };

    let checkCount = 0;
    const shouldCancel = () => {
      checkCount++;
      return false;
    };

    const withHook = searchLeg(grid, from, to, defaultScenario, 1000, shouldCancel, 10);
    const withoutHook = searchLeg(grid, from, to, defaultScenario);

    expect(checkCount).toBeGreaterThan(0);
    expect(withHook).toEqual(withoutHook);
    expect(withHook.status).toBe("OK");
  });

  it("checks for cancellation every 50,000 expansions by default (02 §E.2)", () => {
    expect(CANCEL_CHECK_EVERY_EXPANSIONS).toBe(50_000);
  });

  it("route matches exhaustive brute-force Dijkstra oracle on a small synthetic grid (02 §D.2)", () => {
    const width = 5;
    const height = 5;
    const cell_m = 5;
    const totalCells = width * height;

    const elevation = new Float32Array(totalCells);
    const slopeP90 = new Uint8Array(totalCells);
    const slopeMax = new Uint8Array(totalCells);
    const flags = new Uint8Array(totalCells);
    const commHab = new Uint8Array(totalCells).fill(1);

    for (let i = 0; i < totalCells; i++) {
      elevation[i] = (i % 5) * 2.0 + Math.floor(i / 5) * 1.5;
      slopeP90[i] = 20; // 5 degrees (passable)
      slopeMax[i] = 20; // 5 degrees
    }
    // Set cell (2, 2) as high slope (caution)
    slopeMax[2 * 5 + 2] = 48; // 12 degrees > caution (10)

    const meta: LoadedGridMeta = {
      cell_m,
      width,
      height,
      origin_m: [0, 0],
      row_order: "north_up",
      elevation_asset: "e",
      slope_p90_asset: "sp",
      slope_max_asset: "sm",
      flags_asset: "f",
      comm_hab_asset: "c",
      hab_mast: { x_m: 0, y_m: 0, height_m: 10 },
      proj4: FIXTURE_PROJ4,
    };
    const grid: LoadedGrid = {
      meta,
      elevation,
      slopeP90,
      slopeMax,
      flags,
      commHab,
    };

    const startCell = 0;
    const goalCell = 24;

    // Independent Brute-Force Dijkstra Oracle
    const oracleDist = new Float64Array(totalCells).fill(Infinity);
    const visited = new Uint8Array(totalCells);
    oracleDist[startCell] = 0;

    for (let step = 0; step < totalCells; step++) {
      let minU = -1;
      let minDist = Infinity;
      for (let i = 0; i < totalCells; i++) {
        if (!visited[i] && oracleDist[i] < minDist) {
          minDist = oracleDist[i];
          minU = i;
        }
      }
      if (minU === -1 || minU === goalCell) break;
      visited[minU] = 1;

      const uRow = Math.floor(minU / width);
      const uCol = minU % width;
      const uElev = elevation[minU];

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = uRow + dr;
          const nc = uCol + dc;
          if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
          const v = nr * width + nc;

          const isDiag = dr !== 0 && dc !== 0;
          const dM = isDiag ? cell_m * Math.SQRT2 : cell_m;
          const dzM = elevation[v] - uElev;

          let multiplier = 1.0;
          if ((decodeSlopeDeg(slopeMax[v]) ?? 0) > defaultScenario.caution_slope_deg) {
            multiplier *= 1.5;
          }
          if ((flags[v] & (1 << 2)) !== 0) {
            multiplier *= 1.3;
          }

          const weight = stepTimeH(dM, dzM, defaultScenario.suited_flat_speed_kmh, multiplier);
          if (oracleDist[minU] + weight < oracleDist[v]) {
            oracleDist[v] = oracleDist[minU] + weight;
          }
        }
      }
    }

    const from = { x_m: 2.5, y_m: -2.5 };
    const to = { x_m: 22.5, y_m: -22.5 };
    const result = searchLeg(grid, from, to, defaultScenario);

    expect(result.status).toBe("OK");
    if (result.status === "OK") {
      expect(result.cells[0]).toBe(startCell);
      expect(result.cells[result.cells.length - 1]).toBe(goalCell);

      let aStarTimeH = 0;
      for (let i = 0; i < result.cells.length - 1; i++) {
        const u = result.cells[i];
        const v = result.cells[i + 1];
        const uRow = Math.floor(u / width);
        const uCol = u % width;
        const vRow = Math.floor(v / width);
        const vCol = v % width;
        const isDiag = uRow !== vRow && uCol !== vCol;
        const dM = isDiag ? cell_m * Math.SQRT2 : cell_m;
        const dzM = elevation[v] - elevation[u];

        let multiplier = 1.0;
        if ((decodeSlopeDeg(slopeMax[v]) ?? 0) > defaultScenario.caution_slope_deg) {
          multiplier *= 1.5;
        }
        if ((flags[v] & (1 << 2)) !== 0) {
          multiplier *= 1.3;
        }
        aStarTimeH += stepTimeH(dM, dzM, defaultScenario.suited_flat_speed_kmh, multiplier);
      }

      expect(aStarTimeH).toBeCloseTo(oracleDist[goalCell], 9);
    }
  });
});

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const farPair = { from: { x_m: 12.5, y_m: -12.5 }, to: { x_m: 137.5, y_m: -137.5 } };

// BD-41: the search is a cooperative loop that yields to the event loop every CANCEL_CHECK_EVERY_EXPANSIONS expansions.
describe("searchLegAsync (BD-41)", () => {
  const grid = () => makePlaneGrid({ width: 30, height: 30, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });

  it("gives the same answer as the synchronous search", async () => {
    const g = grid();
    const sync = searchLeg(g, farPair.from, farPair.to, defaultScenario);
    const asyncResult = await searchLegAsync(g, farPair.from, farPair.to, defaultScenario, { yieldToLoop: macrotask });
    expect(asyncResult).toEqual(sync);
    expect(asyncResult.status).toBe("OK");
  });

  it("yields to the event loop once per cancellation interval, not more and not less", async () => {
    const g = grid();
    let yields = 0;
    let expansionsSeen = 0;
    const result = await searchLegAsync(g, farPair.from, farPair.to, defaultScenario, {
      cancellationInterval: 10,
      yieldToLoop: async () => {
        yields++;
        await macrotask();
      },
      shouldCancel: () => {
        expansionsSeen++;
        return false;
      },
    });
    expect(result.status).toBe("OK");
    expect(yields).toBeGreaterThan(1);
    expect(expansionsSeen).toBe(yields);
  });

  it("is cancelled in flight: a flag set by another task while the search is yielded ends it with CANCELLED", async () => {
    const g = grid();
    let cancel = false;
    setTimeout(() => {
      cancel = true;
    }, 0); // queued before the search's first yield, so it runs while the search waits
    const result = await searchLegAsync(g, farPair.from, farPair.to, defaultScenario, {
      cancellationInterval: 10,
      yieldToLoop: macrotask,
      shouldCancel: () => cancel,
    });
    expect(result).toEqual({ status: "CANCELLED" });
  });

  it("does not cancel when the flag never flips, and TIMEOUT still comes from maxExpansions", async () => {
    const g = grid();
    const timeout = await searchLegAsync(g, farPair.from, farPair.to, defaultScenario, {
      maxExpansions: 5,
      yieldToLoop: macrotask,
      shouldCancel: () => false,
    });
    expect(timeout).toEqual({ status: "TIMEOUT" });
  });

  it("never yields for a search shorter than one interval", async () => {
    const g = grid();
    let yields = 0;
    await searchLegAsync(g, { x_m: 12.5, y_m: -12.5 }, { x_m: 17.5, y_m: -12.5 }, defaultScenario, {
      yieldToLoop: async () => {
        yields++;
      },
    });
    expect(yields).toBe(0);
  });
});

// BD-47: caution and LOW_TI multipliers multiply on the destination cell; LOW_TI bits are never set on the real site (U-03).
describe("combined step multipliers (BD-47)", () => {
  const row = () => {
    const g = makePlaneGrid({ width: 3, height: 3, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
    const centre = 1 * 3 + 1;
    g.slopeMax[centre] = 48; // 12 degrees, above the 10 degree caution limit
    return { g, centre };
  };
  const from = { x_m: 2.5, y_m: -7.5 }; // (row 1, col 0)
  const to = { x_m: 12.5, y_m: -7.5 }; // (row 1, col 2)

  it("goes straight through a caution-only cell (1.5 x) because the detour is longer", () => {
    const { g, centre } = row();
    const result = searchLeg(g, from, to, defaultScenario);
    expect(result.status === "OK" && result.cells.includes(centre)).toBe(true);
  });

  it("detours around a cell that is both caution and LOW_TI (1.5 x 1.3 = 1.95 x), not through it", () => {
    const { g, centre } = row();
    g.flags[centre] |= 1 << FLAG_BITS.LOW_TI;
    const result = searchLeg(g, from, to, defaultScenario);
    expect(result.status).toBe("OK");
    if (result.status === "OK") expect(result.cells).not.toContain(centre);
  });

  it("charges the same product on the leg's walk time as the search used", () => {
    const g = makePlaneGrid({ width: 3, height: 1, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
    g.slopeMax[1] = 48;
    g.flags[1] |= 1 << FLAG_BITS.LOW_TI;
    const search = searchLeg(g, { x_m: 2.5, y_m: -2.5 }, { x_m: 12.5, y_m: -2.5 }, defaultScenario);
    expect(search.status).toBe("OK");
    const leg = toLeg(g, "a", "b", search, defaultScenario);
    const expectedH = stepTimeH(5, 0, defaultScenario.suited_flat_speed_kmh, 1.5 * 1.3) + stepTimeH(5, 0, defaultScenario.suited_flat_speed_kmh, 1);
    expect(leg.status === "OK" && leg.walk_time_min).toBeCloseTo(expectedH * 60, 9);
  });
});
