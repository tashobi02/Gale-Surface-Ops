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

// docs/specs/02 §D.5 and 01 FR-11 (TASK-06 / T06.03).
describe("sun position and sunrise/sunset (T06.03 / T06.07, FR-11)", () => {
  const { lat, lon_e: lonE } = f6.site;

  it("matches marstime solar elevation within 0.1° at all reference timestamps (01 FR-11, 02 §D.5)", () => {
    for (const record of f6.records) {
      const utc = new Date(record.utc);
      const pos = solarPosition(utc, lat, lonE);
      expect(
        pos.elevation_deg,
        `Solar elevation for ${record.utc} at Gale`
      ).toBeCloseTo(record.solar_elevation_deg, 1);
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
});
