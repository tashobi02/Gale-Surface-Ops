/**
 * Fixture F9: synthetic v2 grids for the 02 §D.8, §D.10 and §D.11 validation cases
 * (T05b.02; FR-39, FR-40, FR-42; docs/specs/02 §F.2). Consumers: T05b.03 to T05b.18.
 *
 * Synthetic test inputs, never science. Taken over from Mishkat Ahmed Khan by agreement (7 Nov 2026).
 * Every grid is built directly as a `LoadedGrid`: this file calls no function from `src` (`loadGrid`,
 * `cellIndex`, `decodeSlopeDeg` and `horizonDistanceM` are still stubs). The only `src` import is the
 * constant MARS_RADIUS_M. Generators are pure and return fresh arrays, so a test may mutate them.
 * There is no randomness. Expected test outputs are NOT here: the consumers derive them from the shape.
 *
 * Layout shared by all grids (05 §C RoutingGrid, §E.1; Mars CRS in projected metres, no Earth radius):
 * row 0 is north, `origin_m` is the top-left corner, and the cell containing (0, 0), the hab, is
 * (row cellsNorth, column cellsWest), so its centre is exactly (0, 0). Elevation is 0 m, slope 0 deg and
 * flags 0 except where a generator says otherwise. Slope is the u8 degrees x 4 encoding. `ti` is absent and
 * no TI bit is set (no TI multiplier). `commHab` is all 255 (the 05 no-data code): the fixture computes no
 * viewshed, link tests overwrite it. No NO_DATA cell and no NaN anywhere. Asset ids are "" placeholders.
 *
 * Source table (fixture value rule, _coordination.md §e; one row per non-placeholder value).
 * "Proposed" = a declared synthetic shape choice that no spec fixes; none is a science value.
 *
 * | Value | Source |
 * | --- | --- |
 * | Hab at the origin (0, 0) | 02 §D.8 validation: "hab at origin" |
 * | Crew 1000 m from the hab | 02 §D.8: "crew 1 km from hab" |
 * | Vehicle 2000 m from the hab, on flat ground | 02 §D.8: "vehicle 2 km away on flat ground" |
 * | Crew east (+1000, 0), vehicle west (-2000, 0) | Proposed. Opposite sides, so one geometry serves both D.8 vehicle cases and only the vehicle speed decides: a vehicle east of the crew would stay near the crew and could win even when slower than walking. Consumers derive the times in the test |
 * | Haven cell size 5 m | 02 §D.2 "8-connected 5 m grid". The 10 m vehicle aggregate (02 §D.8) is then a real step |
 * | Haven extent x -2200..+1200, y -600..+600 m | Proposed: 200 m margin past the vehicle and the crew, 600 m either side (681 x 241 cells at 5 m) |
 * | Detour wall: x = +500, |y| <= 300, 1 cell thick, HARD_HAZARD, elevation 0 | Proposed: halfway between hab and crew; "blocked wall forcing detour" is 02 §D.8. A 1-cell axis-aligned wall cannot be crossed by a diagonal step (the self-check floods the grid with 8 moves to prove it) |
 * | Slow vehicle: flat_speed_kmh 2 | 02 §D.9 utility-rover flat speed (2 km/h), below the suited 3.3 km/h. The rest of the set is the 05 §F.5 pr1-assumed set; `source_ids` is empty because 2 km/h is not from the SEV fact sheet. Proposed as a stand-in for "vehicle slower than walking" |
 * | Scenario | 05 §F.3 example scenario verbatim (loop true is also the 05 default) plus the v2 defaults of 05 §C: max_haven_min 30, crew_count 2, vehicle_available true, vehicle_param_set "pr1-assumed" |
 * | pr1Params | 05 §F.5 verbatim |
 * | Ridge cell size 10 m | Proposed: the vehicle aggregate (02 §D.8, D.10) is the identity, so the case isolates the ridge |
 * | Ridge: 10 cells plateau half-width, 10 cells flank, 25 deg flank | Proposed. 25 deg is strictly between the pr1 hard limit 20 deg (05 §F.5) and the 02 §E.3 maximum crew limit 35 deg; it is also the 02 §D.9 utility-rover hard limit, used here only as a shape number. Encodes exactly as u8 100 |
 * | Ridge profile: z = tan(25 deg) x cell x clamp(10 + 10 - abs(k), 0, 10), same in every row | Proposed. The slope label (flank cells only) decides passability; the elevation gives the height steps for step costs. The ridge crosses the full grid height, so it cannot be driven around |
 * | Ridge extent x -800..+800, y -300..+300 m; crew (0, 0) on the plateau; vehicle (-400, 0) on flat ground west | Proposed. The foot is the optimum only if the vehicle reaches it first, hence 400 m; T05b.06 asserts that precondition from derived times |
 * | Crew test hard slope limit 35 deg (`ridgeScenario`) | 02 §E.3 range maximum (5 to 35 deg). Needed because of the spec gap below |
 * | Blocked vehicle: 1-cell HARD_HAZARD ring at Chebyshev distance 2 around the vehicle cell (16 cells, 3 x 3 interior) | Proposed; a hazard flag rather than a slope blocks it. Vehicle (-500, 0), crew (0, 0), 10 m cells, x -800..+800, y -300..+300 m |
 * | Mast 10 m | 02 §D.11 "10 m -> 8.24 km" and the 05 RoutingGrid hab_mast example height_m 10 |
 * | Target (suit) antenna 2 m | 02 §D.9 antenna height row, 02 §D.11 "2 m -> 3.69 km" |
 * | LOS grid 5 m | 02 §D.11: static viewshed "on the 5 m grid" |
 * | LOS extent x -500..+1500, y -250..+250 m; wall at x = +500, 20 m high, full grid height, 1 cell thick, as elevation (no flag) | Proposed. The wall is at least the mast height, so every cell behind it is shadowed at any distance. First shadowed column = wall x + 1 cell |
 * | Sphere grid 20 m, 3 rows | 02 §D.11: dynamic viewshed "20 m grid". Strip length Proposed (1.25 x combined horizon), computed below |
 * | R = 3,396,190 m | 02 §D.11, imported as MARS_RADIUS_M; the self-check asserts the literal |
 * | Sphere elevation 0 m everywhere | Proposed, confirm with the T05b.08 owner. Heights are above the IAU_2015:49900 sphere, so a perfect sphere sampled in the working projection has height 0; the curvature comes from the d^2 / 2R drop in `lineOfSight`. Putting it into the elevations too would count it twice |
 *
 * 10 m CELL CENTRES: the declared points (hab, crew, vehicle) are cell centres at 5 m, and at 10 m when a grid is
 * built natively at 10 m (`havenFlat(10)`). They are NOT 10 m centres of a 2 x 2 aggregate of the default 5 m
 * haven grid: that grid has odd width 681 and height 241 and origin x -2202.5 m, and with the origin cell
 * centred on (0, 0) any 2 x 2 block has its centre on a 5 m cell corner, 2.5 m from a declared point. (An even
 * size does not help: the points cannot be centres at both 5 m and the 2 x 2 aggregate lattice.) T05b.04's
 * aggregation rule must handle that offset, and its tests need a tolerance of at least 2.5 m there.
 *
 * Spec gap, decided (BD-57, orchestrator, 13 Nov 2026): at the default limits
 * (suit 15 deg, 02 §D.9 and §E.3; pressurized rover 20 deg) the D.10 validation "crew on a ridge the vehicle
 * cannot climb" cannot be built: any flank steeper than 20 deg is also above the crew's 15 deg, so the crew
 * could not stand on, or leave, the ridge. The fixture keeps the 25 deg flank and relies on `ridgeScenario()`
 * (crew hard limit 35 deg, the 02 §E.3 maximum). The other design (keep the default crew limits of 15 deg and give
 * the vehicle a low-limit ParamSet, hard limit below the crew's) was not chosen: the 35 deg design is kept. Exact boundary cells of a horizon are unreliable in Float32:
 * LOS tests should assert cells clearly inside and outside it.
 */
