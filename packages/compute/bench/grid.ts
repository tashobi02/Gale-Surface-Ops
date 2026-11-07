/**
 * Grid builder for the T05b.05 haven benchmark (`haven.bench.ts`; FR-39, NFR-02; docs/specs/02 §F NFR-02 and §D.8).
 *
 * Synthetic benchmark input, never science and never site data. Only the SIZE and the hab position come from the
 * site: the grid covers `aoi.extent_m` of `pipeline/sites/gale_boxwork/site.json` at the 5 m haven cell
 * (`HAVEN_CELL_M`, 02 §D.2), so no cell count is typed here; a non-whole number of cells throws. The cell size lives
 * in a test fixture today (`TODO(decision)`: a shared `ROUTING_CELL_M` constant in `src` would remove the copy).
 *
 * Layout (05 §C RoutingGrid, §E.1): row 0 is north, `origin_m` is the top-left corner (min x, max y). Slope is the
 * u8 degrees x 4 encoding. `commHab` is 255 (no data) because the haven does not read it. No NaN, no NO_DATA.
 *
 * Two terrains, both fully deterministic (no randomness, no clock) and rebuilt from scratch on every call, so a
 * benchmark iteration that builds its own grid cannot be served by the per-grid lattice cache in `haven.ts`:
 *   - "flat":  elevation 0, slope 0, no flags. The fastest realistic input.
 *   - "rough": a sum of three sines; slope from the analytic gradient; a fixed hazard lattice and a low-TI band.
 *
 * Constants of the rough terrain, all "Assumed, bench-only" (invented to give the search sloped, blocked and costlier
 * cells; none is a Mars measurement or a model output, and none may be shown in the UI):
 *
 * | Value | Label |
 * | --- | --- |
 * | Sine amplitudes 8, 6, 3 m; wavelengths 400, 300, 170 m; phase 1 rad on the y term; third wave along x + y | Assumed, bench-only. Gives a few percent of cells above the 15 deg suit limit and most below it |
 * | Slope P90 = slope max = the analytic gradient angle | Assumed, bench-only (a real grid has P90 below max) |
 * | Hazard bars: 8 cells wide, every 53rd column, on every 61st row (row 30) | Assumed, bench-only. About 0.25 % of cells |
 * | Low-TI band: cells with (row + column) mod 97 < 10 | Assumed, bench-only. About 10 % of cells; exercises the 1.3 cost multiplier |
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FLAG_BITS } from "@marswalk/protocol";
import type { RoutingGrid } from "@marswalk/protocol";
import type { LoadedGrid } from "../src/grid";
import { HAVEN_CELL_M } from "../tests/fixtures/v2grids";

const here = dirname(fileURLToPath(import.meta.url));

/** The site whose AOI sets the benchmark's grid size (TASK-03 T03.16 output). */
export const DEFAULT_SITE_PATH = join(here, "../../../pipeline/sites/gale_boxwork/site.json");

export type Terrain = "flat" | "rough";

/** What the benchmark takes from a site: the AOI extent [minx, miny, maxx, maxy] and the hab, in projected metres. */
export interface BenchSite {
  extent_m: [number, number, number, number];
  hab: { x_m: number; y_m: number };
}

/** Mast height of the hab for `RoutingGrid.hab_mast.height_m`: unused by the haven, so a plain 0 placeholder. */
const HAB_MAST_HEIGHT_PLACEHOLDER_M = 0;

const HAZARD_BIT = 1 << FLAG_BITS.HARD_HAZARD;
const LOW_TI_BIT = 1 << FLAG_BITS.LOW_TI;

// Rough terrain: Assumed, bench-only (table in the header).
const WAVES = [
  { amp_m: 8, len_m: 400, kx: 1, ky: 0, phase: 0 },
  { amp_m: 6, len_m: 300, kx: 0, ky: 1, phase: 1 },
  { amp_m: 3, len_m: 170, kx: 1, ky: 1, phase: 0 },
] as const;
const HAZARD_ROW_PERIOD = 61;
const HAZARD_ROW = 30;
const HAZARD_COL_PERIOD = 53;
const HAZARD_BAR_CELLS = 8;
const LOW_TI_PERIOD = 97;
const LOW_TI_CELLS = 10;

/** Read the AOI extent and the hab from a site file. Throws if the file or a field is missing or not finite. */
export function readBenchSite(path: string = DEFAULT_SITE_PATH): BenchSite {
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    aoi?: { extent_m?: unknown };
    hab_mast?: { x_m?: unknown; y_m?: unknown };
  };
  const ext = raw.aoi?.extent_m;
  if (!Array.isArray(ext) || ext.length !== 4 || !ext.every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new Error(`${path}: aoi.extent_m must be four finite numbers`);
  }
  const hab = raw.hab_mast;
  if (typeof hab?.x_m !== "number" || typeof hab.y_m !== "number" || !Number.isFinite(hab.x_m) || !Number.isFinite(hab.y_m)) {
    throw new Error(`${path}: hab_mast.x_m and hab_mast.y_m must be finite numbers`);
  }
  return { extent_m: [ext[0], ext[1], ext[2], ext[3]], hab: { x_m: hab.x_m, y_m: hab.y_m } };
}

