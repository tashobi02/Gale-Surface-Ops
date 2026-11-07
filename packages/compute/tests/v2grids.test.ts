/**
 * Self-check of fixture F9 (packages/compute/tests/fixtures/v2grids.ts; T05b.02; FR-39, FR-40, FR-42).
 *
 * Checks only the declared shapes of the synthetic grids. It tests no haven, rendezvous or line-of-sight
 * behaviour (that belongs to T05b.03, T05b.06 and T05b.08) and calls no `src` function: `loadGrid`,
 * `cellIndex`, `decodeSlopeDeg` and `horizonDistanceM` are stubs. Only the constant MARS_RADIUS_M is read.
 * Expected values are quotes from 02 §D.8, §D.10 and §D.11, or are derived here from the declared shape.
 */
import { FLAG_BITS } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { MARS_RADIUS_M } from "../src/viewshed";
import type { LoadedGrid } from "../src/grid";
import {
  HAB_XY,
  MAST_HEIGHT_M,
  SUIT_ANTENNA_M,
  fixtureCellCentre,
  fixtureCellIndex,
  flatGrid,
  havenFlat,
  havenSlowVehicle,
  havenWallDetour,
  losFlatWall,
  losSphere,
  pr1Params,
  rendezvousBlockedVehicle,
  rendezvousRidge,
  ridgeScenario,
  defaultScenario,
  slowVehicleParams,
  type V2Fixture,
  type XY,
} from "./fixtures/v2grids";

const ALL: [string, () => V2Fixture<unknown>][] = [
  ["havenFlat", () => havenFlat()],
  ["havenWallDetour", () => havenWallDetour()],
  ["havenSlowVehicle", () => havenSlowVehicle()],
  ["rendezvousRidge", () => rendezvousRidge()],
  ["rendezvousBlockedVehicle", () => rendezvousBlockedVehicle()],
  ["losFlatWall", () => losFlatWall()],
  ["losSphere", () => losSphere()],
];

const HAZARD = 1 << FLAG_BITS.HARD_HAZARD;
const NO_DATA = 1 << FLAG_BITS.NO_DATA;

/** Local decode of the 05 §C slope encoding (degrees x 4); the src decoder is a stub. */
const slopeDeg = (v: number): number => v / 4;

function idx(g: LoadedGrid, p: XY): number {
  const k = fixtureCellIndex(g.meta, p);
  if (k === null) throw new Error(`point (${p.x_m}, ${p.y_m}) outside the grid`);
  return k;
}
const rowOf = (g: LoadedGrid, k: number) => Math.floor(k / g.meta.width);
const colOf = (g: LoadedGrid, k: number) => k % g.meta.width;
const same = (a: ArrayBufferView, b: ArrayBufferView) => Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
/** The origin cell centre is (0, 0), so a point is a cell centre at cell size c when both coordinates are multiples of c. */
const isCentre = (p: XY, c: number) => Number.isInteger(p.x_m / c) && Number.isInteger(p.y_m / c);

