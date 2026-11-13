/**
 * cellsAlongPath and the shared centreOfCell (docs/specs/02 §D.15; 05 §E.1; FR-44; BD-59, BD-62). TASK-23 (T23.07).
 * A polyline in projected metres becomes the routing cells it passes through, in order, so `toLeg` can compute the
 * climb, descent and slope of a leg whose geometry is a display polyline. Cell sizes and origins come from the grid,
 * never from a 5 m literal. Expected cells are written as (row, column) pairs and turned into indices by the grid width.
 */
import { describe, expect, it } from "vitest";
import { makePlaneGrid } from "../../../apps/web/tests/fixtures/grids";
import { cellIndex } from "../src/grid";
import { centreOfCell } from "../src/grid";
import { cellsAlongPath } from "../src/paths";

const grid = makePlaneGrid({ width: 10, height: 8, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
const idx = (row: number, col: number, width = 10): number => row * width + col;
/** Centre of cell (row, col) of `g` in projected metres, from the grid's own origin and cell size. */
const centre = (g: typeof grid, row: number, col: number): [number, number] => [
  g.meta.origin_m[0] + (col + 0.5) * g.meta.cell_m,
  g.meta.origin_m[1] - (row + 0.5) * g.meta.cell_m,
];

describe("cellsAlongPath (BD-59)", () => {
  it("a horizontal run lists every cell it crosses, west to east", () => {
    expect(cellsAlongPath(grid, [centre(grid, 2, 1), centre(grid, 2, 5)])).toEqual([1, 2, 3, 4, 5].map((c) => idx(2, c)));
  });

  it("a vertical run lists every cell it crosses, north to south and back", () => {
    const down = cellsAlongPath(grid, [centre(grid, 0, 3), centre(grid, 4, 3)]);
    expect(down).toEqual([0, 1, 2, 3, 4].map((r) => idx(r, 3)));
    expect(cellsAlongPath(grid, [centre(grid, 4, 3), centre(grid, 0, 3)])).toEqual([...down].reverse());
  });

  it("a diagonal through exact cell corners steps diagonally: only the cells the line passes through are listed", () => {
    // Centre (1,1) to centre (3,3) passes exactly through the corners shared by four cells; the two side cells
    // are touched at a point only and the router steps diagonally too (route.ts), so they are not listed.
    expect(cellsAlongPath(grid, [centre(grid, 1, 1), centre(grid, 3, 3)])).toEqual([idx(1, 1), idx(2, 2), idx(3, 3)]);
    expect(cellsAlongPath(grid, [centre(grid, 3, 3), centre(grid, 1, 1)])).toEqual([idx(3, 3), idx(2, 2), idx(1, 1)]);
  });

  it("a shallow line crosses the neighbouring cells it actually enters, in order", () => {
    // From the centre of (0,0) to the centre of (1,2): column edges at a quarter and three quarters of the way, the row edge at half.
    expect(cellsAlongPath(grid, [centre(grid, 0, 0), centre(grid, 1, 2)])).toEqual([idx(0, 0), idx(0, 1), idx(1, 1), idx(1, 2)]);
  });

  it("every step between listed cells is to one of the 8 neighbours", () => {
    const cells = cellsAlongPath(grid, [centre(grid, 0, 0), centre(grid, 7, 9), centre(grid, 2, 1)]);
    for (let i = 1; i < cells.length; i++) {
      const dr = Math.abs(Math.floor(cells[i]! / 10) - Math.floor(cells[i - 1]! / 10));
      const dc = Math.abs((cells[i]! % 10) - (cells[i - 1]! % 10));
      expect(Math.max(dr, dc), `step ${i}`).toBe(1);
    }
  });

  it("collapses consecutive repeats: a polyline inside one cell is that cell once, and a corner shared by two segments is not doubled", () => {
    expect(cellsAlongPath(grid, [[2.5, -2.5], [3, -3], [4, -4]])).toEqual([idx(0, 0)]);
    const bent = cellsAlongPath(grid, [centre(grid, 0, 0), centre(grid, 0, 2), centre(grid, 2, 2)]);
    expect(bent).toEqual([idx(0, 0), idx(0, 1), idx(0, 2), idx(1, 2), idx(2, 2)]);
  });

  it("keeps a cell visited again later (only consecutive repeats collapse)", () => {
    const there = centre(grid, 0, 1);
    expect(cellsAlongPath(grid, [centre(grid, 0, 0), there, centre(grid, 0, 0)])).toEqual([idx(0, 0), idx(0, 1), idx(0, 0)]);
  });

  it("a vertex on a cell edge belongs to the cell the grid's own addressing gives it (floor, 05 §E.1)", () => {
    const [x, y] = [5, -2.5]; // the edge between columns 0 and 1
    expect(cellsAlongPath(grid, [[x, y]])).toEqual([cellIndex(grid, x, y)]);
  });

  it("a polyline with a vertex outside the grid stops at the edge and returns the cells inside", () => {
    const out = cellsAlongPath(grid, [centre(grid, 0, 7), [1000, -2.5], centre(grid, 0, 1)]);
    expect(out).toEqual([7, 8, 9].map((c) => idx(0, c)));
  });

  it("a polyline that starts outside gives nothing; an empty polyline gives nothing; one vertex gives its cell", () => {
    expect(cellsAlongPath(grid, [[-100, -2.5], centre(grid, 0, 1)])).toEqual([]);
    expect(cellsAlongPath(grid, [])).toEqual([]);
    expect(cellsAlongPath(grid, [centre(grid, 3, 4)])).toEqual([idx(3, 4)]);
  });

  it("a non-finite vertex ends the traversal like an outside one", () => {
    expect(cellsAlongPath(grid, [centre(grid, 0, 0), [Number.NaN, -2.5], centre(grid, 0, 3)])).toEqual([idx(0, 0)]);
    expect(cellsAlongPath(grid, [[Number.POSITIVE_INFINITY, 0]])).toEqual([]);
  });

  it("is deterministic: the same inputs give the same list", () => {
    const poly: [number, number][] = [centre(grid, 0, 0), [31.3, -17.7], centre(grid, 7, 9)];
    expect(cellsAlongPath(grid, poly)).toEqual(cellsAlongPath(grid, poly));
  });

  it("reads the cell size and origin from the grid: a 2.5 m grid with another origin", () => {
    const fine = makePlaneGrid({ width: 12, height: 6, cell_m: 2.5, slope_deg: 0, origin_m: [100, 50] });
    const poly = [centre(fine, 1, 2), centre(fine, 1, 6)];
    expect(cellsAlongPath(fine, poly)).toEqual([2, 3, 4, 5, 6].map((c) => idx(1, c, 12)));
  });

  it("does not touch the polyline it is given", () => {
    const poly: [number, number][] = [centre(grid, 0, 0), centre(grid, 0, 3)];
    const before = JSON.stringify(poly);
    cellsAlongPath(grid, poly);
    expect(JSON.stringify(poly)).toBe(before);
  });
});

describe("centreOfCell (BD-62)", () => {
  it("is the cell centre in projected metres from the layout's origin, cell size and width", () => {
    expect(centreOfCell(grid.meta, idx(2, 3))).toEqual(centre(grid, 2, 3));
    const fine = makePlaneGrid({ width: 12, height: 6, cell_m: 2.5, slope_deg: 0, origin_m: [100, 50] });
    expect(centreOfCell(fine.meta, idx(4, 7, 12))).toEqual(centre(fine, 4, 7));
  });

  it("returns 0, not -0, where the centre is on an axis", () => {
    const axis = makePlaneGrid({ width: 3, height: 3, cell_m: 10, slope_deg: 0, origin_m: [-15, 15] });
    const [x, y] = centreOfCell(axis.meta, idx(1, 1, 3));
    expect(Object.is(x, 0)).toBe(true);
    expect(Object.is(y, 0)).toBe(true);
  });

  it("is the inverse of cellIndex for every cell centre", () => {
    for (let k = 0; k < 10 * 8; k++) {
      const [x, y] = centreOfCell(grid.meta, k);
      expect(cellIndex(grid, x, y)).toBe(k);
    }
  });
});
