/**
 * T07.06 — createMap tests (FR-01, 02 §C.1, 02 §C.4).
 *
 * Verifies:
 * - createMap returns a MapHandle with required methods
 * - getMap() returns the OpenLayers Map instance
 * - fitExtent() calls OL map view's fit()
 * - setCenter / getCenter work in projected metres
 * - setZoom / getZoom round-trip
 * - destroy() calls OL map's setTarget(undefined)
 * - destroy() calls OL map's setTarget(undefined)
 * - CRS guard: no EPSG:3857 view is created (02 §C.4.1)
 * - North arrow and coordinate readout are mounted in the DOM
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { installDom, removeDom } from "./domHarness";

// Use vi.hoisted so class definitions exist before vi.mock() hoisted calls
const { MockView, MockMap, mockFit, mockSetCenter, mockGetCenter, mockSetZoom, mockGetZoom, mockSetTarget, mockOn } =
  vi.hoisted(() => {
    const mockFit = vi.fn();
    const mockSetCenter = vi.fn();
    const mockGetCenter = vi.fn(() => [0, 0] as [number, number]);
    const mockSetZoom = vi.fn();
    const mockGetZoom = vi.fn(() => 5);
    const mockSetTarget = vi.fn();
    const mockOn = vi.fn();

    class MockView {
      static lastProjection: string | null = null;
      fit = mockFit;
      setCenter = mockSetCenter;
      getCenter = mockGetCenter;
      setZoom = mockSetZoom;
      getZoom = mockGetZoom;
      constructor(opts: { projection?: string }) {
        const proj = String(opts?.projection ?? "");
        MockView.lastProjection = proj;
        if (proj.includes("EPSG:3857") || proj.includes("EPSG:4326")) {
          throw new Error(`FORBIDDEN_PROJECTION: ${proj}`);
        }
      }
    }

    class MockMap {
      private _view: MockView;
      setTarget = mockSetTarget;
      on = mockOn;
      addControl() {}
      constructor({ view }: { view: MockView }) { this._view = view; }
      getView() { return this._view; }
    }

    return { MockView, MockMap, mockFit, mockSetCenter, mockGetCenter, mockSetZoom, mockGetZoom, mockSetTarget, mockOn };
  });

vi.mock("ol/Map.js", () => ({ default: MockMap }));
vi.mock("ol/View.js", () => ({ default: MockView }));
vi.mock("ol/proj.js", () => {
  class MockProjection { constructor(_opts: unknown) {} }
  return {
    get: vi.fn(() => null),
    addProjection: vi.fn(),
    Projection: MockProjection,
  };
});
vi.mock("ol/proj/proj4.js", () => ({ register: vi.fn() }));
vi.mock("proj4", () => ({
  default: Object.assign((_from: string, _to: string) => [0, 0], {
    defs: vi.fn(),
  }),
}));
vi.mock("ol/control/ScaleLine.js", () => {
  class MockScaleLine { constructor(_opts?: unknown) {} }
  return { default: MockScaleLine };
});

import { createMap } from "../../src/ui/map/createMap";
import type { Site } from "@marswalk/protocol";

const MOCK_SITE: Site = {
  site_id: "mock_site",
  crs: {
    base: "IAU_2015:49900",
    proj4: "+proj=eqc +lat_ts=-4.70 +lat_0=-4.70 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs",
  },
  aoi: {
    bbox_geo: [137.3292, -4.7506, 137.4308, -4.6494],
    extent_m: [-3000, -3000, 3000, 3000],
  },
} as unknown as Site;

describe("createMap (T07.06)", () => {
  beforeAll(() => { installDom(); });
  afterAll(() => { removeDom(); });

  it("returns a MapHandle with required methods", () => {
    const container = document.createElement("div");
    const handle = createMap(MOCK_SITE, container);
    expect(typeof handle.getMap).toBe("function");
    expect(typeof handle.fitExtent).toBe("function");
    expect(typeof handle.setCenter).toBe("function");
    expect(typeof handle.getCenter).toBe("function");
    expect(typeof handle.setZoom).toBe("function");
    expect(typeof handle.getZoom).toBe("function");
    expect(typeof handle.destroy).toBe("function");
  });

  it("getMap() returns an OL Map-like object", () => {
    const container = document.createElement("div");
    const handle = createMap(MOCK_SITE, container);
    const map = handle.getMap();
    expect(map).toBeTruthy();
  });

  it("fitExtent() delegates to view.fit()", () => {
    const container = document.createElement("div");
    mockFit.mockClear();
    const handle = createMap(MOCK_SITE, container);
    const countAfterCreate = mockFit.mock.calls.length; // called once at creation
    handle.fitExtent([-3000, -3000, 3000, 3000]);
    expect(mockFit.mock.calls.length).toBe(countAfterCreate + 1);
  });

  it("setCenter() delegates to view.setCenter()", () => {
    const container = document.createElement("div");
    mockSetCenter.mockClear();
    const handle = createMap(MOCK_SITE, container);
    handle.setCenter([100, 200]);
    expect(mockSetCenter).toHaveBeenCalledWith([100, 200]);
  });

  it("setZoom() delegates to view.setZoom()", () => {
    const container = document.createElement("div");
    mockSetZoom.mockClear();
    const handle = createMap(MOCK_SITE, container);
    handle.setZoom(3);
    expect(mockSetZoom).toHaveBeenCalledWith(3);
  });

  it("getZoom() returns the view zoom level", () => {
    const container = document.createElement("div");
    const handle = createMap(MOCK_SITE, container);
    expect(handle.getZoom()).toBe(5);
  });

  it("destroy() calls map.setTarget(undefined)", () => {
    const container = document.createElement("div");
    mockSetTarget.mockClear();
    const handle = createMap(MOCK_SITE, container);
    handle.destroy();
    expect(mockSetTarget).toHaveBeenCalledWith(undefined);
  });

  it("CRS guard: does not create an EPSG:3857 or EPSG:4326 view (02 §C.4.1)", () => {
    const proj = MockView.lastProjection ?? "";
    expect(proj).not.toContain("EPSG:3857");
    expect(proj).not.toContain("EPSG:4326");
    expect(proj).toContain("MARS_LOCAL:");
  });

  it("north arrow element is mounted in the container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    createMap(MOCK_SITE, container);
    const arrow = container.querySelector("[data-testid='north-arrow']");
    expect(arrow).not.toBeNull();
    document.body.removeChild(container);
  });

  it("coordinate readout carries data-provenance='derived' (NFR-05)", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    createMap(MOCK_SITE, container);
    const readout = container.querySelector("[data-testid='coord-readout']");
    expect(readout).not.toBeNull();
    expect(readout?.getAttribute("data-provenance")).toBe("derived");
    document.body.removeChild(container);
  });
});
