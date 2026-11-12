/**
 * Tests for routing-grid loading, addressing, and slope decoding (docs/specs/05 §C RoutingGrid, §E.1, §E.3, §E.6).
 * FR-03, FR-07. Implemented by TASK-05 (T05.05).
 */
import { describe, expect, it } from "vitest";
import { FLAG_BITS, type LoadedGridMeta } from "@marswalk/protocol";
import { FIXTURE_PROJ4 } from "../../../apps/web/tests/fixtures/grids";
import { cellIndex, decodeSlopeDeg, loadGrid } from "../src/grid";

describe("grid loader and addressing (T05.05)", () => {
  const dummyMeta: LoadedGridMeta = {
    cell_m: 10.0,
    width: 20,
    height: 15,
    origin_m: [1000, 500],
    row_order: "north_up",
    elevation_asset: "asset-elevation",
    slope_p90_asset: "asset-slope-p90",
    slope_max_asset: "asset-slope-max",
    flags_asset: "asset-flags",
    comm_hab_asset: "asset-comm-hab",
    hab_mast: { x_m: 1050, y_m: 450, height_m: 10 },
    proj4: FIXTURE_PROJ4,
  };

  function createValidBuffers(width = 20, height = 15, includeTi = true) {
    const count = width * height;
    const elevation = new Float32Array(count).fill(100.0).buffer;
    const slopeP90 = new Uint8Array(count).fill(40).buffer;
    const slopeMax = new Uint8Array(count).fill(40).buffer;
    const flags = new Uint8Array(count).fill(0).buffer;
    const commHab = new Uint8Array(count).fill(1).buffer;
    const ti = includeTi ? new Float32Array(count).fill(300.0).buffer : undefined;

    return { elevation, slopeP90, slopeMax, flags, commHab, ti };
  }

  describe("cellIndex", () => {
    it.each([NaN, Infinity, -Infinity])("returns null for nonfinite coordinates %j", (value) => {
      const grid = loadGrid(dummyMeta, createValidBuffers());
      expect(cellIndex(grid, value, 495)).toBeNull();
      expect(cellIndex(grid, 1005, value)).toBeNull();
    });
    it("cell index follows i = floor((origin_y − y)/cell), j = floor((x − origin_x)/cell)", () => {
      const buffers = createValidBuffers();
      const grid = {
        meta: dummyMeta,
        elevation: new Float32Array(buffers.elevation),
        slopeP90: new Uint8Array(buffers.slopeP90),
        slopeMax: new Uint8Array(buffers.slopeMax),
        flags: new Uint8Array(buffers.flags),
        commHab: new Uint8Array(buffers.commHab),
      };

      // Cell (0, 0) top-left corner interior: x = 1005 (j=0), y = 495 (i=0) -> index 0
      expect(cellIndex(grid, 1005, 495)).toBe(0);

      // Cell (0, 1): x = 1015 (j=1), y = 495 (i=0) -> index 1
      expect(cellIndex(grid, 1015, 495)).toBe(1);

      // Cell (1, 0): x = 1005 (j=0), y = 485 (i=1) -> index 1 * 20 + 0 = 20
      expect(cellIndex(grid, 1005, 485)).toBe(20);

      // Bottom-right cell (i = 14, j = 19):
      // x = 1000 + 19.5 * 10 = 1195, y = 500 - 14.5 * 10 = 355
      const expectedBrIndex = 14 * 20 + 19;
      expect(cellIndex(grid, 1195, 355)).toBe(expectedBrIndex);
    });

    it("returns null when coordinates are outside the grid extent", () => {
      const buffers = createValidBuffers();
      const grid = {
        meta: dummyMeta,
        elevation: new Float32Array(buffers.elevation),
        slopeP90: new Uint8Array(buffers.slopeP90),
        slopeMax: new Uint8Array(buffers.slopeMax),
        flags: new Uint8Array(buffers.flags),
        commHab: new Uint8Array(buffers.commHab),
      };

      // North of origin_y: y = 505 (i < 0)
      expect(cellIndex(grid, 1005, 505)).toBeNull();

      // West of origin_x: x = 995 (j < 0)
      expect(cellIndex(grid, 995, 495)).toBeNull();

      // East of grid: x = 1000 + 20 * 10 + 5 = 1205 (j >= 20)
      expect(cellIndex(grid, 1205, 495)).toBeNull();

      // South of grid: y = 500 - 15 * 10 - 5 = 345 (i >= 15)
      expect(cellIndex(grid, 1005, 345)).toBeNull();
    });

    it("reads cell size from meta.cell_m without assuming 5 m", () => {
      const metaCustom: LoadedGridMeta = {
        ...dummyMeta,
        cell_m: 2.5,
        width: 10,
        height: 10,
        origin_m: [0, 0],
      };
      const grid = {
        meta: metaCustom,
        elevation: new Float32Array(100),
        slopeP90: new Uint8Array(100),
        slopeMax: new Uint8Array(100),
        flags: new Uint8Array(100),
        commHab: new Uint8Array(100),
      };

      // At cell_m = 2.5: x = 3.0 -> j = floor(3.0 / 2.5) = 1; y = -3.0 -> i = floor(3.0 / 2.5) = 1
      expect(cellIndex(grid, 3.0, -3.0)).toBe(1 * 10 + 1);
    });
  });

  describe("decodeSlopeDeg", () => {
    it("decodes slope u8 as degrees × 4 with 255 = no data", () => {
      expect(decodeSlopeDeg(0)).toBe(0);
      expect(decodeSlopeDeg(40)).toBe(10);
      expect(decodeSlopeDeg(60)).toBe(15);
      expect(decodeSlopeDeg(80)).toBe(20);
      expect(decodeSlopeDeg(254)).toBe(63.5);
      expect(decodeSlopeDeg(255)).toBeNull();
    });
  });

  describe("flag bits", () => {
    it("matches flag bits NO_DATA, HARD_HAZARD, LOW_TI, TI_UNKNOWN, LOW_RES_DEM (05 §C)", () => {
      expect(FLAG_BITS.NO_DATA).toBe(0);
      expect(FLAG_BITS.HARD_HAZARD).toBe(1);
      expect(FLAG_BITS.LOW_TI).toBe(2);
      expect(FLAG_BITS.TI_UNKNOWN).toBe(3);
      expect(FLAG_BITS.LOW_RES_DEM).toBe(4);
    });
  });

  describe("loadGrid", () => {
    it("successfully loads valid buffers into LoadedGrid", () => {
      const buffers = createValidBuffers();
      const grid = loadGrid(dummyMeta, buffers);

      expect(grid.meta).toBe(dummyMeta);
      expect(grid.elevation.length).toBe(300);
      expect(grid.slopeP90.length).toBe(300);
      expect(grid.slopeMax.length).toBe(300);
      expect(grid.flags.length).toBe(300);
      expect(grid.commHab.length).toBe(300);
      expect(grid.ti?.length).toBe(300);
    });

    it("loads grid without TI sidecar when ti buffer is absent (05 §E.6)", () => {
      const buffers = createValidBuffers(20, 15, false);
      const grid = loadGrid(dummyMeta, buffers);

      expect(grid.ti).toBeUndefined();
      expect(grid.elevation.length).toBe(300);
    });

    it("rejects arrays whose dimensions differ from the manifest (05 §E.3)", () => {
      const valid = createValidBuffers(20, 15);
      const wrongElevation = new Float32Array(10).buffer; // 10 instead of 300

      expect(() => {
        loadGrid(dummyMeta, { ...valid, elevation: wrongElevation });
      }).toThrow();

      const wrongSlope = new Uint8Array(50).buffer; // 50 instead of 300
      expect(() => {
        loadGrid(dummyMeta, { ...valid, slopeP90: wrongSlope });
      }).toThrow();

      const wrongFlags = new Uint8Array(100).buffer;
      expect(() => {
        loadGrid(dummyMeta, { ...valid, flags: wrongFlags });
      }).toThrow();
    });

    it("rejects a grid whose working projection is not the Mars eqc string (05 §E.3, BD-45)", () => {
      const buffers = createValidBuffers(20, 15);
      expect(() => loadGrid({ ...dummyMeta, proj4: "+proj=merc +R=6378137 +units=m +no_defs" }, buffers)).toThrow(/proj4|eqc/i);
      expect(() => loadGrid({ ...dummyMeta, proj4: undefined as unknown as string }, buffers)).toThrow(/proj4|eqc/i);
    });

    it("keeps the manifest's proj4 string byte for byte on the grid meta (BD-45)", () => {
      expect(loadGrid(dummyMeta, createValidBuffers(20, 15)).meta.proj4).toBe(FIXTURE_PROJ4);
    });

    // BD-53: arrays are read as host-order typed arrays; every target host is little-endian, and this pins the byte pattern.
    it("reads a known little-endian byte pattern: f32 1.0 is 00 00 80 3F, u8 values are bytes", () => {
      const meta: LoadedGridMeta = { ...dummyMeta, width: 2, height: 1 };
      const elevation = new Uint8Array([0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0xc0]).buffer; // 1.0, -2.0
      const grid = loadGrid(meta, {
        elevation,
        slopeP90: new Uint8Array([0x28, 0xff]).buffer,
        slopeMax: new Uint8Array([0x30, 0xff]).buffer,
        flags: new Uint8Array([0x00, 0x01]).buffer,
        commHab: new Uint8Array([1, 255]).buffer,
      });
      expect(Array.from(grid.elevation)).toEqual([1, -2]);
      expect(Array.from(grid.slopeP90)).toEqual([40, 255]);
      expect(decodeSlopeDeg(grid.slopeP90[0])).toBe(10);
      expect(decodeSlopeDeg(grid.slopeP90[1])).toBeNull();
      expect(Array.from(grid.flags)).toEqual([0, 1]);
    });
  });
});
