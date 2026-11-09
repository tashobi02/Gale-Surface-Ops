/**
 * Solar position and flat-horizon sunrise/sunset (docs/specs/02 §D.5; FR-11; contract C8).
 * Implemented by TASK-06 (T06.07). Built on top of Mars24 time functions.
 */

/** Solar elevation and azimuth, degrees, at planetocentric lat / lon_e (no terrain, no refraction). TASK-06 (T06.07). */
export function solarPosition(
  utc: Date,
  lat: number,
  lonE: number,
): { elevation_deg: number; azimuth_deg: number } {
  throw new Error("TODO(T06.07): not implemented");
}

/** Sunrise/sunset for the sol containing `utc`, flat horizon (elevation 0°). TASK-06 (T06.07). */
export function sunriseSunset(
  utc: Date,
  lat: number,
  lonE: number,
): {
  sunrise_utc: string;
  sunset_utc: string;
  sunrise_ltst: string;
  sunset_ltst: string;
} {
  throw new Error("TODO(T06.07): not implemented");
}