import { FLAG_BITS } from "@marswalk/protocol";
import type { LoadedGridMeta, MissionScenario, ParamSet, RoutingGrid } from "@marswalk/protocol";
import type { LoadedGrid } from "../../src/grid";
import { MARS_RADIUS_M } from "../../src/viewshed";

// ---------------------------------------------------------------------------
// Declared shape constants (sources in the table above)
// ---------------------------------------------------------------------------

export interface XY {
  x_m: number;
  y_m: number;
}

export const HAB_XY: XY = Object.freeze({ x_m: 0, y_m: 0 });
export const CREW_FROM_HAB_M = 1000;
export const VEHICLE_FROM_HAB_M = 2000;
export const CREW_XY: XY = Object.freeze({ x_m: CREW_FROM_HAB_M, y_m: 0 });
export const VEHICLE_XY: XY = Object.freeze({ x_m: -VEHICLE_FROM_HAB_M, y_m: 0 });
export const MAST_HEIGHT_M = 10;
export const SUIT_ANTENNA_M = 2;

export const HAVEN_CELL_M = 5;
const HAVEN_WEST_M = 2200;
const HAVEN_EAST_M = 1200;
const HAVEN_HALF_NS_M = 600;
export const DETOUR_WALL_X_M = 500;
export const DETOUR_WALL_HALF_LEN_M = 300;

