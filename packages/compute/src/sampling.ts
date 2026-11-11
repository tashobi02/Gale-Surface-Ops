/**
 * Point and profile sampling (docs/specs/02 §D.1). FR-03, FR-08. Implemented by TASK-05 (T05.17).
 * Nearest cell for slope/flags, bilinear elevation for profiles, nearest TI from the 100 m sidecar.
 */
import {
  FLAG_BITS,
  type FlagName,
  type LegProfile,
  type SampleReason,
  type SampleResult,
} from "@marswalk/protocol";
import { cellIndex, decodeSlopeDeg, type LoadedGrid } from "./grid";
import { snapToPassable } from "./snap";

const MARS_RADIUS_M = 3396190;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Spacing in metres between profile samples (05 §C Leg.profile, FR-08). */
export const PROFILE_SPACING_M = 5;

/** Projection origin parameters for local Mars equirectangular projection. */
export interface ProjectionOrigin {
  lat_0: number;
  lon_0: number;
  lat_ts?: number;
}

/**
 * Default Gale crater / mock_site projection origin (02 §C.1, 05 §F.1).
 * TODO(decision): read the origin from the site manifest's working-projection `proj4` (05 §E.3) once a loader that
 * reads the manifest exists; until then every grid uses this constant.
 */
export const DEFAULT_PROJECTION: ProjectionOrigin = {
  lat_0: -4.7,
  lon_0: 137.38,
  lat_ts: -4.7,
};

/**
 * Spherical inverse Equirectangular projection (02 §B, 02 §C.1).
 * Computes (lat, lon_e) in degrees from projected metres (x_m, y_m).
 */
export function inverseEqc(
  x_m: number,
  y_m: number,
  proj: ProjectionOrigin = DEFAULT_PROJECTION,
): { lat: number; lon_e: number } {
  const lat_ts = proj.lat_ts ?? proj.lat_0;
  const lat = proj.lat_0 + (y_m / MARS_RADIUS_M) * RAD_TO_DEG;
  const cosLatTs = Math.cos(lat_ts * DEG_TO_RAD);
  const lon_e = proj.lon_0 + (x_m / (MARS_RADIUS_M * cosLatTs)) * RAD_TO_DEG;
  return { lat, lon_e };
}

/**
 * Unpack u8 bitfield into array of FlagName (05 §C "Flag bits").
 */
export function unpackFlags(flagByte: number): FlagName[] {
  const flags: FlagName[] = [];
  if ((flagByte & (1 << FLAG_BITS.NO_DATA)) !== 0) flags.push("NO_DATA");
  if ((flagByte & (1 << FLAG_BITS.HARD_HAZARD)) !== 0) flags.push("HARD_HAZARD");
  if ((flagByte & (1 << FLAG_BITS.LOW_TI)) !== 0) flags.push("LOW_TI");
  if ((flagByte & (1 << FLAG_BITS.TI_UNKNOWN)) !== 0) flags.push("TI_UNKNOWN");
  if ((flagByte & (1 << FLAG_BITS.LOW_RES_DEM)) !== 0) flags.push("LOW_RES_DEM");
  return flags;
}

/**
 * Bilinear elevation interpolation between cell centres (02 §D.1, 05 §C).
 */
export function interpolateElevation(grid: LoadedGrid, x_m: number, y_m: number): number {
  const { width, height, cell_m, origin_m } = grid.meta;
  const [origin_x, origin_y] = origin_m;

  // Continuous index relative to cell centres
  const u = (x_m - origin_x) / cell_m - 0.5;
  const v = (origin_y - y_m) / cell_m - 0.5;

  const j0 = Math.max(0, Math.min(width - 1, Math.floor(u)));
  const j1 = Math.max(0, Math.min(width - 1, j0 + 1));
  const i0 = Math.max(0, Math.min(height - 1, Math.floor(v)));
  const i1 = Math.max(0, Math.min(height - 1, i0 + 1));

  const fx = j0 === j1 ? 0 : Math.max(0, Math.min(1, u - j0));
  const fy = i0 === i1 ? 0 : Math.max(0, Math.min(1, v - i0));

  const z00 = grid.elevation[i0 * width + j0];
  const z01 = grid.elevation[i0 * width + j1];
  const z10 = grid.elevation[i1 * width + j0];
  const z11 = grid.elevation[i1 * width + j1];

  if (isNaN(z00) || isNaN(z01) || isNaN(z10) || isNaN(z11)) {
    return NaN;
  }

  return (1 - fx) * (1 - fy) * z00 + fx * (1 - fy) * z01 + (1 - fx) * fy * z10 + fx * fy * z11;
}

