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

/** Helper: parse "HH:MM" time into decimal hours. */
function parseLtstHours(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h + m / 60;
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
      // Provisional bound 0.05° (strictly less than); TODO(decision): ratify, see
      // docs/tasks/TASK-06_mars24-and-radiation.md#spec-questions
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

  it("matches F6 continuous LTST (ltst_hours, not the rounded HH:MM string) within 1 min at all reference timestamps (01 FR-11, 02 §D.5)", () => {
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

  // TODO(verify): the MSL touchdown cross-check below is a sanity case, not an independent reference. The
  // touchdown instant and L_s 150.7° / Mars Year 31 were taken from the branch author's notes and have no
  // citation in this repo; confirm them against a published MSL landing source before treating this as
  // evidence. The F6 record for the same instant (2012-08-06T05:17:57Z) is the checked reference; the former
  // LTST assertion (15.6 h) was this implementation's own output and has been dropped.
  it("MSL touchdown instant (2012-08-06T05:17:57Z): L_s about 150.7° and Mars Year 31, matching F6", () => {
    const landingUtc = new Date("2012-08-06T05:17:57Z");
    const sol = solarLongitude(landingUtc);
    const record = f6.records.find((r) => r.utc === "2012-08-06T05:17:57Z");
    expect(record, "F6 record for the MSL touchdown instant").toBeDefined();
    expect(sol.mars_year).toBe(31);
    expect(sol.mars_year).toBe(record!.mars_year);
    expect(Math.abs(sol.ls_deg - 150.7)).toBeLessThan(0.05);
    expect(Math.abs(sol.ls_deg - record!.ls_deg)).toBeLessThan(0.05);
  });

  it("accepts 1972-01-01T00:00:00Z (TAI-UTC 10 s, NAIF naif0012.tls) and rejects the second before it", () => {
    const first = new Date("1972-01-01T00:00:00Z");
    const utcJ2000Days = first.getTime() / 86_400_000 + (2_440_587.5 - 2_451_545);
    const ttMinusUtcSeconds = (j2000OffsetTt(first) - utcJ2000Days) * 86_400;
    expect(Math.abs(ttMinusUtcSeconds - (32.184 + 10))).toBeLessThanOrEqual(0.0001);
    expect(() => j2000OffsetTt(new Date("1971-12-31T23:59:59Z"))).toThrow(RangeError);
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