describe("every generator", () => {
  it.each(ALL)("%s: arrays have the grid size and the declared layout", (_name, make) => {
    const f = make();
    const { meta } = f.grid;
    const n = meta.width * meta.height;
    expect(n).toBeGreaterThan(0);
    for (const a of [f.grid.elevation, f.grid.slopeP90, f.grid.slopeMax, f.grid.flags, f.grid.commHab]) expect(a.length).toBe(n);
    expect(meta.row_order).toBe("north_up");
    expect(meta.cell_m).toBeGreaterThan(0);
    expect(f.grid.ti).toBeUndefined();
    expect(f.grid.commHab.every((v) => v === 255)).toBe(true);
    expect(meta.hab_mast).toEqual({ x_m: HAB_XY.x_m, y_m: HAB_XY.y_m, height_m: MAST_HEIGHT_M });
    expect(f.name).toBe(_name);
    expect(f.source).toMatch(/^02 §D\.(8|10|11)/);
  });

  it.each(ALL)("%s: no NaN, no NO_DATA bit, no 255 slope", (_name, make) => {
    const { grid } = make();
    expect(grid.elevation.every((v) => Number.isFinite(v))).toBe(true);
    expect(grid.flags.every((v) => (v & NO_DATA) === 0)).toBe(true);
    expect(grid.slopeP90.every((v) => v !== 255)).toBe(true);
    expect(grid.slopeMax.every((v) => v !== 255)).toBe(true);
  });

  it.each(ALL)("%s: deterministic, and every call returns fresh arrays", (_name, make) => {
    const a = make().grid;
    const b = make().grid;
    for (const key of ["elevation", "slopeP90", "slopeMax", "flags", "commHab"] as const) {
      expect(a[key]).not.toBe(b[key]);
      expect(a[key].buffer).not.toBe(b[key].buffer);
      expect(same(a[key], b[key])).toBe(true);
    }
    expect(a.meta).toEqual(b.meta);
  });

  it("the origin cell centre is exactly (0, 0) and the index helpers agree", () => {
    const g = flatGrid({ cell_m: 10, cellsWest: 3, cellsEast: 4, cellsNorth: 2, cellsSouth: 5 });
    expect(g.meta.width).toBe(3 + 4 + 1);
    expect(g.meta.height).toBe(2 + 5 + 1);
    expect(g.meta.origin_m).toEqual([-35, 25]);
    const k = idx(g, HAB_XY);
    expect([rowOf(g, k), colOf(g, k)]).toEqual([2, 3]);
    expect(fixtureCellCentre(g.meta, k)).toEqual({ x_m: 0, y_m: 0 });
    // 05 §E.1: row 0 is north, so a point north of the origin has a smaller row.
    expect(rowOf(g, idx(g, { x_m: 0, y_m: 20 }))).toBe(0);
    expect(colOf(g, idx(g, { x_m: -30, y_m: 0 }))).toBe(0);
    expect(fixtureCellIndex(g.meta, { x_m: 50, y_m: 0 })).toBeNull();
    expect(fixtureCellIndex(g.meta, { x_m: 0, y_m: -60 })).toBeNull();
  });

  it("flatGrid rejects a non-positive cell size and negative extents", () => {
    expect(() => flatGrid({ cell_m: 0, cellsWest: 1, cellsEast: 1, cellsNorth: 1, cellsSouth: 1 })).toThrow();
    expect(() => flatGrid({ cell_m: 5, cellsWest: -1, cellsEast: 1, cellsNorth: 1, cellsSouth: 1 })).toThrow();
  });
});

