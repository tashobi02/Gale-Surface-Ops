import { describe, expect, it } from "vitest";
import { FLAG_BITS } from "@marswalk/protocol";
import {
  makeHazardWallGrid,
  makeNanIslandGrid,
  makePlaneGrid,
  makeRampGrid,
  makeWallWithGapGrid,
  SLOPE_SCALE,
  U8_NODATA,
  withoutTi,
} from "./grids";

describe("F1 — Synthetic routing grids (T05.02)", () => {
  const baseOptions = {
    width: 10,
    height: 8,
    cell_m: 5.0,
    origin_m: [1000, 2000] as [number, number],
  };

  it("makePlaneGrid produces uniform 10° slope and derived elevation gradient", () => {
    const grid = makePlaneGrid({ ...baseOptions, slope_deg: 10 });

    expect(grid.meta.width).toBe(10);
    expect(grid.meta.height).toBe(8);
    expect(grid.meta.cell_m).toBe(5.0);
    expect(grid.meta.origin_m).toEqual([1000, 2000]);
    expect(grid.elevation.length).toBe(80);
    expect(grid.slopeP90.length).toBe(80);
    expect(grid.ti?.length).toBe(80);

    const expectedSlopeU8 = Math.round(10 * SLOPE_SCALE); // 40
    expect(grid.slopeP90[0]).toBe(expectedSlopeU8);
    expect(grid.slopeMax[0]).toBe(expectedSlopeU8);

    // Elevation increases with column index
    const gradient = Math.tan((10 * Math.PI) / 180);
    expect(grid.elevation[0]).toBeCloseTo(0);
    expect(grid.elevation[1]).toBeCloseTo(1 * 5.0 * gradient, 3);
    expect(grid.elevation[9]).toBeCloseTo(9 * 5.0 * gradient, 3);
  });

  it("makeWallWithGapGrid produces an impassable wall with exactly one passable gap cell", () => {
    const grid = makeWallWithGapGrid({
      ...baseOptions,
      wall_col: 5,
      gap_row: 3,
      wall_slope_deg: 20,
    });

    const expectedWallSlopeU8 = Math.round(20 * SLOPE_SCALE); // 80

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 10; c++) {
        const idx = r * 10 + c;
        if (c === 5 && r !== 3) {
          expect(grid.slopeP90[idx]).toBe(expectedWallSlopeU8);
          expect(grid.elevation[idx]).toBe(10.0);
        } else {
          expect(grid.slopeP90[idx]).toBe(0);
          expect(grid.elevation[idx]).toBe(0.0);
        }
      }
    }
  });

  it("makeRampGrid produces uniform 20° slope exceeding 15° limit", () => {
    const grid = makeRampGrid({ ...baseOptions, ramp_slope_deg: 20 });
    const expectedSlopeU8 = Math.round(20 * SLOPE_SCALE); // 80

    for (let i = 0; i < grid.slopeP90.length; i++) {
      expect(grid.slopeP90[i]).toBe(expectedSlopeU8);
      expect(grid.slopeMax[i]).toBe(expectedSlopeU8);
    }
  });

  it("makeNanIslandGrid sets NaN elevation, U8_NODATA, and NO_DATA flag on island cells", () => {
    const grid = makeNanIslandGrid({
      ...baseOptions,
      island_row: 2,
      island_col: 2,
      island_width: 3,
      island_height: 2,
    });

    const noDataFlag = (1 << FLAG_BITS.NO_DATA) | (1 << FLAG_BITS.TI_UNKNOWN);

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 10; c++) {
        const idx = r * 10 + c;
        const inside = r >= 2 && r < 4 && c >= 2 && c < 5;
        if (inside) {
          expect(Number.isNaN(grid.elevation[idx])).toBe(true);
          expect(grid.slopeP90[idx]).toBe(U8_NODATA);
          expect(grid.slopeMax[idx]).toBe(U8_NODATA);
          expect(grid.flags[idx] & noDataFlag).toBe(noDataFlag);
        } else {
          expect(grid.elevation[idx]).toBe(0.0);
          expect(grid.slopeP90[idx]).toBe(0);
          expect(grid.flags[idx]).toBe(0);
        }
      }
    }
  });

  it("makeHazardWallGrid sets HARD_HAZARD flag bit on wall cells", () => {
    const grid = makeHazardWallGrid({ ...baseOptions, wall_col: 4 });
    const hazardFlag = 1 << FLAG_BITS.HARD_HAZARD;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 10; c++) {
        const idx = r * 10 + c;
        if (c === 4) {
          expect(grid.flags[idx] & hazardFlag).toBe(hazardFlag);
        } else {
          expect(grid.flags[idx]).toBe(0);
        }
      }
    }
  });

  it("withoutTi returns a grid with ti stripped and meta updated", () => {
    const gridWithTi = makePlaneGrid(baseOptions);
    expect(gridWithTi.ti).toBeDefined();
    expect(gridWithTi.meta.ti_asset).toBeDefined();

    const gridWithoutTi = withoutTi(gridWithTi);
    expect(gridWithoutTi.ti).toBeUndefined();
    expect(gridWithoutTi.meta.ti_asset).toBeUndefined();
    expect(gridWithoutTi.meta.ti_cell_m).toBeUndefined();
    expect(gridWithoutTi.elevation.length).toBe(gridWithTi.elevation.length);
  });

  it("respects non-standard cell sizes (no 5m hardcoding)", () => {
    const grid = makePlaneGrid({ ...baseOptions, cell_m: 12.5 });
    expect(grid.meta.cell_m).toBe(12.5);
    const gradient = Math.tan((10 * Math.PI) / 180);
    expect(grid.elevation[1]).toBeCloseTo(1 * 12.5 * gradient, 3);
  });
});
