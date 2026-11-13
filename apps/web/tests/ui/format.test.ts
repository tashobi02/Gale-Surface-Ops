/**
 * T12.01 — number formats, one `format.ts` (04 §D.4 Number formats; FD-124): km 2 decimals, min integer, ° 1 decimal,
 * mSv 2 decimals, mGy 1 decimal, m integer, % integer; units attached with a thin space; "—" for a value we do not have.
 */
import { describe, expect, it } from "vitest";
import { DASH, THIN_SPACE, UNIT_DECIMALS, formatNumber, formatWithUnit, metresToKilometres } from "../../src/ui/components/format";

describe("format.ts number formats (FD-124)", () => {
  it("km two decimals", () => {
    expect(formatNumber(0.42, "km")).toBe("0.42");
    expect(formatNumber(5, "km")).toBe("5.00");
    expect(formatNumber(3.0612, "km")).toBe("3.06");
  });

  it("min integer", () => {
    expect(formatNumber(12, "min")).toBe("12");
    expect(formatNumber(147.6, "min")).toBe("148");
    expect(formatNumber(147.4, "min")).toBe("147");
  });

  it("degrees one decimal", () => {
    expect(formatNumber(12.64, "°")).toBe("12.6");
    expect(formatNumber(10, "°")).toBe("10.0");
  });

  it("mSv two decimals", () => {
    expect(formatNumber(0.066, "mSv")).toBe("0.07");
    expect(formatNumber(1, "mSv")).toBe("1.00");
  });

  it("mGy one decimal", () => {
    expect(formatNumber(3.14, "mGy")).toBe("3.1");
    expect(formatNumber(0, "mGy")).toBe("0.0");
  });

  it("metres integer", () => {
    expect(formatNumber(1184.2, "m")).toBe("1184");
    expect(formatNumber(18.5, "m")).toBe("19");
  });

  it("percent integer", () => {
    expect(formatNumber(87.5, "%")).toBe("88");
    expect(formatNumber(0, "%")).toBe("0");
  });

  it("has exactly the table of 04 §D.4, nothing more", () => {
    expect(UNIT_DECIMALS).toEqual({ km: 2, min: 0, "°": 1, mSv: 2, mGy: 1, m: 0, "%": 0 });
  });

  it("non-finite is dash", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null, undefined, "12", {}, []]) {
      expect(formatNumber(bad, "km")).toBe(DASH);
      expect(formatWithUnit(bad, "km")).toBe(DASH);
    }
    expect(DASH).toBe("—");
  });

  it("attaches the unit with a thin space, and shows the dash alone when there is no value", () => {
    expect(THIN_SPACE).toBe(" ");
    expect(formatWithUnit(0.42, "km")).toBe(`0.42${THIN_SPACE}km`);
    expect(formatWithUnit(9, "min")).toBe(`9${THIN_SPACE}min`);
    expect(formatWithUnit(12.6, "°")).toBe(`12.6${THIN_SPACE}°`);
    expect(formatWithUnit(Number.NaN, "min")).toBe("—");
  });

  it("never shows a negative zero", () => {
    expect(formatNumber(-0, "km")).toBe("0.00");
    expect(formatNumber(-0.001, "km")).toBe("0.00");
    expect(formatNumber(-0.4, "min")).toBe("0");
    expect(formatNumber(-3.2, "m")).toBe("-3");
  });

  it("keeps large values whole, with no grouping separators", () => {
    expect(formatNumber(1234567.891, "m")).toBe("1234568");
    expect(formatNumber(12345.678, "km")).toBe("12345.68");
  });

  it("converts metres to kilometres for display only", () => {
    expect(metresToKilometres(1500)).toBe(1.5);
    expect(formatNumber(metresToKilometres(420), "km")).toBe("0.42");
    expect(metresToKilometres(Number.NaN)).toBeNull();
    expect(metresToKilometres(null)).toBeNull();
  });
});