describe("haven grids (02 §D.8)", () => {
  const cases: [string, (cell_m?: number) => ReturnType<typeof havenFlat>][] = [
    ["havenFlat", (c) => havenFlat(c)],
    ["havenWallDetour", (c) => havenWallDetour(c)],
    ["havenSlowVehicle", (c) => havenSlowVehicle(c)],
  ];

  it.each(cases)("%s: hab at the origin, crew 1 km and vehicle 2 km from it on the hab row", (_n, make) => {
    const { grid, shape } = make();
    expect(shape.hab).toEqual({ x_m: 0, y_m: 0 });
    expect(fixtureCellCentre(grid.meta, idx(grid, shape.hab))).toEqual({ x_m: 0, y_m: 0 });
    expect(shape.crew.y_m).toBe(shape.hab.y_m);
    expect(shape.vehicle.y_m).toBe(shape.hab.y_m);
    expect(Math.hypot(shape.crew.x_m - shape.hab.x_m, shape.crew.y_m - shape.hab.y_m)).toBe(1000);
    expect(Math.hypot(shape.vehicle.x_m - shape.hab.x_m, shape.vehicle.y_m - shape.hab.y_m)).toBe(2000);
    expect(shape.crewToHab_m).toBe(1000);
    expect(shape.vehicleToHab_m).toBe(2000);
    // The vehicle starts on the far side of the hab, so only the vehicle speed changes the haven choice.
    expect(Math.sign(shape.vehicle.x_m)).toBe(-Math.sign(shape.crew.x_m));
  });

  it.each(cases)("%s: declared points are cell centres at 5 m, and at 10 m when the grid is built natively at 10 m", (_n, make) => {
    const g5 = make();
    expect(g5.grid.meta.cell_m).toBe(5);
    for (const p of [g5.shape.hab, g5.shape.crew, g5.shape.vehicle]) {
      expect(isCentre(p, 5)).toBe(true);
      expect(fixtureCellCentre(g5.grid.meta, idx(g5.grid, p))).toEqual(p);
    }
    const g10 = make(10);
    expect(g10.grid.meta.cell_m).toBe(10);
    for (const p of [g10.shape.hab, g10.shape.crew, g10.shape.vehicle]) {
      expect(isCentre(p, 10)).toBe(true);
      expect(fixtureCellCentre(g10.grid.meta, idx(g10.grid, p))).toEqual(p);
    }
  });

  it("a 2 x 2 aggregate of the 5 m haven grid does NOT put the points on 10 m centres (documented limit)", () => {
    // The 5 m grid has odd width and height, and its origin cell centre is (0, 0). Whichever way the 2 x 2
    // blocks are paired, an aggregate centre falls on a 5 m cell corner, 2.5 m from a declared point.
    const { grid } = havenFlat();
    expect(grid.meta.width % 2).toBe(1);
    expect(grid.meta.height % 2).toBe(1);
    expect(grid.meta.origin_m[0]).toBe(-2202.5);
    const k = idx(grid, HAB_XY);
    const j = colOf(grid, k);
    const blockCentre = (jFirst: number) => (fixtureCellCentre(grid.meta, jFirst).x_m + fixtureCellCentre(grid.meta, jFirst + 1).x_m) / 2;
    expect(Math.abs(blockCentre(j))).toBe(2.5);
    expect(Math.abs(blockCentre(j - 1))).toBe(2.5);
  });

  it("havenFlat is flat: elevation 0, slope 0, no flag anywhere, 5 m cells", () => {
    const { grid } = havenFlat();
    expect(grid.meta.cell_m).toBe(5);
    expect(grid.elevation.every((v) => v === 0)).toBe(true);
    expect(grid.slopeP90.every((v) => v === 0)).toBe(true);
    expect(grid.slopeMax.every((v) => v === 0)).toBe(true);
    expect(grid.flags.every((v) => v === 0)).toBe(true);
  });

  it("havenFlat accepts another cell size and keeps the same metre positions", () => {
    const { grid, shape } = havenFlat(10);
    expect(grid.meta.cell_m).toBe(10);
    expect(fixtureCellCentre(grid.meta, idx(grid, shape.crew))).toEqual(shape.crew);
    expect(fixtureCellCentre(grid.meta, idx(grid, shape.vehicle))).toEqual(shape.vehicle);
  });

  it("havenWallDetour: HARD_HAZARD exactly on the wall segment and nowhere else", () => {
    const { grid, shape } = havenWallDetour();
    const c = grid.meta.cell_m;
    const { wall } = shape;
    let expected = 0;
    for (let i = 0; i < grid.meta.height; i++) {
      for (let j = 0; j < grid.meta.width; j++) {
        const p = fixtureCellCentre(grid.meta, i * grid.meta.width + j);
        const onWall = p.x_m === wall.x_m && p.y_m >= wall.yMin_m && p.y_m <= wall.yMax_m;
        if (onWall) expected++;
        expect((grid.flags[i * grid.meta.width + j]! & HAZARD) !== 0).toBe(onWall);
      }
    }
    expect(expected).toBe((wall.yMax_m - wall.yMin_m) / c + 1);
    expect(grid.elevation.every((v) => v === 0)).toBe(true);
  });

  it("havenWallDetour: the wall separates hab and crew, and both detour corners are free", () => {
    const { grid, shape } = havenWallDetour();
    const { wall, hab, crew } = shape;
    expect(hab.x_m).toBeLessThan(wall.x_m);
    expect(wall.x_m).toBeLessThan(crew.x_m);
    expect(Math.abs(hab.y_m)).toBeLessThanOrEqual(wall.yMax_m);
    expect(Math.abs(crew.y_m)).toBeLessThanOrEqual(wall.yMax_m);
    expect(wall.yMin_m).toBe(-wall.yMax_m);
    for (const corner of shape.detourCorners) {
      expect(corner.x_m).toBe(wall.x_m);
      expect(Math.abs(corner.y_m)).toBe(wall.yMax_m + grid.meta.cell_m);
      expect(grid.flags[idx(grid, corner)]! & HAZARD).toBe(0);
    }
    // The grid reaches past both wall ends, so a detour exists.
    expect(fixtureCellIndex(grid.meta, { x_m: wall.x_m, y_m: wall.yMax_m + grid.meta.cell_m })).not.toBeNull();
    expect(fixtureCellIndex(grid.meta, { x_m: wall.x_m, y_m: wall.yMin_m - grid.meta.cell_m })).not.toBeNull();
  });

  it("havenWallDetour: no 8-neighbour move crosses the 1-cell wall inside its span, but a detour exists", () => {
    const { grid, shape } = havenWallDetour();
    const { width, height } = grid.meta;
    const rowMin = rowOf(grid, idx(grid, { x_m: shape.wall.x_m, y_m: shape.wall.yMax_m }));
    const rowMax = rowOf(grid, idx(grid, { x_m: shape.wall.x_m, y_m: shape.wall.yMin_m }));
    // Flood fill over free cells with all 8 moves, from the hab, optionally kept inside the wall's row band.
    const reaches = (bandOnly: boolean): boolean => {
      const seen = new Uint8Array(width * height);
      const start = idx(grid, shape.hab);
      const goal = idx(grid, shape.crew);
      const stack = [start];
      seen[start] = 1;
      while (stack.length > 0) {
        const k = stack.pop()!;
        if (k === goal) return true;
        const i = rowOf(grid, k);
        const j = colOf(grid, k);
        for (let di = -1; di <= 1; di++) {
          for (let dj = -1; dj <= 1; dj++) {
            const ni = i + di;
            const nj = j + dj;
            if ((di === 0 && dj === 0) || ni < 0 || nj < 0 || ni >= height || nj >= width) continue;
            if (bandOnly && (ni < rowMin || ni > rowMax)) continue;
            const nk = ni * width + nj;
            if (seen[nk] || (grid.flags[nk]! & HAZARD) !== 0) continue;
            seen[nk] = 1;
            stack.push(nk);
          }
        }
      }
      return false;
    };
    expect(reaches(true)).toBe(false);
    expect(reaches(false)).toBe(true);
  });

  it("havenSlowVehicle: same grid as havenFlat, with a vehicle speed below the suited speed", () => {
    const slow = havenSlowVehicle();
    const flat = havenFlat();
    expect(same(slow.grid.elevation, flat.grid.elevation)).toBe(true);
    expect(same(slow.grid.flags, flat.grid.flags)).toBe(true);
    expect(slow.shape).toEqual(flat.shape);
    expect(slow.params).toBe(slowVehicleParams);
    expect(slowVehicleParams.kind).toBe("pressurized_rover");
    expect(slowVehicleParams.provenance).toBe("assumed");
    expect(slowVehicleParams.source_ids).toEqual([]);
    expect(slowVehicleParams.param_set_id).not.toBe(pr1Params.param_set_id);
    expect(slowVehicleParams.values.flat_speed_kmh).toBeLessThan(defaultScenario().suited_flat_speed_kmh);
    expect(pr1Params.values.flat_speed_kmh).toBeGreaterThan(defaultScenario().suited_flat_speed_kmh);
    // Only the speed differs from the 05 §F.5 set.
    expect({ ...slowVehicleParams.values, flat_speed_kmh: 0 }).toEqual({ ...pr1Params.values, flat_speed_kmh: 0 });
  });

  it("scenario and ParamSet fixtures: 05 §F.3 / §F.5 values, v2 defaults, fresh objects", () => {
    const s = defaultScenario();
    expect(s).toMatchObject({
      hard_slope_limit_deg: 15,
      caution_slope_deg: 10,
      suited_flat_speed_kmh: 3.3,
      max_haven_min: 30,
      crew_count: 2,
      vehicle_available: true,
      vehicle_param_set: "pr1-assumed",
    });
    expect(defaultScenario()).not.toBe(s);
    expect(defaultScenario()).toEqual(s);
    expect(pr1Params.param_set_id).toBe("pr1-assumed");
    expect(pr1Params.values).toMatchObject({ flat_speed_kmh: 10, hard_slope_deg: 20, caution_slope_deg: 15, ingress_min: 5 });
  });
});