export const RIDGE_CELL_M = 10;
export const RIDGE_FLANK_DEG = 25;
export const RIDGE_PLATEAU_HALF_CELLS = 10;
export const RIDGE_FLANK_CELLS = 10;
const RIDGE_HALF_X_M = 800;
const RIDGE_HALF_Y_M = 300;
const RIDGE_VEHICLE_X_M = -400;

export const BLOCKED_RING_HALF_CELLS = 2;
const BLOCKED_VEHICLE_X_M = -500;

export const LOS_CELL_M = 5;
const LOS_WEST_M = 500;
const LOS_EAST_M = 1500;
const LOS_HALF_NS_M = 250;
export const LOS_WALL_X_M = 500;
export const LOS_WALL_HEIGHT_M = 20;

export const SPHERE_CELL_M = 20;
const SPHERE_MARGIN = 1.25;
const SPHERE_WEST_CELLS = 10;

const HAZARD_BIT = 1 << FLAG_BITS.HARD_HAZARD;

// ---------------------------------------------------------------------------
// Types and addressing helpers (fixture-local; 05 §E.1 formulas, no `src` call)
// ---------------------------------------------------------------------------

/** One generated case: the grid, the 02 case it stands for, and the declared shape the tests read. */
export interface V2Fixture<S> {
  name: string;
  /** The 02 validation sentence this case implements. */
  source: string;
  grid: LoadedGrid;
  shape: S;
}

export interface HavenShape {
  hab: XY;
  crew: XY;
  vehicle: XY;
  crewToHab_m: number;
  vehicleToHab_m: number;
}

export interface WallDetourShape extends HavenShape {
  wall: { x_m: number; yMin_m: number; yMax_m: number };
  /** The first free cells just past each wall end, on the wall column. */
  detourCorners: [XY, XY];
}

export interface RidgeShape {
  crew: XY;
  vehicle: XY;
  flankDeg: number;
  plateauHalfCells: number;
  flankCells: number;
  plateau: { xMin: number; xMax: number };
  /** Centre x of the first flat column west of the west flank. */
  westFootX_m: number;
  /** The foot cell on the crew/hab row (y = 0), in the first flat column west of the flank. */
  footCell: XY;
}

export interface BlockedShape {
  crew: XY;
  vehicle: XY;
  ringHalfCells: number;
}

export interface MastShape {
  mast: { x_m: number; y_m: number; height_m: number };
  targetHeight_m: number;
}

