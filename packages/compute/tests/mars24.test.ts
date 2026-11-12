import { describe, expect, it } from "vitest";
import f6 from "../../../apps/web/tests/fixtures/mars24-reference.json";
import {
  coordinatedMarsTime,
  eastToWestLongitude,
  j2000OffsetTt,
  localTrueSolarTime,
  marsSolDate,
  mslSol,
  solarLongitude,
} from "../src/mars24";
import { solarDeclination } from "../src/sun";

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

  // BD-55 / BD-56 (12 Nov 2026): the tolerances below are the ratified ones: L_s 0.05 deg, MSD 0.001 sol,
  // LTST 1 min (FR-11). The Mars Year table and the UTC-to-TT handling are checked independently further down
  // (Ls wrap instants, NASA GISS worked examples), not only against F6.
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
      // Bound 0.05° (strictly less than), ratified by BD-55.
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

  // Touchdown instant 2012-08-06T05:17:57Z: NASA, "Five Years Ago and 154 Million Miles Away: Touchdown!"
  // (Webster, Cantillo, Brown, 2 Aug 2017), as quoted by the Curiosity (rover) article, accessed 12 Nov 2026.
  // The F6 record for the same instant is the checked reference; L_s about 150.7 deg is this file's
  // sanity bound, matched to the F6 value within 0.05 deg.
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

  it("every L_s wrap (L_s = 0 deg) between 1972 and 2100 starts the next Mars Year (Clancy table check, BD-55)", () => {
    // Independent of the Clancy table: scan the L_s model for its own 360 -> 0 wraps and require the Mars
    // Year to change within one day of each (the model and the Clancy zero crossings differ by well under a day).
    const stepMs = 86_400_000;
    const end = Date.UTC(2100, 0, 1);
    let prevMs = Date.UTC(1972, 0, 2);
    let prev = solarLongitude(new Date(prevMs));
    let wraps = 0;
    for (let ms = prevMs + stepMs; ms < end; ms += stepMs) {
      const cur = solarLongitude(new Date(ms));
      if (cur.ls_deg < prev.ls_deg) {
        wraps += 1;
        const before = solarLongitude(new Date(ms - 2 * stepMs)).mars_year;
        const after = solarLongitude(new Date(ms + 2 * stepMs)).mars_year;
        expect(after, `Mars Year after the wrap near ${new Date(ms).toISOString()}`).toBe(before + 1);
        expect(prev.mars_year, `Mars Year the day before the wrap`).toBe(before);
        expect(cur.mars_year, `Mars Year the day of the wrap`).toBe(before + 1);
      }
      prev = cur;
      prevMs = ms;
    }
    // 128 years at 686.98 days per Mars Year.
    expect(wraps).toBeGreaterThanOrEqual(68);
    expect(wraps).toBeLessThanOrEqual(69);
  });

  it("uses TT - UTC = 69.184 s after 2017-01-01 and IERS Bulletin C 72 adds no leap second in 2026 (BD-55)", () => {
    // IERS Bulletin C 72 (Paris, 6 July 2026): no leap second at the end of December 2026; UTC-TAI = -37 s
    // from 2017-01-01 until further notice. Checked 12 Nov 2026 (https://hpiers.obspm.fr/iers/bul/bulc/bulletinc.dat).
    for (const timestamp of ["2026-06-30T23:59:59Z", "2026-11-14T08:00:00Z", "2027-01-01T00:00:00Z", "2030-01-01T00:00:00Z"]) {
      const utc = new Date(timestamp);
      const utcJ2000Days = utc.getTime() / 86_400_000 + (2_440_587.5 - 2_451_545);
      const ttMinusUtcSeconds = (j2000OffsetTt(utc) - utcJ2000Days) * 86_400;
      expect(Math.abs(ttMinusUtcSeconds - 69.184), timestamp).toBeLessThanOrEqual(0.0001);
    }
  });
});

