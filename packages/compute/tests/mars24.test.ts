import { describe, expect, it } from "vitest";
import f6 from "../../../apps/web/tests/fixtures/mars24-reference.json";
import {
  eastToWestLongitude,
  j2000OffsetTt,
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
  // TAI−UTC values and transition dates: NAIF naif0012.tls, locked in pipeline/spice/kernels.lock.json.
  // Julian day arithmetic rounds at the scale of tens of microseconds.
  it.each([
    ["2014-07-01T00:00:00Z", 35],
    ["2015-06-30T23:59:59Z", 35],
    ["2015-07-01T00:00:00Z", 36],
    ["2015-07-01T00:00:01Z", 36],
    ["2016-12-31T00:00:00Z", 36],
    ["2016-12-31T23:59:59Z", 36],
    ["2017-01-01T00:00:00Z", 37],
    ["2017-01-01T00:00:01Z", 37],
  ])("uses NAIF UTC-to-TT offset at %s", (timestamp, taiMinusUtc) => {
    const utc = new Date(timestamp);
    const utcJ2000Days = utc.getTime() / 86_400_000 + (2_440_587.5 - 2_451_545);
    const ttMinusUtcSeconds = (j2000OffsetTt(utc) - utcJ2000Days) * 86_400;
    expect(Math.abs(ttMinusUtcSeconds - (32.184 + taiMinusUtc))).toBeLessThanOrEqual(0.0001);
  });
  it("converts east to west longitude: west = (360 − east) mod 360, tested at Gale (02 §C.4.1)", () => {
    // Gale crater center: lon_e = 137.38 -> west = 222.62
    expect(eastToWestLongitude(137.38)).toBeCloseTo(222.62, 4);
    expect(eastToWestLongitude(0)).toBe(0);
    expect(eastToWestLongitude(360)).toBe(0);
    expect(eastToWestLongitude(90)).toBe(270);
    expect(eastToWestLongitude(270)).toBe(90);
  });

  // TODO(verify): Pin marstime in the approved pipeline environment, verify its APIs, longitude and azimuth conventions, UTC-to-TT handling and version reporting, then regenerate F6 twice and compare bytes. Identify direct package outputs separately from generator-derived azimuth and sunrise/sunset.
  // TODO(verify): Reconcile the F6 record labelled Sol 4190 at 2024-05-18T06:00:00Z with the specifications' 2024-05-20 event date. Preserve existing numerical outputs until an approved regeneration or documented relabelling.
  // TODO(verify): Independently verify the Clancy Mars Year offset table and reference UTC-to-TT handling. TODO(decision): Ratify L_s, equation-of-time and sunrise/sunset tolerances; provisional test bounds do not establish new requirements.
  it("matches F6 MSD within 0.001 sol at all reference timestamps (02 §D.5)", () => {
    for (const record of f6.records) {
      const utc = new Date(record.utc);
      const msd = marsSolDate(utc);
      expect(Math.abs(msd - record.msd), `MSD for ${record.utc}`).toBeLessThanOrEqual(0.001);
    }
  });

  it("matches F6 L_s and Mars Year at all reference timestamps (02 §D.5)", () => {
    for (const record of f6.records) {
      const utc = new Date(record.utc);
      const res = solarLongitude(utc);
      expect(res.mars_year, `Mars Year for ${record.utc}`).toBe(record.mars_year);
      // Provisional: docs/tasks/TASK-06_mars24-and-radiation.md#spec-questions
      expect(Math.abs(res.ls_deg - record.ls_deg), `L_s for ${record.utc}`).toBeLessThan(0.05);
    }
  });

  it("matches F6 LTST within 1 min at all reference timestamps (01 FR-11, 02 §D.5)", () => {
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
