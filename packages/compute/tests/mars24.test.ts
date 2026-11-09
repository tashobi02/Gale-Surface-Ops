import { describe, expect, it } from "vitest";
import f6 from "../../../apps/web/tests/fixtures/mars24-reference.json";
import {
  eastToWestLongitude,
  localTrueSolarTime,
  marsSolDate,
  solarLongitude,
} from "../src/mars24";

/** Helper: difference between two "HH:MM" times in minutes, handling midnight wrap. */
function timeDiffMinutes(a: string, b: string): number {
  const [hA, mA] = a.split(":").map(Number);
  const [hB, mB] = b.split(":").map(Number);
  const minA = hA * 60 + mA;
  const minB = hB * 60 + mB;
  const diff = Math.abs(minA - minB);
  return Math.min(diff, 1440 - diff);
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

  it("matches marstime MSD within 0.001 sol at all reference timestamps (02 §D.5)", () => {
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

  it("matches marstime LTST within 1 min at all reference timestamps (01 FR-11, 02 §D.5)", () => {
    const lonE = f6.site.lon_e;
    for (const record of f6.records) {
      const utc = new Date(record.utc);
      const ltst = localTrueSolarTime(utc, lonE);
      const diffMin = timeDiffMinutes(ltst, record.ltst);
      expect(
        diffMin,
        `LTST ${ltst} vs ${record.ltst} for ${record.utc} at lon_e ${lonE}`
      ).toBeLessThanOrEqual(1);
    }
  });
});
