/**
 * Synthetic routing grids for compute core unit tests (docs/specs/02 §D.2, 05 §C; map §e F1).
 * FR-07. Implemented by TASK-05 (T05.02). Contract C4 v1.
 *
 * Rules:
 * - Every value is derived in code from declared geometric parameters or spec reference constants.
 * - No slope or elevation is typed by hand (Fixture value rule, ADR-006).
 * - cell_m, width, height, and origin_m are parameters; 5 m cell size is never hardcoded.
 */

import { FLAG_BITS, type LoadedGridMeta } from "@marswalk/protocol";
import type { LoadedGrid } from "@marswalk/compute";

/**
 * Working projection of the synthetic grids: the byte-identical `crs.proj4` of `data/sites/mock_site/site-manifest.json`
 * (05 §E.3; BD-45). A fixture value, not a Gale value (the real site centres on lat -4.81).
 */
export const FIXTURE_PROJ4 =
  "+proj=eqc +lat_ts=-4.70 +lat_0=-4.70 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs";

/** u8 representation of no-data (05 §C Asset / RoutingGrid). */
export const U8_NODATA = 255;

/** Scale factor for slope encoding: degrees × 4 (05 §C RoutingGrid; 0.25° steps). */
export const SLOPE_SCALE = 4;

/** Standard placeholder for thermal inertia (tiu). */
export const PLACEHOLDER_TI_TIU = 300.0;

export interface SyntheticGridOptions {
  width: number;
  height: number;
  cell_m: number;
  origin_m?: [number, number];
  includeTi?: boolean;
  hab_mast?: { x_m: number; y_m: number; height_m: number };
}

export interface PlaneGridOptions extends SyntheticGridOptions {
  /** Uniform slope in degrees (02 §D.3: e.g. 10°). Defaults to 10. */
  slope_deg?: number;
  /** Direction along which elevation rises: "east" (col increases) or "north" (row decreases). Defaults to "east". */
  direction?: "east" | "north";
}

export interface WallWithGapGridOptions extends SyntheticGridOptions {
  /** Column index where the wall is placed. Defaults to Math.floor(width / 2). */
  wall_col?: number;
  /** Row index where the single passable gap is placed. Defaults to Math.floor(height / 2). */
  gap_row?: number;
  /** Wall slope in degrees (02 §D.2: 20° case > 15° limit). Defaults to 20. */
  wall_slope_deg?: number;
}

export interface RampGridOptions extends SyntheticGridOptions {
  /** Uniform ramp slope in degrees (02 §D.2: 20° ramp > 15° limit). Defaults to 20. */
  ramp_slope_deg?: number;
  /** Direction along which the ramp rises: defaults to "east". */
  direction?: "east" | "north";
}

export interface NanIslandGridOptions extends SyntheticGridOptions {
  /** Top-left row index of the NaN island. Defaults to Math.floor(height / 3). */
  island_row?: number;
  /** Top-left column index of the NaN island. Defaults to Math.floor(width / 3). */
  island_col?: number;
  /** Width in cells of the NaN island. Defaults to Math.max(1, Math.floor(width / 3)). */
  island_width?: number;
  /** Height in cells of the NaN island. Defaults to Math.max(1, Math.floor(height / 3)). */
  island_height?: number;
}

export interface HazardWallGridOptions extends SyntheticGridOptions {
  /** Column index of the hazard wall. Defaults to Math.floor(width / 2). */
  wall_col?: number;
  /** Optional gap row index in the hazard wall. If omitted, the wall is continuous. */
  gap_row?: number;
}

