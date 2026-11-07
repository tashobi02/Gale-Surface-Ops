/**
 * Tests for the T05b.05 benchmark's grid builder (packages/compute/bench/grid.ts; FR-39, NFR-02).
 * The benchmark itself is not a test (no timing assertion runs in `make test-web`); this file pins what it measures:
 * the grid size comes from the site file and the haven cell, never from a typed number, and the two bench terrains
 * are deterministic, fresh on every call, and not degenerate (the rough one is mostly walkable, has some hazards).
 * Expected values are derived from site.json and from the grid's own elevations, not typed in.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FLAG_BITS } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { benchGridSize, buildBenchGrid, readBenchSite, type BenchSite } from "../bench/grid";
import { habTimeField } from "../src/haven";
import { HAVEN_CELL_M, defaultScenario } from "./fixtures/v2grids";

const here = dirname(fileURLToPath(import.meta.url));
const siteJson = JSON.parse(readFileSync(join(here, "../../../pipeline/sites/gale_boxwork/site.json"), "utf8")) as {
  aoi: { extent_m: [number, number, number, number] };
  hab_mast: { x_m: number; y_m: number };
};

/** A small site for the cheap property tests; the size and hab tests use the real file. */
const small: BenchSite = { extent_m: [-500, -400, 500, 400], hab: { x_m: 20, y_m: -30 } };

const HAZARD = 1 << FLAG_BITS.HARD_HAZARD;
const NO_DATA = 1 << FLAG_BITS.NO_DATA;

function cellOfPoint(g: ReturnType<typeof buildBenchGrid>, x: number, y: number): number {
  const i = Math.floor((g.meta.origin_m[1] - y) / g.meta.cell_m);
  const j = Math.floor((x - g.meta.origin_m[0]) / g.meta.cell_m);
  return i * g.meta.width + j;
}

describe("readBenchSite", () => {
  it("reads the AOI extent and the hab from the site file", () => {
    const s = readBenchSite();
    expect(s.extent_m).toEqual(siteJson.aoi.extent_m);
    expect(s.hab).toEqual({ x_m: siteJson.hab_mast.x_m, y_m: siteJson.hab_mast.y_m });
  });

  it("throws on a missing file", () => {
    expect(() => readBenchSite(join(here, "no-such-site.json"))).toThrow();
  });
});

describe("benchGridSize", () => {
  it("is extent / cell in each axis", () => {
    const [minx, miny, maxx, maxy] = siteJson.aoi.extent_m;
    expect(benchGridSize(siteJson.aoi.extent_m, HAVEN_CELL_M)).toEqual({
      width: (maxx - minx) / HAVEN_CELL_M,
      height: (maxy - miny) / HAVEN_CELL_M,
    });
  });

  it("throws when the extent is not a whole number of cells in x", () => {
    expect(() => benchGridSize([0, 0, 1001, 1000], 5)).toThrow(/whole number/);
  });

  it("throws when the extent is not a whole number of cells in y", () => {
    expect(() => benchGridSize([0, 0, 1000, 1002], 5)).toThrow(/whole number/);
  });

  it.each([
    ["zero width", [0, 0, 0, 100]],
    ["negative height", [0, 100, 100, 0]],
    ["NaN", [0, 0, Number.NaN, 100]],
  ] as const)("throws on %s", (_name, ext) => {
    expect(() => benchGridSize([...ext], 5)).toThrow();
  });

  it("throws on a cell size that is not positive", () => {
    expect(() => benchGridSize([0, 0, 100, 100], 0)).toThrow();
  });
});

describe("buildBenchGrid layout", () => {
  it.each(["flat", "rough"] as const)("%s: meta, array lengths and north-up origin follow the site", (terrain) => {
    const g = buildBenchGrid(small, terrain);
    const { width, height } = benchGridSize(small.extent_m, HAVEN_CELL_M);
    expect(g.meta.cell_m).toBe(HAVEN_CELL_M);
    expect(g.meta.width).toBe(width);
    expect(g.meta.height).toBe(height);
    expect(g.meta.origin_m).toEqual([small.extent_m[0], small.extent_m[3]]);
    expect(g.meta.row_order).toBe("north_up");
    expect(g.meta.hab_mast.x_m).toBe(small.hab.x_m);
    expect(g.meta.hab_mast.y_m).toBe(small.hab.y_m);
    for (const a of [g.elevation, g.slopeP90, g.slopeMax, g.flags, g.commHab]) expect(a.length).toBe(width * height);
  });

  it("the real site gives the size derived from site.json", () => {
    const g = buildBenchGrid(readBenchSite(), "flat");
    const [minx, miny, maxx, maxy] = siteJson.aoi.extent_m;
    expect(g.meta.width).toBe((maxx - minx) / HAVEN_CELL_M);
    expect(g.meta.height).toBe((maxy - miny) / HAVEN_CELL_M);
  });

  it("throws, building nothing, when the extent is not a whole number of cells", () => {
    expect(() => buildBenchGrid({ extent_m: [0, 0, 1001, 1000], hab: { x_m: 10, y_m: 10 } }, "flat")).toThrow(/whole number/);
  });

  it("throws when the hab is outside the extent", () => {
    expect(() => buildBenchGrid({ extent_m: small.extent_m, hab: { x_m: 5000, y_m: 0 } }, "rough")).toThrow(/hab/);
  });
});