/**
 * Sample one point (02 §D.1, §E.2; FR-03, FR-08).
 * Input: x_m, y_m (m), snap radius (m), hard slope limit (°), optional projection origin.
 * Output: SAMPLE_RESULT fields; OUTSIDE_AOI / NO_DATA give null values with a reason.
 */
export function samplePoint(
  grid: LoadedGrid,
  x_m: number,
  y_m: number,
  snapRadiusM: number,
  hardSlopeLimitDeg: number,
  proj: ProjectionOrigin = DEFAULT_PROJECTION,
): Omit<SampleResult, "type" | "request_id"> {
  const idx = cellIndex(grid, x_m, y_m);

  if (idx === null) {
    return {
      inside_aoi: false,
      passable: false,
      reason: "OUTSIDE_AOI",
      lat: null,
      lon_e: null,
      elevation_m: null,
      slope_p90_deg: null,
      ti_tiu: null,
      flags: [],
      snap: null,
    };
  }

  const flagByte = grid.flags[idx];
  const flags = unpackFlags(flagByte);
  const rawSlope = grid.slopeP90[idx];
  const slopeP90Deg = decodeSlopeDeg(rawSlope);
  const elevation = interpolateElevation(grid, x_m, y_m);

  const isNoData =
    isNaN(elevation) ||
    (flagByte & (1 << FLAG_BITS.NO_DATA)) !== 0 ||
    rawSlope === 255;

  if (isNoData) {
    const snapCandidate = snapToPassable(
      grid,
      x_m,
      y_m,
      { hard_slope_limit_deg: hardSlopeLimitDeg },
      snapRadiusM,
    );
    return {
      inside_aoi: true,
      passable: false,
      reason: "NO_DATA",
      lat: null,
      lon_e: null,
      elevation_m: null,
      slope_p90_deg: null,
      ti_tiu: null,
      flags: flags.includes("NO_DATA") ? flags : ["NO_DATA", ...flags],
      snap: snapCandidate ? { x_m: snapCandidate.x_m, y_m: snapCandidate.y_m, distance_m: snapCandidate.distance_m } : null,
    };
  }

  const { lat, lon_e } = inverseEqc(x_m, y_m, proj);

  let tiTiu: number | null = null;
  if (grid.ti !== undefined) {
    if (grid.ti.length === grid.meta.width * grid.meta.height) {
      tiTiu = grid.ti[idx];
    } else {
      const tiCell = grid.meta.ti_cell_m ?? 100.0;
      const tiW = Math.round((grid.meta.width * grid.meta.cell_m) / tiCell);
      const tiI = Math.floor((grid.meta.origin_m[1] - y_m) / tiCell);
      const tiJ = Math.floor((x_m - grid.meta.origin_m[0]) / tiCell);
      const tiIdx = tiI * tiW + tiJ;
      if (tiIdx >= 0 && tiIdx < grid.ti.length) {
        tiTiu = grid.ti[tiIdx];
      }
    }
  }

  const isHardHazard = (flagByte & (1 << FLAG_BITS.HARD_HAZARD)) !== 0;
  const isSlopeOver = slopeP90Deg !== null && slopeP90Deg > hardSlopeLimitDeg;

  let reason: SampleReason | null = null;
  let passable = true;

  if (isHardHazard) {
    reason = "HARD_HAZARD";
    passable = false;
  } else if (isSlopeOver) {
    reason = "SLOPE_OVER_LIMIT";
    passable = false;
  }

  let snap: { x_m: number; y_m: number; distance_m: number } | null = null;
  if (!passable) {
    const snapCandidate = snapToPassable(
      grid,
      x_m,
      y_m,
      { hard_slope_limit_deg: hardSlopeLimitDeg },
      snapRadiusM,
    );
    if (snapCandidate) {
      snap = {
        x_m: snapCandidate.x_m,
        y_m: snapCandidate.y_m,
        distance_m: snapCandidate.distance_m,
      };
    }
  }

  return {
    inside_aoi: true,
    passable,
    reason,
    lat,
    lon_e,
    elevation_m: elevation,
    slope_p90_deg: slopeP90Deg,
    ti_tiu: tiTiu,
    flags,
    snap,
  };
}

