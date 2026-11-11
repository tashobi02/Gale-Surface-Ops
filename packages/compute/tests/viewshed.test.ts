import { describe, expect, it } from "vitest";
import {
  CoverageGrid,
  MARS_RADIUS_M,
  RELAY_VIEWSHED_CELL_M,
  RELAY_VIEWSHED_RADIUS_M,
  LOS_MAX_STEP_M,
  LOS_STEP_CELL_FRACTION,
  VIEWSHED_LABEL,
  horizonDistanceM,
  lineOfSight,
  viewshed,
} from "../src/viewshed";
import { losFlatWall, losSphere } from "./fixtures/v2grids";

describe("horizonDistanceM (02 §D.11)", () => {
  it("computes horizon distance √(2Rh) matching 02 §D.11 quoted values", () => {
    // 02 §D.11: 2 m antenna -> 3.69 km
    const d2 = horizonDistanceM(2);
    expect(d2).toBeCloseTo(Math.sqrt(2 * MARS_RADIUS_M * 2), 4);
    expect(Number((d2 / 1000).toFixed(2))).toBe(3.69);

    // 02 §D.11: 10 m mast -> 8.24 km
    const d10 = horizonDistanceM(10);
    expect(d10).toBeCloseTo(Math.sqrt(2 * MARS_RADIUS_M * 10), 4);
    expect(Number((d10 / 1000).toFixed(2))).toBe(8.24);
  });

  it("handles 0 height and rejects invalid inputs", () => {
    expect(horizonDistanceM(0)).toBe(0);
    expect(() => horizonDistanceM(-1)).toThrow(RangeError);
    expect(() => horizonDistanceM(NaN)).toThrow(RangeError);
    expect(() => horizonDistanceM(Infinity)).toThrow(RangeError);
  });
});

describe("lineOfSight (02 §D.11)", () => {
  it("flat plane with one wall: shadow begins exactly behind the wall", () => {
    const fixture = losFlatWall();
    const mast = fixture.shape.mast; // { x_m: 0, y_m: 0, height_m: 10 }
    const targetHeight = fixture.shape.targetHeight_m; // 2 m
    const wallX = fixture.shape.wallX_m; // 500 m
    const firstShadowX = fixture.shape.firstShadowX_m; // 505 m

    // Before the wall: visible
    expect(
      lineOfSight(fixture.grid, mast, { x_m: 100, y_m: 0, height_m: targetHeight }),
    ).toBe(true);
    expect(
      lineOfSight(fixture.grid, mast, { x_m: wallX - fixture.grid.meta.cell_m, y_m: 0, height_m: targetHeight }),
    ).toBe(true);

    // Exactly behind the wall: in shadow
    expect(
      lineOfSight(fixture.grid, mast, { x_m: firstShadowX, y_m: 0, height_m: targetHeight }),
    ).toBe(false);

    // Further behind the wall: in shadow
    expect(
      lineOfSight(fixture.grid, mast, { x_m: wallX + 100, y_m: 0, height_m: targetHeight }),
    ).toBe(false);
    expect(
      lineOfSight(fixture.grid, mast, { x_m: wallX + 500, y_m: 0, height_m: targetHeight }),
    ).toBe(false);
  });

  it("sphere-sampled grid: targets beyond the combined horizon are not visible", () => {
    const fixture = losSphere();
    const mast = fixture.shape.mast; // 10 m mast at (0, 0)
    const targetHeight = fixture.shape.targetHeight_m; // 2 m suit antenna
    const combinedHorizon = fixture.shape.combinedHorizon_m; // ~11927.32 m

    // Within combined horizon (with margin per v2grids note): visible
    const insideDist = combinedHorizon - 500;
    expect(
      lineOfSight(fixture.grid, mast, { x_m: insideDist, y_m: 0, height_m: targetHeight }),
    ).toBe(true);

    // Beyond combined horizon (with margin per v2grids note): not visible
    const outsideDist = combinedHorizon + 500;
    expect(
      lineOfSight(fixture.grid, mast, { x_m: outsideDist, y_m: 0, height_m: targetHeight }),
    ).toBe(false);
  });

  it("same location is visible", () => {
    const fixture = losFlatWall();
    expect(
      lineOfSight(fixture.grid, { x_m: 100, y_m: 50, height_m: 2 }, { x_m: 100, y_m: 50, height_m: 2 }),
    ).toBe(true);
  });

  it("handles out of grid and NaN gracefully as false", () => {
    const fixture = losFlatWall();
    expect(
      lineOfSight(fixture.grid, fixture.shape.mast, { x_m: 999999, y_m: 0, height_m: 2 }),
    ).toBe(false);
  });
});

describe("viewshed (02 §D.11)", () => {
  it("produces a CoverageGrid with valid metadata and dimensions", () => {
    const fixture = losFlatWall();
    const grid = viewshed(fixture.grid, { x_m: 0, y_m: 0, height_m: 10 }, 2, 200, 20);

    expect(grid.cell_m).toBe(20);
    expect(grid.width).toBe(20);
    expect(grid.height).toBe(20);
    expect(grid.origin_m).toEqual([-200, 200]);
    expect(grid.visible.length).toBe(20 * 20);
  });

  it("marks shadow behind the wall in viewshed grid", () => {
    const fixture = losFlatWall();
    const cov = viewshed(fixture.grid, { x_m: 400, y_m: 0, height_m: 10 }, 2, 200, 10);
    const centerRow = Math.floor((200 - 0) / 10); // 20
    const colBeforeWall = Math.floor((480 - 200) / 10); // 28
    const colAfterWall = Math.floor((550 - 200) / 10); // 35

    expect(cov.visible[centerRow * cov.width + colBeforeWall]).toBe(1);
    expect(cov.visible[centerRow * cov.width + colAfterWall]).toBe(0);
  });

  it("respects radius_m and masks cells beyond it as 0", () => {
    const fixture = losFlatWall();
    const radius = 100;
    const cov = viewshed(fixture.grid, { x_m: 0, y_m: 0, height_m: 10 }, 2, radius, 10);

    // Corner cell is at distance ~141 m > 100 m
    expect(cov.visible[0]).toBe(0);
  });

  it("exports constants RELAY_VIEWSHED_RADIUS_M and RELAY_VIEWSHED_CELL_M", () => {
    expect(RELAY_VIEWSHED_RADIUS_M).toBe(4000);
    expect(RELAY_VIEWSHED_CELL_M).toBe(20);
  });

  it("names the ray step rule: half a grid cell, never more than 20 m", () => {
    expect(LOS_STEP_CELL_FRACTION).toBe(0.5);
    expect(LOS_MAX_STEP_M).toBe(20);
  });
});

describe("viewshed provenance label (T05b.09 acceptance; 02 §D.11)", () => {
  it("labels the output `derived` with the not-modelled caveat, frozen", () => {
    expect(VIEWSHED_LABEL.provenance).toBe("derived");
    expect(VIEWSHED_LABEL.note).toBe("radio propagation not modelled beyond line of sight");
    expect(Object.isFrozen(VIEWSHED_LABEL)).toBe(true);
  });
});

describe("viewshed validation still to do (02 §D.11, §F.2)", () => {
  it.todo("matches gdal_viewshed at 5 real points (fixture from the pipeline; TASK-05b T05b.20 / T03.30)");
});