// NASA GISS Mars24 "Algorithm and Worked Examples" (https://www.giss.nasa.gov/tools/mars24/help/algorithm.html,
// page updated 2025-01-07, fetched 12 Nov 2026). The page's equations B-1, B-2, C-2 and D-2 were revised in 2015
// (Allison 2015), so these printed values pin the current constants. Tolerances follow the printed precision
// (5 decimals, so 0.001 deg or 0.0005 h) widened only for the chain of roundings in the page's own steps.
describe("NASA GISS Mars24 worked examples (BD-56, FR-11)", () => {
  // Example 1: 2000-01-06T00:00:00Z at 0 W, 0 N (MST 23:59:39).
  // Example 2: MER-A Spirit, 2004-01-03T13:46:31Z (millis 1073137591000) at 184.702 W (175.298 E), -14.640 N.
  const examples = [
    {
      name: "2000-01-06T00:00:00Z (0 W)",
      utc: new Date(947_116_800_000),
      lonE: 0,
      ls: 277.18758, // B-5 (mod 360 of 1047.32416 in example 2)
      mtcHours: 23.99425, // C-2
      declination: -25.22825, // D-1
      ltstHours: 23.6484, // C-4
    },
    {
      name: "2004-01-03T13:46:31Z (Spirit)",
      utc: new Date(1_073_137_591_000),
      lonE: 360 - 184.702,
      ls: 327.32416,
      mtcHours: 13.16537,
      declination: -13.42065,
      ltstHours: 0.00025,
    },
  ];

  it.each(examples)("$name: L_s, MTC, declination and LTST match the page", (ex) => {
    expect(Math.abs(solarLongitude(ex.utc).ls_deg - ex.ls), "L_s (B-5)").toBeLessThanOrEqual(0.001);
    const ott = j2000OffsetTt(ex.utc);
    expect(Math.abs(coordinatedMarsTime(ott) - ex.mtcHours), "MST at the prime meridian (C-2)").toBeLessThanOrEqual(0.0005);
    expect(Math.abs(solarDeclination(ex.ls) - ex.declination), "declination (D-1)").toBeLessThanOrEqual(0.001);
    const [h, m] = localTrueSolarTime(ex.utc, ex.lonE).split(":").map(Number);
    let diffMin = Math.abs(h * 60 + m - ex.ltstHours * 60);
    diffMin = Math.min(diffMin, 1440 - diffMin);
    expect(diffMin, "LTST (C-4) within the HH:MM resolution").toBeLessThanOrEqual(1);
  });
});

// MSL mission sol (BD-122; N-06, N-15). Sol 0 is the touchdown sol, 2012-08-06T05:17:57Z (NASA, "Five Years Ago and
// 154 Million Miles Away: Touchdown!", 2 Aug 2017); sols change at local mean solar midnight at the given longitude.
describe("mslSol (MSL mission sol, FR-36)", () => {
  const lonE = f6.site.lon_e;
  const MEAN_SOL_MS = 1.027491252 * 86_400_000;
  const touchdown = new Date("2012-08-06T05:17:57Z");

  it("is 0 at touchdown and 1 after the next local mean solar midnight", () => {
    expect(mslSol(touchdown, lonE)).toBe(0);
    // One mean sol is exactly one Mars Solar Date, so the local mean solar date advances by exactly 1.
    expect(mslSol(new Date(touchdown.getTime() + MEAN_SOL_MS), lonE)).toBe(1);
    expect(mslSol(new Date(touchdown.getTime() + 10 * MEAN_SOL_MS), lonE)).toBe(10);
  });

  it("puts the 20 May 2024 surge in sol 4190 (02 §C L9) and the F6 record of 18 May 2024 in sol 4188 (BD-55)", () => {
    expect(mslSol(new Date("2024-05-20T12:00:00Z"), lonE)).toBe(4190);
    expect(mslSol(new Date("2024-05-18T06:00:00Z"), lonE)).toBe(4188);
  });

  it("advances by exactly one at each local mean solar midnight and never goes back", () => {
    const start = Date.parse("2026-11-14T00:00:00Z");
    let prev = mslSol(new Date(start), lonE);
    let steps = 0;
    for (let ms = start + 600_000; ms < start + 5 * MEAN_SOL_MS; ms += 600_000) {
      const cur = mslSol(new Date(ms), lonE);
      expect(cur - prev === 0 || cur - prev === 1, `step at ${new Date(ms).toISOString()}`).toBe(true);
      if (cur !== prev) steps += 1;
      prev = cur;
    }
    expect(steps).toBe(5);
  });

  it("moves to the next sol at local mean solar midnight: LTST wraps 24 h to 0 h where the sol changes, within the equation of time", () => {
    // Local mean solar midnight is where LMST = 0; the true solar time there differs by the equation of time
    // (at most about 0.7 h), so LTST near the change is within 1 h of midnight.
    const start = Date.parse("2026-11-14T00:00:00Z");
    for (let ms = start; ms < start + 3 * MEAN_SOL_MS; ms += 60_000) {
      if (mslSol(new Date(ms + 60_000), lonE) !== mslSol(new Date(ms), lonE)) {
        const [h, m] = localTrueSolarTime(new Date(ms), lonE).split(":").map(Number);
        const ltst = h + m / 60;
        expect(Math.min(ltst, 24 - ltst), `LTST at the sol change ${new Date(ms).toISOString()}`).toBeLessThan(1);
      }
    }
  });

  it("depends on longitude only through the local day boundary: sites 90 degrees apart differ by at most one sol", () => {
    const t = new Date("2026-11-14T08:00:00Z");
    const here = mslSol(t, lonE);
    expect(Math.abs(mslSol(t, lonE + 90) - here)).toBeLessThanOrEqual(1);
  });

  it("throws RangeError for an invalid Date, a non-finite longitude and dates before 1972", () => {
    expect(() => mslSol(new Date("not-a-date"), lonE)).toThrow(RangeError);
    expect(() => mslSol(touchdown, Number.NaN)).toThrow(RangeError);
    expect(() => mslSol(new Date("1969-07-20T20:17:40Z"), lonE)).toThrow(RangeError);
  });
});