/**
 * Profile slope class of one cell (02 §D.3): over_limit for no-data, hard hazard or slope above the hard limit,
 * caution above the caution threshold, otherwise ok.
 */
function classifySlope(
  slopeDeg: number | null,
  isHazard: boolean,
  cautionSlopeDeg: number,
  hardSlopeLimitDeg: number,
): "ok" | "caution" | "over_limit" {
  if (slopeDeg === null || isHazard || slopeDeg > hardSlopeLimitDeg) return "over_limit";
  if (slopeDeg > cautionSlopeDeg) return "caution";
  return "ok";
}

/**
 * Elevation/slope profile along a cell path, sampled every 5 m (05 §C Leg.profile, FR-08).
 * Input: path as [x_m, y_m] pairs. Output: dist_m[], elev_m[], slope_class[], comm[].
 */
export function sampleProfile(
  grid: LoadedGrid,
  path: [number, number][],
  cautionSlopeDeg: number,
  hardSlopeLimitDeg: number,
): LegProfile {
  if (path.length === 0) {
    return { dist_m: [], elev_m: [], slope_class: [] };
  }

  // Pre-calculate cumulative distances of path vertices
  const segLengths: number[] = [];
  const cumDists: number[] = [0];
  let totalDist = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1][0] - path[i][0];
    const dy = path[i + 1][1] - path[i][1];
    const segLen = Math.hypot(dx, dy);
    segLengths.push(segLen);
    totalDist += segLen;
    cumDists.push(totalDist);
  }

  const dist_m: number[] = [];
  const elev_m: number[] = [];
  const slope_class: ("ok" | "caution" | "over_limit")[] = [];
  const comm: (0 | 1)[] = [];
  const hasComm = grid.commHab !== undefined;

  // One place appends a sample, so dist_m, elev_m, slope_class and comm always stay equal in length.
  const pushSample = (s: number, x: number, y: number): void => {
    dist_m.push(s);
    elev_m.push(interpolateElevation(grid, x, y));

    const cIdx = cellIndex(grid, x, y);
    if (cIdx === null) {
      slope_class.push("over_limit");
      if (hasComm) comm.push(0);
      return;
    }
    const isHazard = (grid.flags[cIdx] & (1 << FLAG_BITS.HARD_HAZARD)) !== 0;
    slope_class.push(classifySlope(decodeSlopeDeg(grid.slopeP90[cIdx]), isHazard, cautionSlopeDeg, hardSlopeLimitDeg));
    if (hasComm) comm.push(grid.commHab[cIdx] === 1 ? 1 : 0);
  };

  const sampleCount = totalDist === 0 ? 1 : Math.floor(totalDist / PROFILE_SPACING_M) + 1;

  for (let sIdx = 0; sIdx < sampleCount; sIdx++) {
    const s = sIdx * PROFILE_SPACING_M;

    let x = path[0][0];
    let y = path[0][1];

    if (path.length > 1 && totalDist > 0) {
      // Find segment containing distance s
      let segIdx = 0;
      while (segIdx < segLengths.length - 1 && cumDists[segIdx + 1] < s) {
        segIdx++;
      }
      const segLen = segLengths[segIdx];
      const dInSeg = s - cumDists[segIdx];
      const t = segLen > 0 ? Math.min(1, Math.max(0, dInSeg / segLen)) : 0;
      x = path[segIdx][0] + t * (path[segIdx + 1][0] - path[segIdx][0]);
      y = path[segIdx][1] + t * (path[segIdx + 1][1] - path[segIdx][1]);
    }

    pushSample(s, x, y);
  }

  // Proposed, not specified: 05 §C says the profile is "sampled every 5 m" and does not mention the leg end, so a
  // sample at the exact leg end when the length is not a multiple of 5 m is new contract behaviour. It moves where
  // warnings.ts closes the last slope run (to_m is the leg length, not the last 5 m multiple).
  // TODO(decision): record the leg-end sample in 05 §C Leg.profile or drop it (TASK-05 T05.17/T05.18).
  if (totalDist > 0 && dist_m[dist_m.length - 1] < totalDist - 1e-6) {
    const endPt = path[path.length - 1];
    pushSample(totalDist, endPt[0], endPt[1]);
  }

  const result: LegProfile = {
    dist_m,
    elev_m,
    slope_class,
  };
  if (hasComm) {
    result.comm = comm;
  }

  return result;
}