describe("rendezvousRidge (02 §D.10: crew on a ridge the vehicle cannot climb)", () => {
  const f = rendezvousRidge();
  const { grid, shape } = f;
  const c = grid.meta.cell_m;
  const hardVehicle = pr1Params.values.hard_slope_deg as number;
  const hardCrewTest = ridgeScenario().hard_slope_limit_deg;

  it("the crew test limit is the 02 §E.3 maximum, and only that limit makes the flank passable for the crew", () => {
    expect(hardCrewTest).toBe(35);
    expect(defaultScenario().hard_slope_limit_deg).toBe(15);
    expect(shape.flankDeg).toBeGreaterThan(hardVehicle);
    expect(shape.flankDeg).toBeLessThanOrEqual(hardCrewTest);
    expect(ridgeScenario()).toEqual({ ...defaultScenario(), hard_slope_limit_deg: 35 });
  });

  it("flank cells exceed the vehicle limit, stay within the crew test limit, and span every row", () => {
    const flankCols: number[] = [];
    for (let j = 0; j < grid.meta.width; j++) {
      const x = fixtureCellCentre(grid.meta, j).x_m;
      const k = Math.abs(x - shape.crew.x_m) / c;
      const isFlank = k > shape.plateauHalfCells && k <= shape.plateauHalfCells + shape.flankCells;
      if (isFlank) flankCols.push(j);
      for (let i = 0; i < grid.meta.height; i++) {
        const k0 = i * grid.meta.width + j;
        for (const a of [grid.slopeP90, grid.slopeMax]) {
          const d = slopeDeg(a[k0]!);
          if (isFlank) {
            expect(d).toBeGreaterThan(hardVehicle);
            expect(d).toBeLessThanOrEqual(hardCrewTest);
            expect(d).toBe(shape.flankDeg);
          } else {
            expect(d).toBe(0);
          }
        }
        expect(grid.flags[k0]).toBe(0);
      }
    }
    expect(flankCols.length).toBe(2 * shape.flankCells);
  });

  it("the crew is on the plateau; the vehicle and the west foot are flat", () => {
    expect(Math.abs(shape.crew.x_m)).toBeLessThanOrEqual(shape.plateauHalfCells * c);
    expect(shape.plateau.xMin).toBe(-shape.plateauHalfCells * c);
    expect(shape.plateau.xMax).toBe(shape.plateauHalfCells * c);
    expect(shape.crew.x_m).toBeGreaterThanOrEqual(shape.plateau.xMin);
    expect(shape.crew.x_m).toBeLessThanOrEqual(shape.plateau.xMax);
    expect(slopeDeg(grid.slopeP90[idx(grid, shape.crew)]!)).toBe(0);
    expect(slopeDeg(grid.slopeP90[idx(grid, shape.vehicle)]!)).toBe(0);
    expect(grid.elevation[idx(grid, shape.vehicle)]).toBe(0);
    expect(shape.vehicle.x_m).toBeLessThan(shape.westFootX_m);
    expect(shape.footCell.x_m).toBe(shape.westFootX_m);
    expect(slopeDeg(grid.slopeP90[idx(grid, shape.footCell)]!)).toBe(0);
    expect(grid.elevation[idx(grid, shape.footCell)]).toBe(0);
    // The foot is on the crew/hab row, in the first flat column outside the west flank.
    expect(shape.footCell.y_m).toBe(shape.crew.y_m);
    expect(rowOf(grid, idx(grid, shape.footCell))).toBe(rowOf(grid, idx(grid, shape.crew)));
    expect(shape.westFootX_m).toBe(-(shape.plateauHalfCells + shape.flankCells + 1) * c);
    const east = { x_m: shape.footCell.x_m + c, y_m: shape.footCell.y_m };
    expect(slopeDeg(grid.slopeP90[idx(grid, east)]!)).toBe(shape.flankDeg);
  });

  it("neighbouring flank cells differ in height by tan(flank) x cell size; plateau is level", () => {
    const rise = Math.tan((shape.flankDeg * Math.PI) / 180) * c;
    const row = rowOf(grid, idx(grid, shape.crew));
    const base = row * grid.meta.width;
    const j0 = colOf(grid, idx(grid, shape.crew));
    const P = shape.plateauHalfCells;
    const F = shape.flankCells;
    for (let k = -P; k < P; k++) expect(grid.elevation[base + j0 + k]).toBe(grid.elevation[base + j0 + k + 1]);
    for (let k = P; k < P + F + 1; k++) {
      const east = grid.elevation[base + j0 + k]! - grid.elevation[base + j0 + k + 1]!;
      const west = grid.elevation[base + j0 - k]! - grid.elevation[base + j0 - k - 1]!;
      expect(east).toBeCloseTo(k < P + F ? rise : 0, 4);
      expect(west).toBeCloseTo(k < P + F ? rise : 0, 4);
    }
    // Same profile in every row: the ridge cannot be driven around inside the grid.
    for (let i = 1; i < grid.meta.height; i++) {
      expect(same(grid.elevation.subarray(i * grid.meta.width, (i + 1) * grid.meta.width), grid.elevation.subarray(0, grid.meta.width))).toBe(true);
    }
  });

  it("uses 10 m cells so the vehicle aggregate is the identity", () => {
    expect(c).toBe(10);
  });
});

