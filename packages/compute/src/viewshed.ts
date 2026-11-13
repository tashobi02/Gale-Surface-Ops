/**
 * Line-of-sight coverage (docs/specs/02 §D.11; FR-42).
 * Binary LOS with Mars curvature drop d² / 2R, R = 3,396,190 m (IAU_2015:49900 sphere, 02 §C.1).
 * No Fresnel zone, diffraction or link budget. TASK-05b.
 */
import type { Provenance } from "@marswalk/protocol";
import { cellIndex, type LoadedGrid } from "./grid";

/** Mean radius of Mars sphere in metres (IAU_2015:49900, docs/specs/02 §C.1, §D.11). */
export const MARS_RADIUS_M = 3_396_190;

/** Default relay rover viewshed horizon radius in metres (02 §D.11). */
export const RELAY_VIEWSHED_RADIUS_M = 4000;

/** Default relay rover viewshed grid cell size in metres (02 §D.11). */
export const RELAY_VIEWSHED_CELL_M = 20;

/**
 * Fraction of a grid cell used as the ray sampling step in `lineOfSight`. Half a cell keeps consecutive samples
 * no more than one cell apart on an axis-aligned ray, so no cell the ray crosses along its length is skipped; a
 * diagonal ray that only clips a cell corner can still miss it. The spec (02 §D.11) says "ray-cast ... every
 * intermediate sample" but gives no step, so this value is a choice of T05b.09, not a spec number.
 */
export const LOS_STEP_CELL_FRACTION = 0.5;

/**
 * Upper bound of the ray sampling step in metres, for grids with cells coarser than 40 m. Chosen equal to the 20 m
 * relay viewshed cell (02 §D.11) so a coarse grid is never sampled more sparsely than the dynamic viewshed grid.
 * Decided (BD-61, orchestrator, 13 Nov 2026): equal to the 20 m relay viewshed cell of 02 §D.11, so it is a spec-derived value.
 */
export const LOS_MAX_STEP_M = 20;

/**
 * Label every value derived from `lineOfSight` / `viewshed` must carry where it is displayed (T05b.09
 * acceptance; FR-15, NFR-05): `derived`, with the caveat that only geometry is modelled. `viewshed` returns a
 * bare `CoverageGrid`, so the caller (link graph, T26 relay, planner UI) applies this label to what it shows.
 * Frozen.
 */
export const VIEWSHED_LABEL: Readonly<{ provenance: Provenance; note: string }> = Object.freeze({
  provenance: "derived" as Provenance,
  note: "radio propagation not modelled beyond line of sight",
});

/** Coverage grid returned by viewshed analysis (TASK-05b / C15 contract proposal). */
export interface CoverageGrid {
  cell_m: number;
  width: number;
  height: number;
  origin_m: [number, number];
  visible: Uint8Array;
}

/**
 * Horizon distance for an antenna height h on a smooth Mars sphere: √(2Rh).
 * (docs/specs/02 §D.11).
 */
export function horizonDistanceM(height_m: number): number {
  if (!Number.isFinite(height_m) || height_m < 0) {
    throw new RangeError(`height_m must be a non-negative finite number, got ${height_m}`);
  }
  return Math.sqrt(2 * MARS_RADIUS_M * height_m);
}

/**
 * Is target visible from source? Heights are above local terrain (02 §D.11).
 * Evaluates binary line-of-sight with intermediate terrain and Mars curvature drop:
 *   effective_terrain_z = elevation + (t * (1 - t) * d²) / (2R)
 * Target is visible if no intermediate sample exceeds the line-of-sight ray.
 */
export function lineOfSight(
  grid: LoadedGrid,
  from: { x_m: number; y_m: number; height_m: number },
  to: { x_m: number; y_m: number; height_m: number },
): boolean {
  if (
    !Number.isFinite(from.x_m) ||
    !Number.isFinite(from.y_m) ||
    !Number.isFinite(from.height_m) ||
    !Number.isFinite(to.x_m) ||
    !Number.isFinite(to.y_m) ||
    !Number.isFinite(to.height_m)
  ) {
    return false;
  }

  const startIdx = cellIndex(grid, from.x_m, from.y_m);
  if (startIdx === null) return false;
  const z1 = grid.elevation[startIdx];
  if (!Number.isFinite(z1)) return false;

  const endIdx = cellIndex(grid, to.x_m, to.y_m);
  if (endIdx === null) return false;
  const z2 = grid.elevation[endIdx];
  if (!Number.isFinite(z2)) return false;

  const dx = to.x_m - from.x_m;
  const dy = to.y_m - from.y_m;
  const dist = Math.hypot(dx, dy);

  if (dist === 0) return true;

  const H1 = z1 + from.height_m;
  const H2 = z2 + to.height_m;

  // Step along the ray: LOS_STEP_CELL_FRACTION of a cell, at most LOS_MAX_STEP_M.
  const step = Math.min(grid.meta.cell_m * LOS_STEP_CELL_FRACTION, LOS_MAX_STEP_M);
  const steps = Math.max(1, Math.ceil(dist / step));

  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    const x = from.x_m + t * dx;
    const y = from.y_m + t * dy;

    const idx = cellIndex(grid, x, y);
    if (idx === null) return false;

    const z = grid.elevation[idx];
    if (!Number.isFinite(z)) return false;

    // Curvature bulge above the chord line: t * (1 - t) * d^2 / (2 * R)
    const curvatureDrop = (t * (1 - t) * dist * dist) / (2 * MARS_RADIUS_M);
    const effectiveTerrainZ = z + curvatureDrop;
    const rayZ = H1 + t * (H2 - H1);

    if (effectiveTerrainZ > rayZ) {
      return false;
    }
  }

  return true;
}

/**
 * Viewshed on a coarse grid within `radius_m` of a transmitter (docs/specs/02 §D.11).
 * 1 = line of sight to transmitter, 0 = shadowed or outside radius. Label: `VIEWSHED_LABEL` (`derived`).
 */
export function viewshed(
  grid: LoadedGrid,
  from: { x_m: number; y_m: number; height_m: number },
  target_height_m: number,
  radius_m: number = RELAY_VIEWSHED_RADIUS_M,
  cell_m: number = RELAY_VIEWSHED_CELL_M,
): CoverageGrid {
  if (!Number.isFinite(radius_m) || radius_m <= 0) {
    throw new RangeError(`radius_m must be a positive finite number, got ${radius_m}`);
  }
  if (!Number.isFinite(cell_m) || cell_m <= 0) {
    throw new RangeError(`cell_m must be a positive finite number, got ${cell_m}`);
  }

  const width = Math.ceil((2 * radius_m) / cell_m);
  const height = Math.ceil((2 * radius_m) / cell_m);
  const origin_m: [number, number] = [from.x_m - radius_m, from.y_m + radius_m];
  const visible = new Uint8Array(width * height);

  for (let r = 0; r < height; r++) {
    const y = origin_m[1] - (r + 0.5) * cell_m;
    const rowOffset = r * width;
    for (let c = 0; c < width; c++) {
      const x = origin_m[0] + (c + 0.5) * cell_m;
      const d = Math.hypot(x - from.x_m, y - from.y_m);
      if (d <= radius_m) {
        if (lineOfSight(grid, from, { x_m: x, y_m: y, height_m: target_height_m })) {
          visible[rowOffset + c] = 1;
        }
      }
    }
  }

  return {
    cell_m,
    width,
    height,
    origin_m,
    visible,
  };
}
