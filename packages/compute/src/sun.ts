/**
 * Solar position and flat-horizon sunrise/sunset (docs/specs/02 §D.5; FR-11; contract C8).
 * Implemented by TASK-06 (T06.07). Built on top of Mars24 time functions.
 *
 * Limitation notice (01 FR-11, 02 §D.5):
 * Flat-horizon sphere (IAU_2015:49900). Terrain shadowing, atmospheric refraction,
 * and atmospheric dust opacity are explicitly not modelled.
 *
 * Geometry (NASA GISS Mars24 algorithm page, https://www.giss.nasa.gov/tools/mars24/help/algorithm.html, page
 * updated 2025-01-07, fetched 12 Nov 2026; numbering checked against the page, BD-56):
 * D-1 declination delta = asin(0.42565 sin Ls) + 0.25 deg sin Ls (Allison 1997 eq. 5);
 * C-5 west-positive subsolar longitude = 15 deg * MST + EOT + 180 deg; D-5 hour angle H = west longitude - subsolar
 * longitude, so H = 15 deg * (12 - LTST) modulo 360 deg (H > 0 in the morning), zenith angle
 * Z = acos(sin delta sin phi + cos delta cos phi cos H), elevation = 90 - Z; D-6 azimuth
 * A = atan2(sin H, cos phi tan delta - sin phi cos H). The page's two worked examples are tests in
 * packages/compute/tests/sun.test.ts and mars24.test.ts.
 */

import {
  areocentricSolarLongitude,
  coordinatedMarsTime,
  eastToWestLongitude,
  equationOfCenter,
  j2000OffsetTt,
  localTrueSolarTime,
} from "./mars24";

/**
 * Solar declination delta in degrees from areocentric solar longitude L_s (GISS D-1; Allison 1997 eq. 5).
 */
export function solarDeclination(lsDeg: number): number {
  const lsRad = (lsDeg * Math.PI) / 180;
  const decRad = Math.asin(0.42565 * Math.sin(lsRad)) + 0.25 * (Math.PI / 180) * Math.sin(lsRad);
  return (decRad * 180) / Math.PI;
}

/**
 * Thrown by {@link sunriseSunset} when the sun has no sunrise/sunset pair inside the local sol, i.e. it
 * does not cross the flat horizon (|cos H0| > 1 with cos H0 = -tan(lat) tan(dec); polar day or polar night).
 *
 * Contract (ratified by BD-56): no event instant is invented. Callers must catch this error. 05
 * PlanResult.conditions has no form for an absent event, so the C8 assembler (conditions.ts) omits the sun
 * fields for such a sol. Not reachable at Gale (lat about -4.7 deg), where the sun always crosses the horizon.
 */
export class SunEventsUnavailableError extends RangeError {
  /** SUN_ALWAYS_UP: above the horizon at local midnight; SUN_NEVER_UP: below it at local noon. */
  readonly reason: "SUN_ALWAYS_UP" | "SUN_NEVER_UP";

  constructor(reason: "SUN_ALWAYS_UP" | "SUN_NEVER_UP", message: string) {
    super(message);
    this.name = "SunEventsUnavailableError";
    this.reason = reason;
  }
}

/** Mean Mars solar day in Earth milliseconds (1.027491252 Earth days; Allison & McEwen 2000, as in mars24.ts). */
const SOL_MS = 1.027491252 * 86_400_000;
/** One local true solar hour in Earth milliseconds. */
const SOLAR_HOUR_MS = SOL_MS / 24;

/**
 * Decimal places at which a sun elevation is carried in the engine's state (02 §D.5; NFR-06).
 *
 * A sun elevation is `90 − acos(cos Z)`, and `acos` near 61° has a derivative of about −2.2, so a one-unit-in-the-last-place
 * difference in `cos Z` — which a platform's `Math.sin`/`Math.cos`/`Math.acos` can produce, since they are not bit-identical
 * across V8 builds — becomes a difference of about two ULP in the elevation. Six decimal places (about 1e-6 deg, well under a
 * millimetre of arc) is about 1e8 ULP above that noise and far below the 0.1 deg the UI shows, so the value is the same on
 * every machine and the recorded bytes of a run are reproducible (T27.05, BD-148).
 */