describe("rendezvousBlockedVehicle (02 §D.10: vehicle blocked entirely)", () => {
  const { grid, shape } = rendezvousBlockedVehicle();
  const vk = idx(grid, shape.vehicle);
  const vi = rowOf(grid, vk);
  const vj = colOf(grid, vk);
  const R = shape.ringHalfCells;
  const isHazard = (i: number, j: number) => (grid.flags[i * grid.meta.width + j]! & HAZARD) !== 0;
  const cheb = (i: number, j: number) => Math.max(Math.abs(i - vi), Math.abs(j - vj));

  it("the ring at Chebyshev distance 2 is 16 hazard cells and no other cell is a hazard", () => {
    expect(R).toBe(2);
    let n = 0;
    for (let i = 0; i < grid.meta.height; i++) {
      for (let j = 0; j < grid.meta.width; j++) {
        const h = isHazard(i, j);
        expect(h).toBe(cheb(i, j) === R);
        if (h) n++;
      }
    }
    expect(n).toBe(16);
  });

  it("the vehicle cell, its 3 x 3 interior and the crew cell are free", () => {
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) expect(isHazard(vi + di, vj + dj)).toBe(false);
    expect(isHazard(rowOf(grid, idx(grid, shape.crew)), colOf(grid, idx(grid, shape.crew)))).toBe(false);
    expect(shape.crew).toEqual({ x_m: 0, y_m: 0 });
    expect(shape.vehicle).toEqual({ x_m: -500, y_m: 0 });
  });

  it("no 8-neighbour step leaves the interior without crossing a hazard (exhaustive over the 5 x 5 box)", () => {
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (let ni = -1; ni <= 1; ni++) {
          for (let nj = -1; nj <= 1; nj++) {
            if (ni === 0 && nj === 0) continue;
            const ti = vi + di + ni;
            const tj = vj + dj + nj;
            if (cheb(ti, tj) > 1) expect(isHazard(ti, tj)).toBe(true);
          }
        }
      }
    }
  });

  it("is flat apart from the ring", () => {
    expect(grid.elevation.every((v) => v === 0)).toBe(true);
    expect(grid.slopeMax.every((v) => v === 0)).toBe(true);
    expect(grid.meta.cell_m).toBe(10);
  });
});

