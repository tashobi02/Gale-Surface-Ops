/**
 * Working-projection origin read from the manifest's `crs.proj4` string (docs/specs/05 §E.3; 02 §C.1, §C.4; BD-45).
 * FR-03. The grid loader parses the string once; no origin is a constant in compute.
 * Mars only: the sphere must be the IAU_2015:49900 radius, and the projection the local `+proj=eqc` one.
 */

/** Projection origin parameters for the local Mars equirectangular projection (degrees). */
export interface ProjectionOrigin {
  lat_0: number;
  lon_0: number;
  lat_ts: number;
}

/** IAU_2015:49900 sphere radius, metres (02 §C.1). The only radius an accepted string may carry. */
export const MARS_RADIUS_M = 3396190;

function fail(reason: string): never {
  throw new Error(`Working-projection proj4 is not the Mars eqc projection: ${reason}`);
}

function numberParam(params: Map<string, string>, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (raw === "" || !Number.isFinite(value)) fail(`+${key}=${raw} is not a number`);
  return value;
}

/**
 * Parse `+proj=eqc +lat_ts=.. +lat_0=.. +lon_0=.. +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs`.
 * `lat_0` and `lon_0` are required; `lat_ts` defaults to 0 (the PROJ default, not `lat_0`). Throws on any string that
 * is not eqc on the Mars sphere with no false easting or northing, because every metre the compute package reports
 * would then be wrong.
 */
export function parseEqcProjection(proj4: string): ProjectionOrigin {
  if (typeof proj4 !== "string" || proj4.trim() === "") fail("the string is empty or missing");
  const params = new Map<string, string>();
  for (const token of proj4.trim().split(/\s+/)) {
    if (!token.startsWith("+")) fail(`token "${token}" does not start with +`);
    const eq = token.indexOf("=");
    params.set(eq < 0 ? token.slice(1) : token.slice(1, eq), eq < 0 ? "" : token.slice(eq + 1));
  }
  if (params.get("proj") !== "eqc") fail(`+proj is ${params.get("proj") ?? "absent"}, not eqc`);
  const radius = numberParam(params, "R");
  if (radius !== MARS_RADIUS_M) fail(`+R is ${radius ?? "absent"}, not ${MARS_RADIUS_M}`);
  if ((numberParam(params, "x_0") ?? 0) !== 0 || (numberParam(params, "y_0") ?? 0) !== 0) fail("false easting or northing is not 0");
  const units = params.get("units");
  if (units !== undefined && units !== "m") fail(`+units is ${units}, not m`);
  const lat_0 = numberParam(params, "lat_0");
  const lon_0 = numberParam(params, "lon_0");
  if (lat_0 === undefined) fail("+lat_0 is missing");
  if (lon_0 === undefined) fail("+lon_0 is missing");
  return { lat_0, lon_0, lat_ts: numberParam(params, "lat_ts") ?? 0 };
}