export const SUN_ELEVATION_DECIMALS = 6;

/**
 * Round `value` to `decimals` decimal places, for a value that is carried in the state.
 *
 * The rounding is decimal, not binary, and it never returns −0 (a JSON round trip would turn −0 into 0): a value of −1e-9 at six
 * decimals is 0, not −0. A non-finite value is returned unchanged, so the caller's own check still sees it.
 *
 * The rounding is applied where a value enters the state, never inside the science: `solarPosition` keeps its full precision,
 * because `sunriseSunset`, `warnings.ts` and `compute/conditions.ts` read it and a rounded elevation would move a sunrise
 * instant.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** Declination and Mars24 hour angle H = 15 deg * (12 - LTST) (not wrapped; only sin/cos or a wrap is applied). */
function solarGeometry(utc: Date, lonE: number): { decDeg: number; haDeg: number } {
  const ott = j2000OffsetTt(utc);
  const lonW = eastToWestLongitude(lonE);
  const lsDeg = areocentricSolarLongitude(ott);
  const decDeg = solarDeclination(lsDeg);

  const mtc = coordinatedMarsTime(ott);
  const lsRad = (lsDeg * Math.PI) / 180;
  const vm = equationOfCenter(ott);
  const eotDeg = 2.861 * Math.sin(2 * lsRad) - 0.071 * Math.sin(4 * lsRad) + 0.002 * Math.sin(6 * lsRad) - vm;
  const subsolDeg = ((mtc + (eotDeg * 24.0) / 360.0) * (360.0 / 24.0) + 180.0) % 360;
  return { decDeg, haDeg: lonW - subsolDeg };
}

/** Continuous local true solar time in hours, [0, 24), from the hour angle. */
function ltstHoursAt(ms: number, lonE: number): number {
  const { haDeg } = solarGeometry(new Date(ms), lonE);
  return (((12 - haDeg / 15) % 24) + 24) % 24;
}

/**
 * Instant (ms) near `ms` at which local true solar time equals `targetHours`. Fixed-point iteration on the
 * wrapped LTST error; the equation of time changes by seconds per sol, so it converges in a few steps.
 */
function refineToLtst(ms: number, targetHours: number, lonE: number): number {
  let t = ms;
  for (let i = 0; i < 8; i++) {
    const errH = ((((ltstHoursAt(t, lonE) - targetHours) % 24) + 36) % 24) - 12; // [-12, 12)
    if (Math.abs(errH) * SOLAR_HOUR_MS < 0.5) break;
    t -= errH * SOLAR_HOUR_MS;
  }
  return t;
}

/** Local true solar midnight (LTST 0 h) at or before `utc`, ms. */
function localMidnightAtOrBefore(utc: Date, lonE: number): number {
  const ms = utc.getTime();
  let start = refineToLtst(ms - ltstHoursAt(ms, lonE) * SOLAR_HOUR_MS, 0, lonE);
  if (start > ms) start = refineToLtst(start - SOL_MS, 0, lonE);
  return start;
}

/**
 * Solar elevation and azimuth, degrees, at planetocentric lat / lon_e. TASK-06 (T06.07).
 *
 * Terrain shadowing is explicitly not modelled (01 FR-11, 02 §D.5). Atmospheric refraction
 * and dust opacity are also excluded.
 */
