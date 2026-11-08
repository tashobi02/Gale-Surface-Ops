/**
 * Solar position and flat-horizon sunrise/sunset (docs/specs/02 §D.5; FR-11; contract C8).
 * Implemented by TASK-06 (T06.07). Built on top of Mars24 time functions.
 *
 * Limitation notice (01 FR-11, 02 §D.5):
 * Flat-horizon sphere (IAU_2015:49900). Terrain shadowing, atmospheric refraction,
 * and atmospheric dust opacity are explicitly not modelled.
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
 * Solar declination delta in degrees from areocentric solar longitude L_s (Allison & McEwen 2000 Eq. 21).
 */
export function solarDeclination(lsDeg: number): number {
  const lsRad = (lsDeg * Math.PI) / 180;
  const decRad = Math.asin(0.42565 * Math.sin(lsRad)) + 0.25 * (Math.PI / 180) * Math.sin(lsRad);
  return (decRad * 180) / Math.PI;
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
  const ott = j2000OffsetTt(utc);
  const lonW = eastToWestLongitude(lonE);
  const lsDeg = areocentricSolarLongitude(ott);
  const decDeg = solarDeclination(lsDeg);

  const mtc = coordinatedMarsTime(ott);
  const lsRad = (lsDeg * Math.PI) / 180;
  const vm = equationOfCenter(ott);
  const eotDeg = 2.861 * Math.sin(2 * lsRad) - 0.071 * Math.sin(4 * lsRad) + 0.002 * Math.sin(6 * lsRad) - vm;
  const subsolDeg = ((mtc + (eotDeg * 24.0) / 360.0) * (360.0 / 24.0) + 180.0) % 360;

  const haRad = ((lonW - subsolDeg) * Math.PI) / 180;
  const decRad = (decDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;

  const cosZ = Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
  const zDeg = (Math.acos(Math.max(-1, Math.min(1, cosZ))) * 180) / Math.PI;
  const elevationDeg = 90 - zDeg;

  // Standard spherical azimuth (Allison & McEwen 2000 Eq. 41)
  const denom = Math.cos(latRad) * Math.tan(decRad) - Math.sin(latRad) * Math.cos(haRad);
  const num = Math.sin(haRad);
  const azimuthDeg = ((360.0 + (Math.atan2(num, denom) * 180.0) / Math.PI) % 360 + 360) % 360;

  return {
    elevation_deg: elevationDeg,
    azimuth_deg: azimuthDeg,
  };
}

/**
 * Bisect a time interval to locate the instant where solar elevation crosses 0° (flat horizon).
 */
function bisectElevationCrossing(tLow: Date, tHigh: Date, lat: number, lonE: number): Date {
  let low = tLow.getTime();
  let high = tHigh.getTime();
  const eLow = solarPosition(new Date(low), lat, lonE).elevation_deg;

  for (let i = 0; i < 35; i++) {
    const mid = (low + high) / 2;
    const eMid = solarPosition(new Date(mid), lat, lonE).elevation_deg;
    if (Math.abs(eMid) < 1e-6 || Math.abs(high - low) < 10) {
      return new Date(mid);
    }
    if ((eLow <= 0 && eMid <= 0) || (eLow > 0 && eMid > 0)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return new Date((low + high) / 2);
}

/**
 * Sunrise/sunset for the sol containing `utc`, flat horizon (elevation 0°). TASK-06 (T06.07).
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
  // Search over a +/- 16 hour window (encompassing the 24.66-hour Martian sol)
  const spanMs = 32 * 3600 * 1000;
  const stepMs = 120 * 1000; // 2-minute steps
  const steps = spanMs / stepMs;
  const startMs = utc.getTime() - spanMs / 2;

  const times: Date[] = [];
  const elevs: number[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = new Date(startMs + i * stepMs);
    times.push(t);
    elevs.push(solarPosition(t, lat, lonE).elevation_deg);
  }

  const crossings: { date: Date; kind: "sunrise" | "sunset" }[] = [];
  for (let i = 0; i < elevs.length - 1; i++) {
    if ((elevs[i] <= 0 && elevs[i + 1] > 0) || (elevs[i] > 0 && elevs[i + 1] <= 0)) {
      const tCross = bisectElevationCrossing(times[i], times[i + 1], lat, lonE);
      const isRising = solarPosition(new Date(tCross.getTime() + 30000), lat, lonE).elevation_deg > 0;
      crossings.push({ date: tCross, kind: isRising ? "sunrise" : "sunset" });
    }
  }

  const sunrises = crossings.filter((c) => c.kind === "sunrise").map((c) => c.date);
  const sunsets = crossings.filter((c) => c.kind === "sunset").map((c) => c.date);

  let srDate: Date | null = null;
  let ssDate: Date | null = null;

  // Match the diurnal daytime cycle containing utc: sunrise <= utc <= sunset
  for (const r of sunrises) {
    for (const s of sunsets) {
      if (r < s && s.getTime() - r.getTime() < 24.66 * 3600 * 1000) {
        if (r.getTime() <= utc.getTime() && utc.getTime() <= s.getTime()) {
          srDate = r;
          ssDate = s;
          break;
        }
      }
    }
    if (srDate) break;
  }

  // If utc is before sunrise during the early morning: match the upcoming sunrise and its sunset
  if (!srDate && sunrises.length && sunsets.length) {
    for (const r of sunrises) {
      if (r.getTime() >= utc.getTime()) {
        srDate = r;
        const matchingSs = sunsets.find((s) => s.getTime() > r.getTime());
        if (matchingSs) {
          ssDate = matchingSs;
        }
        break;
      }
    }
  }

  // Fallback to nearest
  if (!srDate && sunrises.length) srDate = sunrises[0];
  if (!ssDate && sunsets.length) ssDate = sunsets[0];

  const finalSr = srDate ?? utc;
  const finalSs = ssDate ?? utc;

  const sunriseUtc = finalSr.toISOString().replace(/\.\d{3}Z$/, "Z");
  const sunsetUtc = finalSs.toISOString().replace(/\.\d{3}Z$/, "Z");

  return {
    sunrise_utc: sunriseUtc,
    sunset_utc: sunsetUtc,
    sunrise_ltst: localTrueSolarTime(finalSr, lonE),
    sunset_ltst: localTrueSolarTime(finalSs, lonE),
  };
}