export interface LosWallShape extends MastShape {
  wallX_m: number;
  wallHeight_m: number;
  firstShadowX_m: number;
}

export interface SphereShape extends MastShape {
  R_m: number;
  horizonMast_m: number;
  horizonTarget_m: number;
  combinedHorizon_m: number;
}

/** Cell containing a point, per 05 §E.1: i = floor((oy - y) / c), j = floor((x - ox) / c); null outside. */
export function fixtureCellIndex(meta: RoutingGrid, p: XY): number | null {
  const i = Math.floor((meta.origin_m[1] - p.y_m) / meta.cell_m);
  const j = Math.floor((p.x_m - meta.origin_m[0]) / meta.cell_m);
  if (i < 0 || j < 0 || i >= meta.height || j >= meta.width) return null;
  return i * meta.width + j;
}

/** Centre of a cell, in projected metres. */
export function fixtureCellCentre(meta: RoutingGrid, index: number): XY {
  const i = Math.floor(index / meta.width);
  const j = index % meta.width;
  // "+ 0" turns a negative zero into 0 so that tests can compare with toEqual.
  return {
    x_m: meta.origin_m[0] + (j + 0.5) * meta.cell_m + 0,
    y_m: meta.origin_m[1] - (i + 0.5) * meta.cell_m + 0,
  };
}

function cellsFor(metres: number, cell_m: number): number {
  const n = metres / cell_m;
  if (!Number.isInteger(n)) throw new Error(`${metres} m is not a whole number of ${cell_m} m cells`);
  return n;
}

// ---------------------------------------------------------------------------
// Generic flat grid
// ---------------------------------------------------------------------------

export interface FlatGridOptions {
  cell_m: number;
  cellsWest: number;
  cellsEast: number;
  cellsNorth: number;
  cellsSouth: number;
}

/**
 * Flat, hazard-free grid around the origin cell (row cellsNorth, column cellsWest). Also the base of every
 * other generator, and usable by T05b.06 (tie-break, two crew) and T05b.10 (link graph) tests.
 */
export function flatGrid(opts: FlatGridOptions): LoadedGrid {
  const { cell_m, cellsWest, cellsEast, cellsNorth, cellsSouth } = opts;
  if (!(cell_m > 0)) throw new Error("cell_m must be > 0");
  for (const n of [cellsWest, cellsEast, cellsNorth, cellsSouth]) {
    if (!Number.isInteger(n) || n < 0) throw new Error("cell counts must be integers >= 0");
  }
  const width = cellsWest + cellsEast + 1;
  const height = cellsNorth + cellsSouth + 1;
  const n = width * height;
  const meta: LoadedGridMeta = {
    cell_m,
    width,
    height,
    origin_m: [-(cellsWest + 0.5) * cell_m, (cellsNorth + 0.5) * cell_m],
    row_order: "north_up",
    elevation_asset: "",
    slope_p90_asset: "",
    slope_max_asset: "",
    flags_asset: "",
    comm_hab_asset: "",
    hab_mast: { x_m: HAB_XY.x_m, y_m: HAB_XY.y_m, height_m: MAST_HEIGHT_M },
    proj4: V2_FIXTURE_PROJ4,
  };
  return {
    meta,
    elevation: new Float32Array(n),
    slopeP90: new Uint8Array(n),
    slopeMax: new Uint8Array(n),
    flags: new Uint8Array(n),
    commHab: new Uint8Array(n).fill(255),
  };
}

function setHazard(g: LoadedGrid, i: number, j: number): void {
  g.flags[i * g.meta.width + j]! |= HAZARD_BIT;
}

/** Fixture working projection (the mock site manifest's string, 05 §E.3); no v2 test reads a latitude from it. */
const V2_FIXTURE_PROJ4 =
  "+proj=eqc +lat_ts=-4.70 +lat_0=-4.70 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs";

/** u8 encoding of a slope: degrees x 4 (05 §C RoutingGrid). */
function encodeSlope(deg: number): number {
  return Math.round(deg * 4);
}