export function solarPosition(
  utc: Date,
  lat: number,
  lonE: number,
): { elevation_deg: number; azimuth_deg: number } {
  if (!(utc instanceof Date) || isNaN(utc.getTime())) {
    throw new RangeError("Invalid Date provided to solarPosition: expected valid Date");
  }
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
    throw new RangeError("Invalid latitude provided to solarPosition: expected finite number between -90 and 90");
  }
  if (!Number.isFinite(lonE)) {
    throw new RangeError("Invalid longitude provided to solarPosition: expected finite number");
  }

  const { decDeg, haDeg } = solarGeometry(utc, lonE);

  const haRad = (haDeg * Math.PI) / 180;
  const decRad = (decDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;

  const cosZ = Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
  const zDeg = (Math.acos(Math.max(-1, Math.min(1, cosZ))) * 180) / Math.PI;
  const elevationDeg = 90 - zDeg;

  // Azimuth, GISS D-6 (atan2 form), north-referenced, clockwise
  const denom = Math.cos(latRad) * Math.tan(decRad) - Math.sin(latRad) * Math.cos(haRad);
  const num = Math.sin(haRad);
  const azimuthDeg = ((360.0 + (Math.atan2(num, denom) * 180.0) / Math.PI) % 360 + 360) % 360;

  return {
    elevation_deg: elevationDeg,
    azimuth_deg: azimuthDeg,
  };
}

/** Root of the elevation function in [loMs, hiMs] (the up/down state differs at the ends), to 1 ms. */
function bisectElevationCrossing(loMs: number, hiMs: number, lat: number, lonE: number): number {
  let low = loMs;
  let high = hiMs;
  const lowIsUp = solarPosition(new Date(low), lat, lonE).elevation_deg > 0;
  while (high - low > 1) {
    const mid = (low + high) / 2;
    const midIsUp = solarPosition(new Date(mid), lat, lonE).elevation_deg > 0;
    if (midIsUp === lowIsUp) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Sunrise and sunset of the local sol containing `utc`, flat horizon (elevation 0 deg). TASK-06 (T06.07).
 *
 * The sol is the local true solar day from LTST 00:00 to the next LTST 00:00 (about 24.66 h), so a probe
 * before dawn or after sunset returns the same two events as one at midday. Both events are located inside
 * that sol by bisection of the elevation sign change (sunrise in [midnight, noon], sunset in [noon, next
 * midnight]); sunrise is always earlier than sunset.
 *
 * Throws {@link SunEventsUnavailableError} (a RangeError) when the sun does not cross the horizon in the
 * sol; no event is substituted. Throws RangeError for an invalid Date, latitude or longitude.
 *
 * Terrain shadowing is explicitly not modelled (01 FR-11, 02 §D.5).
 */
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
  if (!(utc instanceof Date) || isNaN(utc.getTime())) {
    throw new RangeError("Invalid Date provided to sunriseSunset: expected valid Date");
  }
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
    throw new RangeError("Invalid latitude provided to sunriseSunset: expected finite number between -90 and 90");
  }
  if (!Number.isFinite(lonE)) {
    throw new RangeError("Invalid longitude provided to sunriseSunset: expected finite number");
  }

  const solStart = localMidnightAtOrBefore(utc, lonE);
  const solEnd = refineToLtst(solStart + SOL_MS, 0, lonE);
  const noon = refineToLtst((solStart + solEnd) / 2, 12, lonE);

  const elevAt = (ms: number): number => solarPosition(new Date(ms), lat, lonE).elevation_deg;
  const eNoon = elevAt(noon);
  if (eNoon <= 0) {
    throw new SunEventsUnavailableError(
      "SUN_NEVER_UP",
      `No sunrise or sunset at latitude ${lat} in the local sol containing ${utc.toISOString()}: the sun stays at or below the flat horizon (elevation ${eNoon.toFixed(2)} deg at local noon)`,
    );
  }
  if (elevAt(solStart) >= 0 || elevAt(solEnd) >= 0) {
    throw new SunEventsUnavailableError(
      "SUN_ALWAYS_UP",
      `No sunrise or sunset at latitude ${lat} in the local sol containing ${utc.toISOString()}: the sun is above the flat horizon at local midnight`,
    );
  }

  const sunrise = new Date(bisectElevationCrossing(solStart, noon, lat, lonE));
  const sunset = new Date(bisectElevationCrossing(noon, solEnd, lat, lonE));

  return {
    sunrise_utc: sunrise.toISOString().replace(/\.\d{3}Z$/, "Z"),
    sunset_utc: sunset.toISOString().replace(/\.\d{3}Z$/, "Z"),
    sunrise_ltst: localTrueSolarTime(sunrise, lonE),
    sunset_ltst: localTrueSolarTime(sunset, lonE),
  };
}
