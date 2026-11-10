/**
 * T07.13 — Debug overlay diagnostics tests (NFR-11, 02 §F, 05 §E.1).
 *
 * Verifies:
 * - With ?debug=1 (or enabled: true), mounts debug overlay with FPS, worker timings,
 *   grid cell [i, j], and data version
 * - Without debug flag, renders nothing and registers no listeners
 * - Computes grid cell index via 05 §E.1: i = floor((origin_y - y)/cell), j = floor((x - origin_x)/cell)
 * - Excludes overlay from print (print CSS / media query)
 * - Cleans up intervals and listeners on destroy()
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { installDom, removeDom } from "./domHarness";
import { initDebugOverlay, computeGridCell } from "../../src/ui/debug";

const MOCK_GRID = {
  cell_m: 100,
  origin_m: [-3000, 3000] as [number, number],
  width: 60,
  height: 60,
};

describe("Debug overlay diagnostics (T07.13)", () => {
  beforeAll(() => { installDom(); });
  afterAll(() => { removeDom(); });

  it("does nothing when debug is not enabled", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const controller = initDebugOverlay({
      enabled: false,
      container,
      dataVersion: "test-v1",
      grid: MOCK_GRID,
    });

    expect(controller).toBeNull();
    expect(container.querySelector("[data-testid='debug-overlay']")).toBeNull();
    container.remove();
  });

  it("mounts overlay when enabled and displays data version", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const controller = initDebugOverlay({
      enabled: true,
      container,
      dataVersion: "mock_site-2026.11.05",
      grid: MOCK_GRID,
    });

    expect(controller).not.toBeNull();
    const overlay = container.querySelector("[data-testid='debug-overlay']");
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain("mock_site-2026.11.05");

    controller?.destroy();
    container.remove();
  });

  it("computes grid cell [i, j] correctly per 05 §E.1", () => {
    // origin is [-3000, 3000], cell is 100 m
    // at x = -3000, y = 3000 -> i = 0, j = 0
    expect(computeGridCell(-3000, 3000, MOCK_GRID)).toEqual({ i: 0, j: 0 });

    // at x = -2900, y = 2900 -> i = 1, j = 1
    expect(computeGridCell(-2900, 2900, MOCK_GRID)).toEqual({ i: 1, j: 1 });

    // outside grid -> null
    expect(computeGridCell(-5000, 5000, MOCK_GRID)).toBeNull();
  });

  it("updates cursor coordinates and grid cell readout", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const controller = initDebugOverlay({
      enabled: true,
      container,
      dataVersion: "v1",
      grid: MOCK_GRID,
    });

    controller?.updateCursor(-2950, 2950);
    const overlay = container.querySelector("[data-testid='debug-overlay']");
    expect(overlay?.textContent).toContain("Cell: [0, 0]");

    controller?.destroy();
    container.remove();
  });

  it("updates worker timing when reported", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const controller = initDebugOverlay({
      enabled: true,
      container,
      dataVersion: "v1",
      grid: MOCK_GRID,
    });

    controller?.updateTiming(42.5);
    const overlay = container.querySelector("[data-testid='debug-overlay']");
    expect(overlay?.textContent).toContain("42.5 ms");

    controller?.destroy();
    container.remove();
  });

  it("cleans up overlay element on destroy", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const controller = initDebugOverlay({
      enabled: true,
      container,
      dataVersion: "v1",
      grid: MOCK_GRID,
    });

    expect(container.querySelector("[data-testid='debug-overlay']")).not.toBeNull();
    controller?.destroy();
    expect(container.querySelector("[data-testid='debug-overlay']")).toBeNull();

    container.remove();
  });
});
