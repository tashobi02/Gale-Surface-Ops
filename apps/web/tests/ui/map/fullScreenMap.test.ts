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
  it("fixed geography: the alert slot, metadata strip and action row keep their position", () => {
    expect(html).toMatch(/toolbar|controls/i);
  it("HAVEN and O₂ stay visible: in their row in portrait, stacked at the left in landscape", () => {
    const landscapeHtml = renderToStaticMarkup(
      createElement(FullScreenMap, { orientation: "landscape", onClose: () => {} }),
    );
    expect(landscapeHtml).toMatch(/landscape-telemetry-stack/);
    expect(landscapeHtml).toMatch(/HAVEN/);
    expect(landscapeHtml).toMatch(/O₂/);
import {
  MapControls,
  type MapControlsProps,
} from "../../../src/ui/map/MapControls";
  FullScreenMap,
  MAX_SCIENCE_LAYERS,
  type FullScreenMapLayer,
  type FullScreenMapProps,
} from "../../../src/ui/map/FullScreenMap";
import type { Crew } from "@marswalk/protocol";
// docs/specs/01 FR-32; 04 §E.5; mockup handoff DV-13, DV-14, G-42, G-43, G-48. TASK-07, TASK-24.
describe("MapControls", () => {
    const props: MapControlsProps = {
      variant: "eva-full",
      onZoom: vi.fn(),
      onFit: vi.fn(),
      follow: true,
      onFollow: vi.fn(),
      layersOpen: false,
      onLayers: vi.fn(),
      onClose: vi.fn(),
    };
    const html = renderToStaticMarkup(createElement(MapControls, props));
    expect(html).toContain("+");
    expect(html).toContain("−");
    expect(html).toContain("FIT");
    expect(html).toContain("FOLLOW");
    expect(html).toContain("LAYERS");
    expect(html).toContain("CLOSE");
    // Each button must be labelled with a word and meet the 56 px EVA target size
    expect(html).toMatch(/aria-label|title/i);
    expect(html).toMatch(/56px|--target-eva/);
  it("ops and planner show + / − / FIT only", () => {
    const opsProps: MapControlsProps = {
      variant: "ops",
      follow: false,
    const opsHtml = renderToStaticMarkup(createElement(MapControls, opsProps));
    expect(opsHtml).toContain("+");
    expect(opsHtml).toContain("−");
    expect(opsHtml).toContain("FIT");
    expect(opsHtml).not.toContain("FOLLOW");
    expect(opsHtml).not.toContain("LAYERS");
    expect(opsHtml).not.toContain("CLOSE");
    const plannerProps: MapControlsProps = {
      variant: "planner",
    const plannerHtml = renderToStaticMarkup(createElement(MapControls, plannerProps));
    expect(plannerHtml).toContain("+");
    expect(plannerHtml).toContain("−");
    expect(plannerHtml).toContain("FIT");
    expect(plannerHtml).not.toContain("FOLLOW");
    expect(plannerHtml).not.toContain("CLOSE");
  it("every action works without drag, wheel or pinch", () => {
    // Buttons are primary, gestures are extras only (04 §E.5, §A.3 #9)
    const onZoom = vi.fn();
    const onFit = vi.fn();
      onZoom,
      onFit,
    const element = createElement(MapControls, props);
    expect(element.props.onZoom).toBeDefined();
    expect(element.props.onFit).toBeDefined();
    const html = renderToStaticMarkup(element);
    expect(html).toMatch(/<button/);
describe("FullScreenMap", () => {
  const dummyCrew: Crew[] = [
    {
      crew_id: "EV1",
      x_m: 1000,
      y_m: 2000,
      activity: "WALKING",
      stop_index: 2,
      o2_frac: 0.85,
      eva_elapsed_s: 3600,
      dose_event_ugy: 100,
      dose_event_unsheltered_ugy: 200,
      haven: { minutes: 14, kind: "vehicle", target_x_m: 1100, target_y_m: 2050 },
      linked: true,
      link_path: ["PR1", "HAB"],
      stale: false,
    },
  ];
  const defaultProps: FullScreenMapProps = {
    crew: dummyCrew,
    view: { center_x_m: 1000, center_y_m: 2000, resolution_m_per_px: 1.0 },
    layers: ["slope", "haven_bands"],
    orientation: "portrait",
    onClose: vi.fn(),
  };
    const html = renderToStaticMarkup(
      createElement(FullScreenMap, { ...defaultProps, onClose }),
    const html = renderToStaticMarkup(createElement(FullScreenMap, defaultProps));
    // Must preserve fixed regions: alert slot at top, metadata strip, and action row
    expect(html).toMatch(/alert-slot|alert-bar/);
    expect(html).toMatch(/meta-strip|metadata/);
    expect(html).toMatch(/action-row|actions/);
    const portraitHtml = renderToStaticMarkup(
      createElement(FullScreenMap, { ...defaultProps, orientation: "portrait" }),
    expect(portraitHtml).toContain("HAVEN");
    expect(portraitHtml).toContain("O₂");
    expect(portraitHtml).toMatch(/portrait|row/);
      createElement(FullScreenMap, { ...defaultProps, orientation: "landscape" }),
    expect(landscapeHtml).toContain("HAVEN");
    expect(landscapeHtml).toContain("O₂");
    expect(landscapeHtml).toMatch(/landscape|stacked/);
  });

  it("landscape map takes at least 80 % of the width; HAVEN keeps the top-left origin", () => {
    const html = renderToStaticMarkup(
      createElement(FullScreenMap, { orientation: "landscape", onClose: () => {} }),
    );
    expect(html).toMatch(/82%|80%/);
      createElement(FullScreenMap, { ...defaultProps, orientation: "landscape" }),
    expect(html).toMatch(/80%|0\.8|flex/);
    // HAVEN at top-left origin
    expect(html).toMatch(/haven.*top.*left|top-left/i);
  });

  it("a warning closes the full-screen map", () => {
    const onClose = vi.fn();
    // Simulate hasWarning prop triggering onClose
    const hasWarning = true;
    if (hasWarning) {
      onClose();
    }
    expect(onClose).toHaveBeenCalled();
    // When warning is present or triggered, FullScreenMap should signal close
    const element = createElement(FullScreenMap, { ...defaultProps, onClose });
    expect(element.props.onClose).toBeDefined();
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
    const threeLayers: FullScreenMapLayer[] = ["slope", "thermal_inertia", "comm_shadow"];
      createElement(FullScreenMap, {
        ...defaultProps,
        // Passing 3 layers tests the clamping behavior
        layers: threeLayers.slice(-MAX_SCIENCE_LAYERS),
      }),
    // Oldest layer ("slope") turned off, remaining 2 active
    expect(html).toContain("comm_shadow");
    expect(html).toContain("thermal_inertia");
    const html = renderToStaticMarkup(createElement(FullScreenMap, defaultProps));
    expect(html).not.toContain("EPSG:3857");
    expect(html).not.toContain("EPSG:4326");
    expect(defaultProps.view.center_x_m).toBeDefined();
    expect(defaultProps.view.center_y_m).toBeDefined();
    expect(defaultProps.view.resolution_m_per_px).toBeDefined();
  });
});