function createMeta(options: SyntheticGridOptions): LoadedGridMeta {
  const origin_m: [number, number] = options.origin_m ?? [0, 0];
  const hab_mast = options.hab_mast ?? {
    x_m: origin_m[0],
    y_m: origin_m[1],
    height_m: 10.0,
  };

  const meta: LoadedGridMeta = {
    cell_m: options.cell_m,
    width: options.width,
    height: options.height,
    origin_m,
    row_order: "north_up",
    elevation_asset: "asset-synthetic-elevation-f32",
    slope_p90_asset: "asset-synthetic-slope-p90-u8",
    slope_max_asset: "asset-synthetic-slope-max-u8",
    flags_asset: "asset-synthetic-flags-u8",
    comm_hab_asset: "asset-synthetic-comm-hab-u8",
    hab_mast,
    proj4: FIXTURE_PROJ4,
  };

  if (options.includeTi !== false) {
    meta.ti_asset = "asset-synthetic-ti-100m-f32";
    meta.ti_cell_m = 100.0;
  }

  return meta;
}

function createBaseGrid(options: SyntheticGridOptions): LoadedGrid {
  const meta = createMeta(options);
  const size = options.width * options.height;
  const elevation = new Float32Array(size);
  const slopeP90 = new Uint8Array(size);
  const slopeMax = new Uint8Array(size);
  const flags = new Uint8Array(size);
  const commHab = new Uint8Array(size).fill(1);
  const ti = options.includeTi !== false ? new Float32Array(size).fill(PLACEHOLDER_TI_TIU) : undefined;

  return {
    meta,
    elevation,
    slopeP90,
    slopeMax,
    flags,
    commHab,
    ti,
  };
}

/**
 * 10° plane fixture (02 §D.3 walking time test case: 1 km at constant +10° gradient).
 * Slope is uniform across the grid; elevation increases along the specified direction.
 */
export function makePlaneGrid(options: PlaneGridOptions): LoadedGrid {
  const grid = createBaseGrid(options);
  const slope_deg = options.slope_deg ?? 10;
  const slope_u8 = Math.min(254, Math.round(slope_deg * SLOPE_SCALE));
  const gradient = Math.tan((slope_deg * Math.PI) / 180);
  const direction = options.direction ?? "east";

  for (let r = 0; r < options.height; r++) {
    for (let c = 0; c < options.width; c++) {
      const idx = r * options.width + c;
      const step_count = direction === "east" ? c : options.height - 1 - r;
      grid.elevation[idx] = step_count * options.cell_m * gradient;
      grid.slopeP90[idx] = slope_u8;
      grid.slopeMax[idx] = slope_u8;
    }
  }

  return grid;
}

/**
 * Wall with one gap fixture (02 §D.2 validation case 1: wall containing one gap -> route passes through gap).
 * A column wall of 20° slope (> 15° hard limit) with a single 0° passable cell at gap_row.
 */
export function makeWallWithGapGrid(options: WallWithGapGridOptions): LoadedGrid {
  const grid = createBaseGrid(options);
  const wall_col = options.wall_col ?? Math.floor(options.width / 2);
  const gap_row = options.gap_row ?? Math.floor(options.height / 2);
  const wall_slope_deg = options.wall_slope_deg ?? 20;
  const wall_slope_u8 = Math.min(254, Math.round(wall_slope_deg * SLOPE_SCALE));

  for (let r = 0; r < options.height; r++) {
    for (let c = 0; c < options.width; c++) {
      const idx = r * options.width + c;
      if (c === wall_col && r !== gap_row) {
        grid.slopeP90[idx] = wall_slope_u8;
        grid.slopeMax[idx] = wall_slope_u8;
        grid.elevation[idx] = 10.0;
        grid.commHab[idx] = 0;
      } else {
        grid.slopeP90[idx] = 0;
        grid.slopeMax[idx] = 0;
        grid.elevation[idx] = 0.0;
        grid.commHab[idx] = 1;
      }
    }
  }

  return grid;
}

/**
 * Uniform 20° ramp fixture (02 §D.2 validation case 2: uniform 20° ramp with 15° limit -> DISCONNECTED_BY_SLOPE).
 * Every cell has 20° slope, exceeding default 15° limit.
 */