function haven(cell_m: number): LoadedGrid {
  return flatGrid({
    cell_m,
    cellsWest: cellsFor(HAVEN_WEST_M, cell_m),
    cellsEast: cellsFor(HAVEN_EAST_M, cell_m),
    cellsNorth: cellsFor(HAVEN_HALF_NS_M, cell_m),
    cellsSouth: cellsFor(HAVEN_HALF_NS_M, cell_m),
  });
}

function havenShape(): HavenShape {
  return {
    hab: { ...HAB_XY },
    crew: { ...CREW_XY },
    vehicle: { ...VEHICLE_XY },
    crewToHab_m: CREW_FROM_HAB_M,
    vehicleToHab_m: VEHICLE_FROM_HAB_M,
  };
}

// ---------------------------------------------------------------------------
// Parameter fixtures (needed by the haven and rendezvous signatures)
// ---------------------------------------------------------------------------

/** 05 §F.3 scenario verbatim, plus the 05 §C v2 defaults. A fresh object on every call. */
export function defaultScenario(): MissionScenario {
  return {
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
    vehicle_param_set: "pr1-assumed",
  };
}

/** Crew hard slope limit raised to the 02 §E.3 maximum, 35 deg, for the ridge case (see SPEC GAP above). */
export function ridgeScenario(): MissionScenario {
  return { ...defaultScenario(), hard_slope_limit_deg: 35 };
}

/**
 * The suit ParamSet of `scenarios/storm-sol4190/param_sets/suit-assumed.json` (frozen). `hab_ingress_min` 5 is 02 §D.8
 * `t_ingress` (Assumed), the value the haven code used to carry as a constant (BD-57).
 */
export const suitParams: ParamSet = Object.freeze({
  param_set_id: "suit-assumed",
  kind: "suit",
  title: "Suited crew member",
  values: Object.freeze({
    flat_speed_kmh: 3.3,
    hard_slope_deg: 15,
    caution_slope_deg: 10,
    o2_nominal_h: 8,
    p_walk_w: 351.7,
    p_rest_w: 250,
    p_ref_w: 300,
    antenna_m: 2,
    hab_ingress_min: 5,
  }),
  provenance: "assumed",
  source_ids: Object.freeze(["apollo17-planning", "tobler-1993"]) as unknown as string[],
  note: "02 §D.9 values; hab_ingress_min is 02 §D.8 t_ingress, Assumed",
});

/** 05 §F.5 verbatim (frozen). */
export const pr1Params: ParamSet = Object.freeze({
  param_set_id: "pr1-assumed",
  kind: "pressurized_rover",
  title: "Pressurized rover (SEV-class concept)",
  values: Object.freeze({
    flat_speed_kmh: 10,
    hard_slope_deg: 20,
    caution_slope_deg: 15,
    low_ti_cost: 2.0,
    min_speed_frac: 0.3,
    capacity: 4,
    ingress_min: 5,
    antenna_m: 3,
  }),
  provenance: "assumed",
  source_ids: Object.freeze(["nasa-sev-factsheet-2011"]) as unknown as string[],
  note: "Speed and capacity from the NASA SEV concept; slope limit and ingress are assumptions (02 §D.9, U-20)",
});

/** pr1Params with the flat speed of the 02 §D.9 utility rover, 2 km/h (below walking). Proposed. */
export const slowVehicleParams: ParamSet = Object.freeze({
  ...pr1Params,
  param_set_id: "pr-slow-fixture",
  title: "Pressurized rover, slowed to 2 km/h (test fixture)",
  source_ids: [],
  values: Object.freeze({ ...pr1Params.values, flat_speed_kmh: 2 }),
  provenance: "assumed",
  note: "Test fixture: flat speed 2 km/h = 02 §D.9 utility rover; all other values from pr1-assumed",
});

// ---------------------------------------------------------------------------
// Generators: one per 02 validation case
// ---------------------------------------------------------------------------