describe("losFlatWall (02 §D.11: flat plane with a single wall)", () => {
  const { grid, shape } = losFlatWall();
  const c = grid.meta.cell_m;

  it("the mast and target heights are the 02 antenna heights; the mast is at the hab", () => {
    expect(MAST_HEIGHT_M).toBe(10);
    expect(SUIT_ANTENNA_M).toBe(2);
    expect(shape.mast).toEqual({ x_m: 0, y_m: 0, height_m: 10 });
    expect(shape.targetHeight_m).toBe(2);
    expect(c).toBe(5);
  });

  it("the wall column is as high as declared in every row, at least the mast height; all other cells are 0", () => {
    expect(shape.wallHeight_m).toBeGreaterThanOrEqual(shape.mast.height_m);
    expect(shape.wallX_m).toBeGreaterThan(shape.mast.x_m);
    let wallCells = 0;
    for (let i = 0; i < grid.meta.height; i++) {
      for (let j = 0; j < grid.meta.width; j++) {
        const k = i * grid.meta.width + j;
        const onWall = fixtureCellCentre(grid.meta, k).x_m === shape.wallX_m;
        if (onWall) wallCells++;
        expect(grid.elevation[k]).toBe(onWall ? shape.wallHeight_m : 0);
        expect(grid.flags[k]).toBe(0);
        expect(grid.slopeP90[k]).toBe(0);
      }
    }
    expect(wallCells).toBe(grid.meta.height);
  });

  it("the first shadowed column is the one just east of the wall, and the grid extends well past it", () => {
    expect(shape.firstShadowX_m).toBe(shape.wallX_m + c);
    const wallCol = colOf(grid, idx(grid, { x_m: shape.wallX_m, y_m: 0 }));
    expect(colOf(grid, idx(grid, { x_m: shape.firstShadowX_m, y_m: 0 }))).toBe(wallCol + 1);
    expect(grid.meta.origin_m[0] + grid.meta.width * c).toBeGreaterThan(shape.firstShadowX_m + 10 * c);
  });
});

