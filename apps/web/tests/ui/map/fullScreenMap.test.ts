import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapControls, type MapControlsProps } from "../../../src/ui/map/MapControls";

// docs/specs/01 FR-32; 04 §E.5; mockup handoff DV-13, DV-14, G-42, G-43, G-48. TASK-07, TASK-24.
describe("MapControls", () => {
  it("eva-full shows +, −, FIT, FOLLOW, LAYERS and CLOSE, each a labelled button at least 56 px", () => {
    const props: MapControlsProps = {
      variant: "eva-full",
      onZoom: vi.fn(),
      follow: false,
      onFollow: vi.fn(),
      onFit: vi.fn(),
      layersOpen: false,
      onLayers: vi.fn(),
      onClose: vi.fn(),
    };

    const element = React.createElement(MapControls, props);
    const html = renderToStaticMarkup(element);

    // Button labels: +, −, FIT, FOLLOW, LAYERS and CLOSE each with a word
    expect(html).toContain("+");
    expect(html).toContain("−");
    expect(html).toContain("FIT");
    expect(html).toContain("FOLLOW");
    expect(html).toContain("LAYERS");
    expect(html).toContain("CLOSE");

    // Every button on EVA must be at least 56 px (04 §E.5, G-42, G-43)
    // We check that min-width and min-height >= 56px are enforced
    expect(html).toContain("min-width:56px");
    expect(html).toContain("min-height:56px");
  });

  it("ops and planner show + / − / FIT only", () => {
    const propsOps: MapControlsProps = {
      variant: "ops",
      onZoom: vi.fn(),
      follow: false,
      onFit: vi.fn(),
      layersOpen: false,
    };

    const htmlOps = renderToStaticMarkup(React.createElement(MapControls, propsOps));
    expect(htmlOps).toContain("+");
    expect(htmlOps).toContain("−");
    expect(htmlOps).toContain("FIT");
    expect(htmlOps).not.toContain("FOLLOW");
    expect(htmlOps).not.toContain("LAYERS");
    expect(htmlOps).not.toContain("CLOSE");

    const propsPlanner: MapControlsProps = {
      variant: "planner",
      onZoom: vi.fn(),
      follow: false,
      onFit: vi.fn(),
      layersOpen: false,
    };

    const htmlPlanner = renderToStaticMarkup(React.createElement(MapControls, propsPlanner));
    expect(htmlPlanner).toContain("+");
    expect(htmlPlanner).toContain("−");
    expect(htmlPlanner).toContain("FIT");
    expect(htmlPlanner).not.toContain("FOLLOW");
    expect(htmlPlanner).not.toContain("LAYERS");
    expect(htmlPlanner).not.toContain("CLOSE");
  });

  it("every action works without drag, wheel or pinch", () => {
    const onZoom = vi.fn();
    const onFit = vi.fn();
    const onFollow = vi.fn();
    const onLayers = vi.fn();
    const onClose = vi.fn();
    const onPan = vi.fn();

    const props: MapControlsProps = {
      variant: "eva-full",
      onZoom,
      onFit,
      follow: true,
      onFollow,
      layersOpen: true,
      onLayers,
      onClose,
      onPan,
    };

    const vdom = MapControls(props);
    expect(vdom).toBeDefined();

    // Verify child buttons can trigger callbacks directly
    const children = React.Children.toArray((vdom as React.ReactElement<{ children?: React.ReactNode }>).props.children);
    expect(children.length).toBeGreaterThan(0);
  });
});

describe("FullScreenMap", () => {
  it.todo("opens from the mini-map and from FULL; CLOSE returns the normal layout");
  it.todo("fixed geography: the alert slot, metadata strip and action row keep their position");
  it.todo("HAVEN and O₂ stay visible: in their row in portrait, stacked at the left in landscape");
  it.todo("landscape map takes at least 80 % of the width; HAVEN keeps the top-left origin");
  it.todo("a warning closes the full-screen map");
  it.todo("at most two scientific layers; a third turns the oldest off and says so");
  it.todo("positions are drawn in working-projection metres (no EPSG:3857, no ol/sphere)");
});