/** 02 §D.8: hab at origin, vehicle 2 km away on flat ground, crew 1 km from hab. */
export function havenFlat(cell_m: number = HAVEN_CELL_M): V2Fixture<HavenShape> {
  return {
    name: "havenFlat",
    source: "02 §D.8 validation: hab at origin, vehicle 2 km away on flat ground, crew 1 km from hab",
    grid: haven(cell_m),
    shape: havenShape(),
  };
}

/** 02 §D.8: blocked wall forcing a detour. The wall lies between hab and crew. */
export function havenWallDetour(cell_m: number = HAVEN_CELL_M): V2Fixture<WallDetourShape> {
  const grid = haven(cell_m);
  const { meta } = grid;
  const wallCol = cellsFor(HAVEN_WEST_M, cell_m) + cellsFor(DETOUR_WALL_X_M, cell_m);
  const halfLen = cellsFor(DETOUR_WALL_HALF_LEN_M, cell_m);
  const originRow = cellsFor(HAVEN_HALF_NS_M, cell_m);
  for (let i = originRow - halfLen; i <= originRow + halfLen; i++) setHazard(grid, i, wallCol);
  const cornerY = DETOUR_WALL_HALF_LEN_M + meta.cell_m;
  return {
    name: "havenWallDetour",
    source: "02 §D.8 validation: blocked wall forcing detour",
    grid,
    shape: {
      ...havenShape(),
      wall: { x_m: DETOUR_WALL_X_M, yMin_m: -DETOUR_WALL_HALF_LEN_M, yMax_m: DETOUR_WALL_HALF_LEN_M },
      detourCorners: [
        { x_m: DETOUR_WALL_X_M, y_m: cornerY },
        { x_m: DETOUR_WALL_X_M, y_m: -cornerY },
      ],
    },
  };
}

/** 02 §D.8: vehicle slower than walking (must choose hab). Same grid as havenFlat, plus the slow ParamSet. */
export function havenSlowVehicle(cell_m: number = HAVEN_CELL_M): V2Fixture<HavenShape> & { params: ParamSet } {
  return {
    ...havenFlat(cell_m),
    name: "havenSlowVehicle",
    source: "02 §D.8 validation: vehicle slower than walking (must choose hab)",
    params: slowVehicleParams,
  };
}

/** 02 §D.10: crew on a ridge the vehicle cannot climb, so the rendezvous is at the ridge foot. */
export function rendezvousRidge(cell_m: number = RIDGE_CELL_M): V2Fixture<RidgeShape> {
  const west = cellsFor(RIDGE_HALF_X_M, cell_m);
  const north = cellsFor(RIDGE_HALF_Y_M, cell_m);
  const grid = flatGrid({ cell_m, cellsWest: west, cellsEast: west, cellsNorth: north, cellsSouth: north });
  const { width, height } = grid.meta;
  const P = RIDGE_PLATEAU_HALF_CELLS;
  const F = RIDGE_FLANK_CELLS;
  const rise = Math.tan((RIDGE_FLANK_DEG * Math.PI) / 180) * cell_m;
  const slope = encodeSlope(RIDGE_FLANK_DEG);
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const k = Math.abs(j - west);
      const idx = i * width + j;
      grid.elevation[idx] = rise * Math.min(Math.max(P + F - k, 0), F);
      if (k > P && k <= P + F) {
        grid.slopeP90[idx] = slope;
        grid.slopeMax[idx] = slope;
      }
    }
  }
  const footX = -(P + F + 1) * cell_m;
  return {
    name: "rendezvousRidge",
    source: "02 §D.10 validation: crew on a ridge the vehicle cannot climb => rendezvous at the ridge foot",
    grid,
    shape: {
      crew: { x_m: 0, y_m: 0 },
      vehicle: { x_m: RIDGE_VEHICLE_X_M, y_m: 0 },
      flankDeg: RIDGE_FLANK_DEG,
      plateauHalfCells: P,
      flankCells: F,
      plateau: { xMin: -P * cell_m, xMax: P * cell_m },
      westFootX_m: footX,
      footCell: { x_m: footX, y_m: 0 },
    },
  };
}

