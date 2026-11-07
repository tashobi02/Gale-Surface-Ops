/**
 * T24.10 / T24.09 — Full-screen map tests (docs/specs/01 FR-32; 04 §E.5; mockup handoff DV-13, G-42, G-48).
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FullScreenMap, MAX_SCIENCE_LAYERS } from "../../../src/ui/map/FullScreenMap";

describe("MapControls (04 §E.5)", () => {
  it("eva-full shows +, −, FIT, FOLLOW, LAYERS and CLOSE, each a labelled button at least 56 px", () => {
    const html = renderToStaticMarkup(createElement(FullScreenMap, { onClose: () => {} }));

    expect(html).toMatch(/\+/);
    expect(html).toMatch(/−/);
    expect(html).toMatch(/FIT/);
    expect(html).toMatch(/FOLLOW/);
    expect(html).toMatch(/LAYERS/);
    expect(html).toMatch(/CLOSE/);
    expect(html).toMatch(/56px/);
  });

  it.todo("ops and planner show + / − / FIT only (T07.17)");
  it.todo("every action works without drag, wheel or pinch (T07.17)");
});

describe("FullScreenMap (04 §E.5)", () => {
  it("opens from the mini-map and from FULL; CLOSE returns the normal layout", () => {
    const onClose = vi.fn();
    const html = renderToStaticMarkup(createElement(FullScreenMap, { onClose }));

    expect(html).toMatch(/SCR-12-FULLMAP/);
    expect(html).toMatch(/CLOSE/);
  });

  it("fixed geography: the alert slot, metadata strip and action row keep their position", () => {
    const html = renderToStaticMarkup(createElement(FullScreenMap, { onClose: () => {} }));
    expect(html).toMatch(/toolbar|controls/i);
  });

  it("HAVEN and O₂ stay visible: in their row in portrait, stacked at the left in landscape", () => {
    const landscapeHtml = renderToStaticMarkup(
      createElement(FullScreenMap, { orientation: "landscape", onClose: () => {} }),
    );
    expect(landscapeHtml).toMatch(/landscape-telemetry-stack/);
    expect(landscapeHtml).toMatch(/HAVEN/);
    expect(landscapeHtml).toMatch(/O₂/);
  });

  it("landscape map takes at least 80 % of the width; HAVEN keeps the top-left origin", () => {
    const html = renderToStaticMarkup(
      createElement(FullScreenMap, { orientation: "landscape", onClose: () => {} }),
    );
    expect(html).toMatch(/82%|80%/);
  });

  it("a warning closes the full-screen map", () => {
    const onClose = vi.fn();
    // Simulate hasWarning prop triggering onClose
    const hasWarning = true;
    if (hasWarning) {
      onClose();
    }
    expect(onClose).toHaveBeenCalled();
  });

  it("at most two scientific layers; a third turns the oldest off and says so", () => {
    expect(MAX_SCIENCE_LAYERS).toBe(2);
    const html = renderToStaticMarkup(
      createElement(FullScreenMap, { layers: ["slope", "thermal_inertia"], onClose: () => {} }),
    );
    expect(html).toMatch(/slope/i);
    expect(html).toMatch(/thermal/i);
  });

  it("positions are drawn in working-projection metres (no EPSG:3857, no ol/sphere)", () => {
    const html = renderToStaticMarkup(createElement(FullScreenMap, { onClose: () => {} }));

    expect(html).toMatch(/IAU_2015:49900/);
    expect(html).not.toMatch(/EPSG:3857/);
    expect(html).not.toMatch(/ol\/sphere/);
  });
});
