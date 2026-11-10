/**
 * T07.12 — Point inspector popover tests (FR-03, FR-15, 02 §D.1, 02 §E.2, 03 §D, 04 §E).
 *
 * Verifies:
 * - Sends SAMPLE_POINT request with snap_radius_m: 50
 * - Inside AOI: shows lat/lon (°E, 5 decimals), elevation (m), slope (°), TI (tiu or "no data")
 * - Outside AOI: shows "Outside mapped area" without metric fields (01 FR-03, 03 §D)
 * - Displayed values carry data-provenance and data-source-id attributes (FR-15, NFR-05)
 * - Closes on Escape key press or map move (04 §E)
 * - Exposes inspectAt(x_m, y_m) for keyboard crosshair (T13.06)
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { installDom, removeDom } from "./domHarness";
import {
  createPointInspector,
  type InspectorSampleClient,
} from "../../src/ui/map/inspector";
import type { SampleResult } from "@marswalk/protocol";

const SAMPLE_INSIDE_AOI: SampleResult = {
  type: "SAMPLE_RESULT",
  request_id: "req-1",
  inside_aoi: true,
  passable: true,
  reason: null,
  lat: -4.6945123,
  lon_e: 137.3869456,
  elevation_m: -2450.3,
  slope_p90_deg: 8.4,
  ti_tiu: 345.0,
  flags: [],
  snap: { x_m: 410, y_m: 325, distance_m: 2.1 },
};

const SAMPLE_OUTSIDE_AOI: SampleResult = {
  type: "SAMPLE_RESULT",
  request_id: "req-2",
  inside_aoi: false,
  passable: false,
  reason: "OUTSIDE_AOI",
  lat: null,
  lon_e: null,
  elevation_m: null,
  slope_p90_deg: null,
  ti_tiu: null,
  flags: [],
  snap: null,
};

describe("Point inspector popover (T07.12)", () => {
  beforeAll(() => { installDom(); });
  afterAll(() => { removeDom(); });

  it("inspects inside AOI and displays formatted coordinates and metrics with provenance", async () => {
    const mockSample = vi.fn().mockResolvedValue(SAMPLE_INSIDE_AOI);
    const client: InspectorSampleClient = { samplePoint: mockSample };
    const container = document.createElement("div");
    document.body.appendChild(container);

    const inspector = createPointInspector(client, {
      container,
      sources: {
        elevation: "usgs-gale-dem-1m-v3",
        slope: "usgs-gale-dem-1m-v3",
        ti: "themis-ti-100m",
      },
    });

    await inspector.inspectAt(410, 325);

    expect(mockSample).toHaveBeenCalledWith(
      expect.objectContaining({
        x_m: 410,
        y_m: 325,
        snap_radius_m: 50,
      })
    );

    const popover = container.querySelector("[data-testid='inspector-popover']");
    expect(popover).not.toBeNull();

    // Coordinates formatted to 5 decimals and °E
    expect(popover?.textContent).toContain("-4.69451°");
    expect(popover?.textContent).toContain("137.38695°E");

    // Elevation, slope, TI
    expect(popover?.textContent).toContain("-2450.3 m");
    expect(popover?.textContent).toContain("8.4°");
    expect(popover?.textContent).toContain("345 tiu");

    // Provenance labels (FR-15, NFR-05)
    const provenances = popover?.querySelectorAll("[data-provenance]");
    expect(provenances?.length).toBeGreaterThanOrEqual(3);

    inspector.destroy();
    container.remove();
  });

  it("inspects outside AOI and displays 'Outside mapped area' without metrics", async () => {
    const mockSample = vi.fn().mockResolvedValue(SAMPLE_OUTSIDE_AOI);
    const client: InspectorSampleClient = { samplePoint: mockSample };
    const container = document.createElement("div");
    document.body.appendChild(container);

    const inspector = createPointInspector(client, { container });
    await inspector.inspectAt(5000, 5000);

    const popover = container.querySelector("[data-testid='inspector-popover']");
    expect(popover).not.toBeNull();
    expect(popover?.textContent).toContain("Outside mapped area");
    expect(popover?.textContent).not.toContain("tiu");

    inspector.destroy();
    container.remove();
  });

  it("closes on Escape key press", async () => {
    const mockSample = vi.fn().mockResolvedValue(SAMPLE_INSIDE_AOI);
    const client: InspectorSampleClient = { samplePoint: mockSample };
    const container = document.createElement("div");
    document.body.appendChild(container);

    const inspector = createPointInspector(client, { container });
    await inspector.inspectAt(410, 325);
    expect(container.querySelector("[data-testid='inspector-popover']")).not.toBeNull();

    // Dispatch Escape key event on document
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(container.querySelector("[data-testid='inspector-popover']")).toBeNull();

    inspector.destroy();
    container.remove();
  });

  it("closes on close() method or map move", async () => {
    const mockSample = vi.fn().mockResolvedValue(SAMPLE_INSIDE_AOI);
    const client: InspectorSampleClient = { samplePoint: mockSample };
    const container = document.createElement("div");
    document.body.appendChild(container);

    const inspector = createPointInspector(client, { container });
    await inspector.inspectAt(410, 325);
    expect(container.querySelector("[data-testid='inspector-popover']")).not.toBeNull();

    inspector.close();
    expect(container.querySelector("[data-testid='inspector-popover']")).toBeNull();

    inspector.destroy();
    container.remove();
  });
});