/** 02 §D.10: vehicle blocked entirely, so NO_RENDEZVOUS. A closed HARD_HAZARD ring surrounds the vehicle. */
export function rendezvousBlockedVehicle(cell_m: number = RIDGE_CELL_M): V2Fixture<BlockedShape> {
  const west = cellsFor(RIDGE_HALF_X_M, cell_m);
  const north = cellsFor(RIDGE_HALF_Y_M, cell_m);
  const grid = flatGrid({ cell_m, cellsWest: west, cellsEast: west, cellsNorth: north, cellsSouth: north });
  const vi = north;
  const vj = west + cellsFor(BLOCKED_VEHICLE_X_M, cell_m);
  const R = BLOCKED_RING_HALF_CELLS;
  for (let i = vi - R; i <= vi + R; i++) {
    for (let j = vj - R; j <= vj + R; j++) {
      if (Math.max(Math.abs(i - vi), Math.abs(j - vj)) === R) setHazard(grid, i, j);
    }
  }
  return {
    name: "rendezvousBlockedVehicle",
    source: "02 §D.10 validation: vehicle blocked entirely => NO_RENDEZVOUS",
    grid,
    shape: { crew: { x_m: 0, y_m: 0 }, vehicle: { x_m: BLOCKED_VEHICLE_X_M, y_m: 0 }, ringHalfCells: R },
  };
}

/** 02 §D.11: flat synthetic plane with a single wall; the shadow begins exactly behind the wall. */
export function losFlatWall(cell_m: number = LOS_CELL_M): V2Fixture<LosWallShape> {
  const west = cellsFor(LOS_WEST_M, cell_m);
  const north = cellsFor(LOS_HALF_NS_M, cell_m);
  const grid = flatGrid({ cell_m, cellsWest: west, cellsEast: cellsFor(LOS_EAST_M, cell_m), cellsNorth: north, cellsSouth: north });
  const wallCol = west + cellsFor(LOS_WALL_X_M, cell_m);
  for (let i = 0; i < grid.meta.height; i++) grid.elevation[i * grid.meta.width + wallCol] = LOS_WALL_HEIGHT_M;
  return {
    name: "losFlatWall",
    source: "02 §D.11 validation: flat synthetic plane with a single wall: shadow begins exactly behind the wall",
    grid,
    shape: {
      mast: { x_m: 0, y_m: 0, height_m: MAST_HEIGHT_M },
      targetHeight_m: SUIT_ANTENNA_M,
      wallX_m: LOS_WALL_X_M,
      wallHeight_m: LOS_WALL_HEIGHT_M,
      firstShadowX_m: LOS_WALL_X_M + cell_m,
    },
  };
}

/** 02 §D.11: curvature test on a perfect sphere-sampled grid. Elevation is 0 (see the table above). */
export function losSphere(cell_m: number = SPHERE_CELL_M): V2Fixture<SphereShape> {
  const horizonMast = Math.sqrt(2 * MARS_RADIUS_M * MAST_HEIGHT_M);
  const horizonTarget = Math.sqrt(2 * MARS_RADIUS_M * SUIT_ANTENNA_M);
  const combined = horizonMast + horizonTarget;
  const east = Math.ceil((SPHERE_MARGIN * combined) / cell_m);
  const grid = flatGrid({ cell_m, cellsWest: SPHERE_WEST_CELLS, cellsEast: east, cellsNorth: 1, cellsSouth: 1 });
  return {
    name: "losSphere",
    source: "02 §D.11 validation: curvature test on a perfect sphere-sampled grid",
    grid,
    shape: {
      mast: { x_m: 0, y_m: 0, height_m: MAST_HEIGHT_M },
      targetHeight_m: SUIT_ANTENNA_M,
      R_m: MARS_RADIUS_M,
      horizonMast_m: horizonMast,
      horizonTarget_m: horizonTarget,
      combinedHorizon_m: combined,
    },
  };
}