describe("losSphere (02 §D.11: curvature test)", () => {
  const { grid, shape } = losSphere();

  it("uses R = 3,396,190 m and reproduces the 02 horizon values (2 m: 3.69 km, 10 m: 8.24 km)", () => {
    expect(MARS_RADIUS_M).toBe(3_396_190);
    expect(shape.R_m).toBe(3_396_190);
    expect(Math.round(shape.horizonTarget_m / 10) / 100).toBe(3.69);
    expect(Math.round(shape.horizonMast_m / 10) / 100).toBe(8.24);
    expect(shape.combinedHorizon_m).toBe(shape.horizonMast_m + shape.horizonTarget_m);
    expect(shape.mast.height_m).toBe(10);
    expect(shape.targetHeight_m).toBe(2);
  });

  it("is a 20 m strip whose east edge lies at least one cell beyond the combined horizon; elevation is 0", () => {
    expect(grid.meta.cell_m).toBe(20);
    expect(grid.meta.height).toBe(3);
    const eastEdge = grid.meta.origin_m[0] + grid.meta.width * grid.meta.cell_m;
    expect(eastEdge - shape.combinedHorizon_m).toBeGreaterThanOrEqual(grid.meta.cell_m);
    expect(grid.elevation.every((v) => v === 0)).toBe(true);
    expect(grid.flags.every((v) => v === 0)).toBe(true);
  });
});