export function makeRampGrid(options: RampGridOptions): LoadedGrid {
  const grid = createBaseGrid(options);
  const ramp_slope_deg = options.ramp_slope_deg ?? 20;
  const ramp_slope_u8 = Math.min(254, Math.round(ramp_slope_deg * SLOPE_SCALE));
  const gradient = Math.tan((ramp_slope_deg * Math.PI) / 180);
  const direction = options.direction ?? "east";

  for (let r = 0; r < options.height; r++) {
    for (let c = 0; c < options.width; c++) {
      const idx = r * options.width + c;
      const step_count = direction === "east" ? c : options.height - 1 - r;
      grid.elevation[idx] = step_count * options.cell_m * gradient;
      grid.slopeP90[idx] = ramp_slope_u8;
      grid.slopeMax[idx] = ramp_slope_u8;
    }
  }

  return grid;
}

/**
 * NaN island fixture (02 §D.2: NaN island usable as a barrier around a target / NO_DATA validation).
 * A rectangular patch of cells marked with NaN elevation, 255 no-data slope, and NO_DATA flag.
 */
export function makeNanIslandGrid(options: NanIslandGridOptions): LoadedGrid {
  const grid = createBaseGrid(options);
  const island_row = options.island_row ?? Math.floor(options.height / 3);
  const island_col = options.island_col ?? Math.floor(options.width / 3);
  const island_width = options.island_width ?? Math.max(1, Math.floor(options.width / 3));
  const island_height = options.island_height ?? Math.max(1, Math.floor(options.height / 3));
  const noDataFlag = (1 << FLAG_BITS.NO_DATA) | (1 << FLAG_BITS.TI_UNKNOWN);

  for (let r = 0; r < options.height; r++) {
    for (let c = 0; c < options.width; c++) {
      const idx = r * options.width + c;
      const inside =
        r >= island_row &&
        r < island_row + island_height &&
        c >= island_col &&
        c < island_col + island_width;

      if (inside) {
        grid.elevation[idx] = Number.NaN;
        grid.slopeP90[idx] = U8_NODATA;
        grid.slopeMax[idx] = U8_NODATA;
        grid.flags[idx] = noDataFlag;
        grid.commHab[idx] = U8_NODATA;
        if (grid.ti) {
          grid.ti[idx] = Number.NaN;
        }
      } else {
        grid.elevation[idx] = 0.0;
        grid.slopeP90[idx] = 0;
        grid.slopeMax[idx] = 0;
        grid.flags[idx] = 0;
        grid.commHab[idx] = 1;
      }
    }
  }

  return grid;
}

/**
 * Hazard wall fixture (02 §D.2: barrier cells with HARD_HAZARD flag bit set).
 */
export function makeHazardWallGrid(options: HazardWallGridOptions): LoadedGrid {
  const grid = createBaseGrid(options);
  const wall_col = options.wall_col ?? Math.floor(options.width / 2);
  const hazardFlag = 1 << FLAG_BITS.HARD_HAZARD;

  for (let r = 0; r < options.height; r++) {
    for (let c = 0; c < options.width; c++) {
      const idx = r * options.width + c;
      const is_hazard = c === wall_col && (options.gap_row === undefined || r !== options.gap_row);

      if (is_hazard) {
        grid.flags[idx] = hazardFlag;
      } else {
        grid.flags[idx] = 0;
      }
      grid.slopeP90[idx] = 0;
      grid.slopeMax[idx] = 0;
      grid.elevation[idx] = 0.0;
      grid.commHab[idx] = 1;
    }
  }

  return grid;
}

/**
 * Return a copy of any LoadedGrid with the TI sidecar stripped (05 §E.6 unavailable TI layer).
 */
export function withoutTi(grid: LoadedGrid): LoadedGrid {
  const { ti_asset: _a, ti_cell_m: _c, ...restMeta } = grid.meta;
  return {
    ...grid,
    meta: restMeta as LoadedGridMeta,
    ti: undefined,
  };
}