/** Grid width and height in cells: extent / cell. Throws unless both are positive whole numbers. */
export function benchGridSize(
  extent_m: readonly [number, number, number, number],
  cell_m: number,
): { width: number; height: number } {
  if (!(cell_m > 0) || !Number.isFinite(cell_m)) throw new RangeError(`cell size must be a positive number, got ${cell_m}`);
  const [minx, miny, maxx, maxy] = extent_m;
  const w = (maxx - minx) / cell_m;
  const h = (maxy - miny) / cell_m;
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) {
    throw new RangeError(`extent [${extent_m.join(", ")}] has no positive size`);
  }
  if (!Number.isInteger(w) || !Number.isInteger(h)) {
    throw new RangeError(`extent [${extent_m.join(", ")}] is not a whole number of ${cell_m} m cells (${w} x ${h})`);
  }
  return { width: w, height: h };
}

/** Elevation (m) and its gradient (dz/dx, dz/dy) of the rough surface at a point, analytically. */
function roughSurface(x_m: number, y_m: number): { z: number; dzdx: number; dzdy: number } {
  let z = 0;
  let dzdx = 0;
  let dzdy = 0;
  for (const w of WAVES) {
    const k = (2 * Math.PI) / w.len_m;
    const arg = k * (w.kx * x_m + w.ky * y_m) + w.phase;
    z += w.amp_m * Math.sin(arg);
    const d = w.amp_m * k * Math.cos(arg);
    dzdx += d * w.kx;
    dzdy += d * w.ky;
  }
  return { z, dzdx, dzdy };
}

/** u8 slope encoding: degrees x 4, kept below the 255 no-data code. */
function encodeSlope(deg: number): number {
  return Math.min(254, Math.round(deg * 4));
}

/**
 * Build a fresh grid of the site's AOI size and the chosen terrain. Throws if the extent is not a whole number of
 * cells or if the hab lies outside the extent. Never returns a shared or cached object.
 */
export function buildBenchGrid(site: BenchSite, terrain: Terrain, cell_m: number = HAVEN_CELL_M): LoadedGrid {
  const { width, height } = benchGridSize(site.extent_m, cell_m);
  const [minx, miny, maxx, maxy] = site.extent_m;
  if (!(site.hab.x_m >= minx && site.hab.x_m < maxx && site.hab.y_m > miny && site.hab.y_m <= maxy)) {
    throw new RangeError(`hab (${site.hab.x_m}, ${site.hab.y_m}) is outside the extent [${site.extent_m.join(", ")}]`);
  }
  const n = width * height;
  const meta: RoutingGrid = {
    cell_m,
    width,
    height,
    origin_m: [minx, maxy],
    row_order: "north_up",
    elevation_asset: "",
    slope_p90_asset: "",
    slope_max_asset: "",
    flags_asset: "",
    comm_hab_asset: "",
    hab_mast: { x_m: site.hab.x_m, y_m: site.hab.y_m, height_m: HAB_MAST_HEIGHT_PLACEHOLDER_M },
  };
  const grid: LoadedGrid = {
    meta,
    elevation: new Float32Array(n),
    slopeP90: new Uint8Array(n),
    slopeMax: new Uint8Array(n),
    flags: new Uint8Array(n),
    commHab: new Uint8Array(n).fill(255),
  };
  if (terrain === "flat") return grid;

  for (let i = 0; i < height; i++) {
    const y = maxy - (i + 0.5) * cell_m;
    for (let j = 0; j < width; j++) {
      const x = minx + (j + 0.5) * cell_m;
      const k = i * width + j;
      const s = roughSurface(x, y);
      grid.elevation[k] = s.z;
      const slope = encodeSlope((Math.atan(Math.hypot(s.dzdx, s.dzdy)) * 180) / Math.PI);
      grid.slopeP90[k] = slope;
      grid.slopeMax[k] = slope;
      let flags = 0;
      if (i % HAZARD_ROW_PERIOD === HAZARD_ROW && j % HAZARD_COL_PERIOD < HAZARD_BAR_CELLS) flags |= HAZARD_BIT;
      if ((i + j) % LOW_TI_PERIOD < LOW_TI_CELLS) flags |= LOW_TI_BIT;
      grid.flags[k] = flags;
    }
  }
  return grid;
}
