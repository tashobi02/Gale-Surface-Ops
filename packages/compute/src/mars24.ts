/**
 * Mars24 solar functions (docs/specs/02 §D.5; Allison & McEwen 2000; ADR-005). FR-11.
 * Implemented by TASK-06; cross-check against the Python `marstime` package.
 * Pitfall (02 §C.4.1): many Mars24 implementations take west longitude; this app stores
 * east-positive longitude everywhere.
 */

/** Mars Sol Date for a UTC instant. TASK-06. */
export function marsSolDate(utc: Date): number {
  throw new Error("TODO(TASK-06): not implemented");
}

/** Areocentric solar longitude L_s, degrees, and Mars Year. TASK-06. */
export function solarLongitude(utc: Date): { ls_deg: number; mars_year: number } {
  throw new Error("TODO(TASK-06): not implemented");
}

/** Convert east-positive longitude to the west longitude Mars24 expects (02 §C.4.1). TASK-06. */
export function eastToWestLongitude(lonE: number): number {
  throw new Error("TODO(TASK-06): not implemented");
}

/** Local true solar time "HH:MM" at a site. Input: UTC, lon_e (°). TASK-06. */
export function localTrueSolarTime(utc: Date, lonE: number): string {
  throw new Error("TODO(TASK-06): not implemented");
}

/** Solar elevation and azimuth, degrees, at planetocentric lat / lon_e (no terrain, no refraction). TASK-06. */
export function solarPosition(utc: Date, lat: number, lonE: number): { elevation_deg: number; azimuth_deg: number } {
  throw new Error("TODO(TASK-06): not implemented");
}

/** Sunrise/sunset for the sol containing `utc`, flat horizon (elevation 0°). TASK-06. */
export function sunriseSunset(utc: Date, lat: number, lonE: number): { sunrise_utc: string; sunset_utc: string; sunrise_ltst: string; sunset_ltst: string } {
  throw new Error("TODO(TASK-06): not implemented");
}
