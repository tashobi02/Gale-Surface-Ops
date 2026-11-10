import { describe, expect, it } from "vitest";
import f6 from "../../../apps/web/tests/fixtures/mars24-reference.json";
import { localTrueSolarTime } from "../src/mars24";
import { SunEventsUnavailableError, solarPosition, sunriseSunset } from "../src/sun";

/** Helper: difference between two "HH:MM" times in minutes, handling midnight wrap. */
function timeDiffMinutes(a: string, b: string): number {
  const [hA, mA] = a.split(":").map(Number);
  const [hB, mB] = b.split(":").map(Number);
  const minA = hA * 60 + mA;
  const minB = hB * 60 + mB;
  const diff = Math.abs(minA - minB);
  return Math.min(diff, 1440 - diff);
}

// docs/specs/02 §D.5 and 01 FR-11 (TASK-06 / T06.03).
describe("sun position and sunrise/sunset (T06.03 / T06.07, FR-11)", () => {
  const { lat, lon_e: lonE } = f6.site;

  it("matches F6 solar elevation within 0.1° at all reference timestamps (01 FR-11, 02 §D.5)", () => {
    for (const record of f6.records) {
      const utc = new Date(record.utc);
      const pos = solarPosition(utc, lat, lonE);
      expect(
        Math.abs(pos.elevation_deg - record.solar_elevation_deg),
        `Solar elevation for ${record.utc} at Gale`
      ).toBeLessThanOrEqual(0.1);
    }
  });

  it("returns flat-horizon sunrise and sunset matching F6 reference times (02 §D.5)", () => {
    for (const record of f6.records) {
      const utc = new Date(record.utc);
      const res = sunriseSunset(utc, lat, lonE);

      // Sunrise and sunset times match F6 within 2 min
      // TODO(decision): 2-minute tolerance for sunrise/sunset times vs marstime reference (discrete bisection search vs continuous orbital solution; spec 02 §D.5 does not fix a numeric time tolerance for rise/set instants)
      const srDiffMin = Math.abs(
        (new Date(res.sunrise_utc).getTime() - new Date(record.sunrise_sunset.sunrise_utc).getTime()) / 60000
      );
      expect(
        srDiffMin,
        `Sunrise UTC diff for ${record.utc}`
      ).toBeLessThanOrEqual(2);

      const ssDiffMin = Math.abs(
        (new Date(res.sunset_utc).getTime() - new Date(record.sunrise_sunset.sunset_utc).getTime()) / 60000
      );
      expect(
        ssDiffMin,
        `Sunset UTC diff for ${record.utc}`
      ).toBeLessThanOrEqual(2);

      // LTST strings match within 2 min
      expect(timeDiffMinutes(res.sunrise_ltst, record.sunrise_sunset.sunrise_ltst)).toBeLessThanOrEqual(2);
      expect(timeDiffMinutes(res.sunset_ltst, record.sunrise_sunset.sunset_ltst)).toBeLessThanOrEqual(2);
    }
  });

  it("confirms solar elevation is 0° ± 0.1° at the returned sunrise and sunset instants (flat horizon) (02 §D.5)", () => {
    for (const record of f6.records) {
      const utc = new Date(record.utc);
      const res = sunriseSunset(utc, lat, lonE);

      const elevAtRise = solarPosition(new Date(res.sunrise_utc), lat, lonE).elevation_deg;
      expect(
        Math.abs(elevAtRise),
        `Elevation at sunrise ${res.sunrise_utc} for sol of ${record.utc}`
      ).toBeLessThanOrEqual(0.1);

      const elevAtSet = solarPosition(new Date(res.sunset_utc), lat, lonE).elevation_deg;
      expect(
        Math.abs(elevAtSet),
        `Elevation at sunset ${res.sunset_utc} for sol of ${record.utc}`
      ).toBeLessThanOrEqual(0.1);
    }
  });

  it("throws RangeError on invalid Date, latitude, or longitude inputs", () => {
    const validUtc = new Date("2026-11-14T08:00:00Z");
    const invalidDate = new Date("not-a-date");

    // Invalid date
    expect(() => solarPosition(invalidDate, lat, lonE)).toThrow(RangeError);
    expect(() => sunriseSunset(invalidDate, lat, lonE)).toThrow(RangeError);

    // Invalid latitude
    expect(() => solarPosition(validUtc, NaN, lonE)).toThrow(RangeError);
    expect(() => solarPosition(validUtc, 95, lonE)).toThrow(RangeError);
    expect(() => solarPosition(validUtc, -91, lonE)).toThrow(RangeError);
    expect(() => sunriseSunset(validUtc, NaN, lonE)).toThrow(RangeError);
    expect(() => sunriseSunset(validUtc, 100, lonE)).toThrow(RangeError);

    // Invalid longitude
    expect(() => solarPosition(validUtc, lat, NaN)).toThrow(RangeError);
    expect(() => solarPosition(validUtc, lat, Infinity)).toThrow(RangeError);
    expect(() => sunriseSunset(validUtc, lat, NaN)).toThrow(RangeError);
    expect(() => sunriseSunset(validUtc, lat, Infinity)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------------------------
// T06.07 repair (2026-11-10): same-sol event selection, explicit no-crossing contract, azimuth.
// Reference values come only from F6 (marstime) or from closed-form geometry; none is typed from
// the implementation's own output. Time tolerances below are provisional: TODO(decision).
// ---------------------------------------------------------------------------------------------

/** Mean Mars solar day in ms: 1.027491252 Earth days (Allison & McEwen 2000, as used in mars24.ts). */
const SOL_MS = 1.027491252 * 86_400_000;
/** One local true solar hour in ms. */
const SOLAR_HOUR_MS = SOL_MS / 24;
/** Provisional bound for sunrise/sunset instants (observed <= 2 s against F6). TODO(decision). */
const EVENT_TOL_S = 30;

function ltstHours(utc: Date, lonE: number): number {
  const [h, m] = localTrueSolarTime(utc, lonE).split(":").map(Number);
  return h + m / 60;
}

function secondsBetween(isoA: string, isoB: string): number {
  return (new Date(isoA).getTime() - new Date(isoB).getTime()) / 1000;
}

describe("sunriseSunset selects both events inside the local sol containing utc (T06.07, FR-11)", () => {
  const { lat, lon_e: lonE } = f6.site;
  // F6 record 0: 2026-11-14T08:00:00Z, LTST 05:47, i.e. before sunrise on this local sol. F6 sunrise and
  // sunset for it are the events of the whole local sol (local midnight to local midnight).
  const rec = f6.records[0];
  const solEvents = rec.sunrise_sunset;
  // Local midnights bounding that sol, from F6 LTST only (EOT drift over a sol is a few seconds).
  const solStartMs = new Date(rec.utc).getTime() - rec.ltst_hours * SOLAR_HOUR_MS;
  const solEndMs = solStartMs + SOL_MS;

  it("anchors: F6 record 0 lies inside the sol and its events fall between the bounding midnights", () => {
    expect(new Date(solEvents.sunrise_utc).getTime()).toBeGreaterThan(solStartMs);
    expect(new Date(solEvents.sunset_utc).getTime()).toBeLessThan(solEndMs);
  });

  it.each([
    ["before dawn, early local morning (LTST ~0.5 h)", solStartMs + 0.5 * SOLAR_HOUR_MS],
    ["before dawn, F6 plan start (LTST 05:47)", new Date(rec.utc).getTime()],
    ["midday", new Date(f6.records[1].utc).getTime()],
    ["just before sunset", new Date(solEvents.sunset_utc).getTime() - 60_000],
    ["just after sunset (LTST ~18 h)", new Date(solEvents.sunset_utc).getTime() + 60_000],
    ["2026-11-14T21:00:00Z, after sunset (Gale)", new Date("2026-11-14T21:00:00Z").getTime()],
    ["late evening (LTST ~23.5 h)", solEndMs - 0.5 * SOLAR_HOUR_MS],
  ])("returns this sol's sunrise and sunset %s", (_label, ms) => {
    const res = sunriseSunset(new Date(ms), lat, lonE);
    expect(Math.abs(secondsBetween(res.sunrise_utc, solEvents.sunrise_utc))).toBeLessThanOrEqual(EVENT_TOL_S);
    expect(Math.abs(secondsBetween(res.sunset_utc, solEvents.sunset_utc))).toBeLessThanOrEqual(EVENT_TOL_S);
    expect(new Date(res.sunrise_utc).getTime()).toBeLessThan(new Date(res.sunset_utc).getTime());
    expect(timeDiffMinutes(res.sunrise_ltst, solEvents.sunrise_ltst)).toBeLessThanOrEqual(1);
    expect(timeDiffMinutes(res.sunset_ltst, solEvents.sunset_ltst)).toBeLessThanOrEqual(1);
  });

  it("switches to the next sol's events exactly at local midnight, one sol later", () => {
    const before = sunriseSunset(new Date(solEndMs - 5 * 60_000), lat, lonE);
    const after = sunriseSunset(new Date(solEndMs + 5 * 60_000), lat, lonE);
    // Before: this sol. After: next sol, one mean solar day later (a few tens of seconds of drift from
    // declination and equation-of-time change are allowed; 120 s is provisional, TODO(decision)).
    expect(Math.abs(secondsBetween(before.sunrise_utc, solEvents.sunrise_utc))).toBeLessThanOrEqual(EVENT_TOL_S);
    const dRise = secondsBetween(after.sunrise_utc, before.sunrise_utc);
    const dSet = secondsBetween(after.sunset_utc, before.sunset_utc);
    expect(Math.abs(dRise - SOL_MS / 1000)).toBeLessThanOrEqual(120);
    expect(Math.abs(dSet - SOL_MS / 1000)).toBeLessThanOrEqual(120);
    expect(new Date(after.sunrise_utc).getTime()).toBeLessThan(new Date(after.sunset_utc).getTime());
  });

  it("over three sols: sunrise precedes sunset, daylight is about half a sol, and events change only when LTST wraps", () => {
    const stepMs = 47 * 60_000;
    let prev: { ms: number; ltst: number; res: ReturnType<typeof sunriseSunset> } | null = null;
    for (let i = 0; i < 3 * 33; i++) {
      const ms = solStartMs + 60_000 + i * stepMs;
      const utc = new Date(ms);
      const res = sunriseSunset(utc, lat, lonE);
      const rise = new Date(res.sunrise_utc).getTime();
      const set = new Date(res.sunset_utc).getTime();
      expect(rise, `sunrise before sunset at ${utc.toISOString()}`).toBeLessThan(set);
      // Gale is 4.7 degrees from the equator: daylight within one hour of half a sol.
      expect(Math.abs((set - rise) - SOL_MS / 2), `daylight length at ${utc.toISOString()}`).toBeLessThanOrEqual(3_600_000);
      // The probe's own local sol contains both events.
      const ltst = ltstHours(utc, lonE);
      const sunriseLtst = Number(res.sunrise_ltst.slice(0, 2)) + Number(res.sunrise_ltst.slice(3)) / 60;
      const sunsetLtst = Number(res.sunset_ltst.slice(0, 2)) + Number(res.sunset_ltst.slice(3)) / 60;
      expect(sunriseLtst, `sunrise LTST at ${utc.toISOString()}`).toBeLessThan(12);
      expect(sunsetLtst, `sunset LTST at ${utc.toISOString()}`).toBeGreaterThan(12);
      if (prev) {
        const wrapped = ltst < prev.ltst;
        const jump = secondsBetween(res.sunrise_utc, prev.res.sunrise_utc);
        if (wrapped) {
          expect(Math.abs(jump - SOL_MS / 1000), `sol change at ${utc.toISOString()}`).toBeLessThanOrEqual(120);
        } else {
          expect(Math.abs(jump), `same sol at ${utc.toISOString()}`).toBeLessThanOrEqual(1);
        }
      }
      prev = { ms, ltst, res };
    }
  });

  it("returns events at which the flat-horizon elevation is 0 within 0.1 degree for every probe in the sol", () => {
    for (const ms of [solStartMs + 60_000, solEndMs - 60_000, new Date("2026-11-14T21:00:00Z").getTime()]) {
      const res = sunriseSunset(new Date(ms), lat, lonE);
      expect(Math.abs(solarPosition(new Date(res.sunrise_utc), lat, lonE).elevation_deg)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(solarPosition(new Date(res.sunset_utc), lat, lonE).elevation_deg)).toBeLessThanOrEqual(0.1);
    }
  });

  it("finds both events at a high latitude where a crossing still exists (80 N, declination about 9 degrees)", () => {
    // Sun at local noon is 19 degrees up and at local midnight about 0.8 degrees below the horizon:
    // a crossing exists although daylight is long. Closed form: noon elevation 90 - |lat - dec|.
    const res = sunriseSunset(new Date(rec.utc), 80, lonE);
    expect(new Date(res.sunrise_utc).getTime()).toBeLessThan(new Date(res.sunset_utc).getTime());
    expect(Math.abs(solarPosition(new Date(res.sunrise_utc), 80, lonE).elevation_deg)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(solarPosition(new Date(res.sunset_utc), 80, lonE).elevation_deg)).toBeLessThanOrEqual(0.1);
  });
});

describe("sunriseSunset when the sun does not cross the flat horizon (|cos H0| > 1) (T06.07 contract)", () => {
  // Contract: no fabricated events. A sol with no sunrise/sunset pair throws SunEventsUnavailableError
  // (a RangeError subclass) whose reason says whether the sun stays up or down. 05 PlanResult.conditions
  // has no absent-event form, so the C8 assembler (T06.09) must catch it. TODO(decision) for the team.
  const utc = new Date(f6.records[0].utc); // declination about +9.2 degrees (F6 record 0)

  it.each([
    [90, "SUN_ALWAYS_UP"],
    [85, "SUN_ALWAYS_UP"],
    [-85, "SUN_NEVER_UP"],
    [-90, "SUN_NEVER_UP"],
  ])("latitude %s on 2026-11-14 throws %s", (lat, reason) => {
    let caught: unknown;
    try {
      sunriseSunset(utc, lat, f6.site.lon_e);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SunEventsUnavailableError);
    expect(caught).toBeInstanceOf(RangeError);
    expect((caught as SunEventsUnavailableError).reason).toBe(reason);
  });

  it("polar night in the other season: 70 N at Ls ~257 (declination about -25 degrees) never sees the sun", () => {
    const winter = new Date(f6.records[2].utc);
    expect(() => sunriseSunset(winter, 70, f6.site.lon_e)).toThrow(SunEventsUnavailableError);
    // Elevation check from closed geometry: noon elevation 90 - |lat - dec| < 0.
    expect(solarPosition(winter, 70, f6.site.lon_e).elevation_deg).toBeLessThan(0);
  });

  it("never returns the input instant as an event (no silent fallback)", () => {
    for (const lat of [90, -90]) {
      let result: unknown = null;
      try {
        result = sunriseSunset(utc, lat, f6.site.lon_e);
      } catch {
        result = null;
      }
      expect(result).toBeNull();
    }
  });
});

describe("solarPosition azimuth against independent geometry (T06.07, FR-11)", () => {
  const { lat, lon_e: lonE } = f6.site;
  const rad = Math.PI / 180;

  /**
   * North-referenced, clockwise azimuth from the spherical law of cosines on the pole-zenith-sun triangle:
   * cos(A) = (sin dec - sin el * sin lat) / (cos el * cos lat), east of north in the morning (LTST < 12 h),
   * west of north in the afternoon. Inputs are the marstime elevation and declination stored in F6, so this
   * does not reuse sun.ts's atan2 hour-angle formula (Mars24 algorithm, Allison & McEwen 2000, azimuth
   * relation; textbook spherical astronomy). TODO(verify): add the NASA Mars24 worked example from
   * https://www.giss.nasa.gov/tools/mars24/help/algorithm.html with its exact printed inputs; the page was
   * not reachable when this test was written (no network), and no value is typed here from memory.
   */
  function referenceAzimuthDeg(elDeg: number, decDeg: number, latDeg: number, morning: boolean): number {
    const cosA =
      (Math.sin(decDeg * rad) - Math.sin(elDeg * rad) * Math.sin(latDeg * rad)) /
      (Math.cos(elDeg * rad) * Math.cos(latDeg * rad));
    const a = Math.acos(Math.max(-1, Math.min(1, cosA))) / rad;
    return morning ? a : 360 - a;
  }

  it("matches the law-of-cosines azimuth built from F6 marstime elevation and declination within 0.1 degree", () => {
    for (const record of f6.records) {
      const got = solarPosition(new Date(record.utc), lat, lonE).azimuth_deg;
      const want = referenceAzimuthDeg(record.solar_elevation_deg, record.solar_declination_deg, lat, record.ltst_hours < 12);
      const diff = Math.abs(((got - want + 540) % 360) - 180);
      expect(diff, `azimuth ${got} vs ${want} at ${record.utc}`).toBeLessThanOrEqual(0.1);
    }
  });

  it("agrees with the F6 generator's standard azimuth (Allison & McEwen 2000 Eq. 41 on marstime's hour angle) within 0.1 degree", () => {
    for (const record of f6.records) {
      const got = solarPosition(new Date(record.utc), lat, lonE).azimuth_deg;
      const diff = Math.abs(((got - record.solar_azimuth_standard_deg + 540) % 360) - 180);
      expect(diff, `azimuth at ${record.utc}`).toBeLessThanOrEqual(0.1);
    }
  });

  it("puts the sun east of north before local noon and west of north after it", () => {
    const morning = solarPosition(new Date(f6.records[0].utc), lat, lonE);
    const afternoon = solarPosition(new Date(f6.records[3].utc), lat, lonE);
    expect(morning.azimuth_deg).toBeGreaterThan(0);
    expect(morning.azimuth_deg).toBeLessThan(180);
    expect(afternoon.azimuth_deg).toBeGreaterThan(180);
    expect(afternoon.azimuth_deg).toBeLessThan(360);
  });
});