describe("buildBenchGrid freshness (cold runs depend on it)", () => {
  it.each(["flat", "rough"] as const)("%s: every call returns a new grid with its own arrays", (terrain) => {
    const a = buildBenchGrid(small, terrain);
    const b = buildBenchGrid(small, terrain);
    expect(a).not.toBe(b);
    expect(a.meta).not.toBe(b.meta);
    expect(a.elevation).not.toBe(b.elevation);
    expect(a.slopeP90).not.toBe(b.slopeP90);
    expect(a.slopeMax).not.toBe(b.slopeMax);
    expect(a.flags).not.toBe(b.flags);
    expect(a.commHab).not.toBe(b.commHab);
  });
});

describe("flat terrain", () => {
  const g = buildBenchGrid(small, "flat");
  it("is all zero elevation, zero slope, no flags", () => {
    expect(g.elevation.every((v) => v === 0)).toBe(true);
    expect(g.slopeP90.every((v) => v === 0)).toBe(true);
    expect(g.slopeMax.every((v) => v === 0)).toBe(true);
    expect(g.flags.every((v) => v === 0)).toBe(true);
  });
});

describe("rough terrain", () => {
  const g = buildBenchGrid(small, "rough");
  const n = g.elevation.length;
  const hard = defaultScenario().hard_slope_limit_deg;

  it("is deterministic: two builds are identical", () => {
    const h = buildBenchGrid(small, "rough");
    expect(Array.from(h.elevation)).toEqual(Array.from(g.elevation));
    expect(Array.from(h.slopeP90)).toEqual(Array.from(g.slopeP90));
    expect(Array.from(h.slopeMax)).toEqual(Array.from(g.slopeMax));
    expect(Array.from(h.flags)).toEqual(Array.from(g.flags));
  });

  it("has finite elevations (no NaN) and no no-data slope code or NO_DATA flag", () => {
    expect(g.elevation.every((v) => Number.isFinite(v))).toBe(true);
    expect(g.slopeMax.every((v) => v !== 255)).toBe(true);
    expect(g.slopeP90.every((v) => v !== 255)).toBe(true);
    expect(g.flags.every((v) => (v & NO_DATA) === 0)).toBe(true);
  });

  it("is not flat: elevation varies and some cells are sloped", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of g.elevation) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(hi - lo).toBeGreaterThan(1);
    expect(g.slopeMax.some((v) => v > 0)).toBe(true);
  });

  it("is mostly under the default suit hard slope limit (a bench that is all wall measures nothing)", () => {
    let over = 0;
    for (let k = 0; k < n; k++) if (g.slopeP90[k]! / 4 > hard) over++;
    expect(over / n).toBeLessThan(0.1);
  });

  it("has a few hard hazards, but under 5 % of cells", () => {
    let h = 0;
    for (let k = 0; k < n; k++) if ((g.flags[k]! & HAZARD) !== 0) h++;
    expect(h).toBeGreaterThan(0);
    expect(h / n).toBeLessThan(0.05);
  });

  it("slope labels match the elevation surface (central difference, within the u8 step plus the stencil error)", () => {
    const { width, height, cell_m } = g.meta;
    let checked = 0;
    for (let i = 1; i < height - 1; i += 17) {
      for (let j = 1; j < width - 1; j += 13) {
        const k = i * width + j;
        const dzdx = (g.elevation[k + 1]! - g.elevation[k - 1]!) / (2 * cell_m);
        const dzdy = (g.elevation[k - width]! - g.elevation[k + width]!) / (2 * cell_m);
        const deg = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
        expect(Math.abs(g.slopeMax[k]! / 4 - deg)).toBeLessThan(0.75);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe.each(["flat", "rough"] as const)("%s grid at the real site (what the benchmark times)", (terrain) => {
  const site = readBenchSite();
  const g = buildBenchGrid(site, terrain);

  it("keeps the hab cell enterable", () => {
    const k = cellOfPoint(g, site.hab.x_m, site.hab.y_m);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(k).toBeLessThan(g.elevation.length);
    expect(g.flags[k]! & (HAZARD | NO_DATA)).toBe(0);
    expect(g.slopeP90[k]! / 4).toBeLessThanOrEqual(defaultScenario().hard_slope_limit_deg);
  });

  it("lets a hab field reach most of the grid (the timed run is real work, not an early exit)", () => {
    const f = habTimeField(g, site.hab, defaultScenario());
    let reached = 0;
    for (const s of f.seconds) if (Number.isFinite(s)) reached++;
    expect(reached / f.seconds.length).toBeGreaterThan(0.8);
  });
});
