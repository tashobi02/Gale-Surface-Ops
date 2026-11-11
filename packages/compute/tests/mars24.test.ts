import { describe, expect, it } from "vitest";
import f6 from "../../../apps/web/tests/fixtures/mars24-reference.json";
import {
  eastToWestLongitude,
  localTrueSolarTime,
  marsSolDate,
  solarLongitude,
} from "../src/mars24";

/** Helper: parse "HH:MM" time into decimal hours. */
function parseLtstHours(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h + m / 60;
}

// docs/specs/02 §D.5, §C.4.1, and 01 FR-11 (TASK-06 / T06.03).
describe("mars24 time functions (T06.03 / T06.06, FR-11)", () => {
  it("converts east to west longitude: west = (360 − east) mod 360, tested at Gale (02 §C.4.1)", () => {
    // Gale crater center: lon_e = 137.38 -> west = 222.62
    expect(eastToWestLongitude(137.38)).toBeCloseTo(222.62, 4);
    expect(eastToWestLongitude(0)).toBe(0);
    expect(eastToWestLongitude(360)).toBe(0);
    expect(eastToWestLongitude(90)).toBe(270);
    expect(eastToWestLongitude(270)).toBe(90);
  });

  it("matches marstime MSD within 0.005 sol at all reference timestamps (02 §D.5)", () => {
    for (const record of f6.records) {
      const utc = new Date(record.utc);
      const msd = marsSolDate(utc);
      expect(msd, `MSD for ${record.utc}`).toBeCloseTo(record.msd, 2);
    }
  });

  it("matches marstime L_s and Mars Year at all reference timestamps (02 §D.5)", () => {
    for (const record of f6.records) {
      const utc = new Date(record.utc);
      const res = solarLongitude(utc);
      expect(res.mars_year, `Mars Year for ${record.utc}`).toBe(record.mars_year);
      expect(res.ls_deg, `L_s for ${record.utc}`).toBeCloseTo(record.ls_deg, 1);
    }
  });

  it("matches marstime LTST within 1 min against fixture ltst_hours at all reference timestamps (01 FR-11, 02 §D.5)", () => {
    const lonE = f6.site.lon_e;
    for (const record of f6.records) {
      const utc = new Date(record.utc);
      const ltstStr = localTrueSolarTime(utc, lonE);
      const computedHours = parseLtstHours(ltstStr);
      let diffHours = Math.abs(computedHours - record.ltst_hours);
      if (diffHours > 12) diffHours = 24 - diffHours;
      const diffMin = diffHours * 60;
      expect(
        diffMin,
        `LTST ${ltstStr} (${computedHours.toFixed(2)}h) vs ${record.ltst_hours}h for ${record.utc} at lon_e ${lonE}`
      ).toBeLessThanOrEqual(1.0);
    }
  });

  it("reproduces published MSL Curiosity touchdown sanity case (2012-08-06T05:17:57Z: L_s ≈ 150.7°, LMST ≈ 15:0x)", () => {
    // NASA MSL touchdown confirmed at Gale Crater: 2012-08-06T05:17:57Z (Allison & McEwen 2000 / JPL MSL Mission)
    const landingUtc = new Date("2012-08-06T05:17:57Z");
    const sol = solarLongitude(landingUtc);
    expect(sol.ls_deg).toBeCloseTo(150.7, 1);
    expect(sol.mars_year).toBe(31);

    // Gale crater center lon_e = 137.38° (MSD ~49269.245, MTC ~5.89h, LMST ~15:03, LTST ~15:36 with EOT ~33 min)
    const ltst = localTrueSolarTime(landingUtc, 137.38);
    const hours = parseLtstHours(ltst);
    expect(hours).toBeCloseTo(15.6, 1);
  });

  it("throws RangeError on invalid Date instances", () => {
    const invalidDate = new Date("not-a-date");
    expect(() => marsSolDate(invalidDate)).toThrow(RangeError);
    expect(() => solarLongitude(invalidDate)).toThrow(RangeError);
    expect(() => localTrueSolarTime(invalidDate, 137.38)).toThrow(RangeError);
  });

  it("throws RangeError for dates before 1972-01-01 UTC (pre-modern leap seconds)", () => {
    const preLeapDate = new Date("1969-07-20T20:17:40Z");
    expect(() => marsSolDate(preLeapDate)).toThrow(RangeError);
    expect(() => solarLongitude(preLeapDate)).toThrow(RangeError);
    expect(() => localTrueSolarTime(preLeapDate, 137.38)).toThrow(RangeError);
  });

  it("throws RangeError on non-finite longitudes", () => {
    const utc = new Date("2026-11-14T08:00:00Z");
    expect(() => eastToWestLongitude(NaN)).toThrow(RangeError);
    expect(() => eastToWestLongitude(Infinity)).toThrow(RangeError);
    expect(() => localTrueSolarTime(utc, NaN)).toThrow(RangeError);
  });
});
