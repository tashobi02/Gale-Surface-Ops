import { describe, expect, it } from "vitest";
import f6 from "../../../apps/web/tests/fixtures/mars24-reference.json";
import { solarPosition, sunriseSunset } from "../src/sun";

/** Helper: difference between two "HH:MM" times in minutes, handling midnight wrap. */
function timeDiffMinutes(a: string, b: string): number {
  const [hA, mA] = a.split(":").map(Number);
  const [hB, mB] = b.split(":").map(Number);
  const minA = hA * 60 + mA;
  const minB = hB * 60 + mB;
  const diff = Math.abs(minA - minB);
  return Math.min(diff, 1440 - diff);
}

// TODO(decision): Schedule T06.07 solar position and flat-horizon sunrise/sunset implementation after the reference conventions are verified; the T06.03 sun cases remain PENDING-gated until then.
// Probe both valid F6 calls; only the known stub is skipped. PENDING_RED=1 runs the cases.
const PENDING = !process.env.PENDING_RED && (() => {
  let pending = false;
  const utc = new Date(f6.records[0].utc);
  for (const probe of [
    () => solarPosition(utc, f6.site.lat, f6.site.lon_e),
    () => sunriseSunset(utc, f6.site.lat, f6.site.lon_e),
  ]) {
    try {
      probe();
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "TODO(T06.07): not implemented") throw error;
      pending = true;
    }
  }
  return pending;
})();

// docs/specs/02 §D.5 and 01 FR-11 (TASK-06 / T06.03).
describe.skipIf(PENDING)("sun position and sunrise/sunset (T06.03 / T06.07, FR-11)", () => {
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
});
