/**
 * T32.30: bearing and distance in projected metres (docs/specs/02 §C.1; 01 FR-33; backend decision BD-95). Pure
 * planar geometry on the working projection's axes: x east, y north. Bearing is clockwise from grid north (+y); the
 * distance is the Euclidean distance. Neither uses an Earth or Mars radius, `ol/sphere` or a geodesic (CLAUDE.md §2).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as compute from "../src";
import { bearingDeg, horizontalDistanceM } from "../src/geometry";

const here = dirname(fileURLToPath(import.meta.url));
const O = { x_m: 0, y_m: 0 };

describe("bearingDeg (BD-95: 0-360, clockwise from grid north = +y)", () => {
  it("is 0 for +y, 90 for +x, 180 for -y and 270 for -x", () => {
    expect(bearingDeg(O, { x_m: 0, y_m: 10 })).toBe(0);
    expect(bearingDeg(O, { x_m: 10, y_m: 0 })).toBe(90);
    expect(bearingDeg(O, { x_m: 0, y_m: -10 })).toBe(180);
    expect(bearingDeg(O, { x_m: -10, y_m: 0 })).toBe(270);
  });

  it("is 45, 135, 225 and 315 on the diagonals", () => {
    expect(bearingDeg(O, { x_m: 1, y_m: 1 })).toBeCloseTo(45, 12);
    expect(bearingDeg(O, { x_m: 1, y_m: -1 })).toBeCloseTo(135, 12);
    expect(bearingDeg(O, { x_m: -1, y_m: -1 })).toBeCloseTo(225, 12);
    expect(bearingDeg(O, { x_m: -1, y_m: 1 })).toBeCloseTo(315, 12);
  });

  it("depends on the offset between the points, not on where they are", () => {
    expect(bearingDeg({ x_m: 5000, y_m: -3000 }, { x_m: 5000, y_m: -2990 })).toBe(0);
    expect(bearingDeg({ x_m: -1800, y_m: -1500 }, { x_m: -1700, y_m: -1500 })).toBe(90);
    expect(bearingDeg({ x_m: 1e6, y_m: 1e6 }, { x_m: 1e6 + 3, y_m: 1e6 + 4 })).toBeCloseTo(bearingDeg(O, { x_m: 3, y_m: 4 }), 6);
  });

  it("is always in [0, 360), including a hair west of north, which must not round up to 360", () => {
    for (let k = 0; k < 720; k++) {
      const rad = (k * Math.PI) / 360;
      const b = bearingDeg(O, { x_m: Math.sin(rad) * 1000, y_m: Math.cos(rad) * 1000 });
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
    expect(bearingDeg(O, { x_m: -1e-300, y_m: 1 })).toBeLessThan(360);
    expect(Object.is(bearingDeg(O, { x_m: -0, y_m: 1 }), 0)).toBe(true);
  });

  it("is a quarter turn per quarter turn: 30 degrees east of north is 30", () => {
    const rad = (30 * Math.PI) / 180;
    expect(bearingDeg(O, { x_m: Math.sin(rad) * 500, y_m: Math.cos(rad) * 500 })).toBeCloseTo(30, 10);
  });

  it("is 0 for two coincident points (the convention: no direction, never NaN)", () => {
    expect(bearingDeg({ x_m: 7, y_m: 7 }, { x_m: 7, y_m: 7 })).toBe(0);
  });

  it("rejects a non-finite coordinate with a RangeError", () => {
    expect(() => bearingDeg(O, { x_m: Number.NaN, y_m: 1 })).toThrow(RangeError);
    expect(() => bearingDeg({ x_m: Infinity, y_m: 0 }, O)).toThrow(RangeError);
  });
});

describe("horizontalDistanceM (BD-95: straight-line, projected metres)", () => {
  it("is the Euclidean distance: a 3-4-5 triangle is 5 m", () => {
    expect(horizontalDistanceM(O, { x_m: 3, y_m: 4 })).toBe(5);
  });

  it("is symmetric, zero for the same point, and unchanged by a shift of both points", () => {
    const a = { x_m: -1800, y_m: -1500 };
    const b = { x_m: 1200.5, y_m: 700.25 };
    expect(horizontalDistanceM(a, b)).toBe(horizontalDistanceM(b, a));
    expect(horizontalDistanceM(a, a)).toBe(0);
    expect(horizontalDistanceM({ x_m: a.x_m + 4000, y_m: a.y_m - 9000 }, { x_m: b.x_m + 4000, y_m: b.y_m - 9000 })).toBeCloseTo(horizontalDistanceM(a, b), 8);
  });

  it("is not a surface distance: two points 1e6 m apart are 1e6 m apart whatever the radius of the body", () => {
    expect(horizontalDistanceM(O, { x_m: 1e6, y_m: 0 })).toBe(1e6);
    expect(horizontalDistanceM(O, { x_m: 0, y_m: -2 * 3_396_190 })).toBe(2 * 3_396_190);
  });

  it("rejects a non-finite coordinate with a RangeError", () => {
    expect(() => horizontalDistanceM(O, { x_m: 1, y_m: Number.NaN })).toThrow(RangeError);
  });
});

describe("module hygiene (CLAUDE.md §2: Mars CRS)", () => {
  it("is exported from the package index", () => {
    expect(compute.bearingDeg).toBe(bearingDeg);
    expect(compute.horizontalDistanceM).toBe(horizontalDistanceM);
  });

  it("uses no Earth-radius helper, no ol/sphere and no body radius", () => {
    const source = readFileSync(join(here, "../src/geometry.ts"), "utf8");
    expect(source).not.toMatch(/ol\/sphere|6371|6378|3396190|3_396_190|getDistance|haversine/i);
  });
});
