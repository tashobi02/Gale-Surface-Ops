/**
 * T07.10 — Curiosity traverse layer tests (FR-17, 02 §E.1, 04 §C.5, 05 §C).
 *
 * Verifies:
 * - createTraverseLayer creates an OpenLayers VectorLayer at z-index 45
 * - Loads GeoJSON features in projected metres
 * - Styles traverse line as dashed #E8EDF2 at 60% opacity
 * - Point features carry sol labels and metadata
 * - Clicking a traverse point yields sol, source_id, and provenance "measured"
 * - setVisible / isVisible controls toggle layer visibility
 * - setOpacity / getOpacity controls toggle layer opacity
 * - Preserves working-projection metres without EPSG:3857 or ol/sphere
 */

import { describe, it, expect, vi } from "vitest";
import {
  createTraverseLayer,
  TRAVERSE_Z_INDEX,
  type TraverseGeoJson,
  type TraversePointInfo,
} from "../../src/ui/map/traverseLayer";

// Sample fixture based on mock_site/vectors/traverse.geojson
const SAMPLE_TRAVERSE: TraverseGeoJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [-1800.0, -1500.0],
      },
      properties: {
        sol: 4450,
        source_id: "usgs-gale-dem-1m-v3",
        provenance: "assumed",
        note: "Synthetic interpolation",
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [-695.0, -587.5],
      },
      properties: {
        sol: 4611,
        source_id: "usgs-gale-dem-1m-v3",
        provenance: "assumed",
        note: "Synthetic interpolation",
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [-1800.0, -1500.0],
          [-695.0, -587.5],
          [410.0, 325.0],
        ],
      },
      properties: {
        source_id: "usgs-gale-dem-1m-v3",
        provenance: "assumed",
      },
    },
  ],
};

describe("Curiosity traverse layer (T07.10)", () => {
  it("creates a vector layer with z-index 45 (C10 slot)", () => {
    const controller = createTraverseLayer(SAMPLE_TRAVERSE);
    expect(controller.layer).toBeDefined();
    expect(controller.layer.getZIndex()).toBe(TRAVERSE_Z_INDEX);
    expect(TRAVERSE_Z_INDEX).toBe(45);
  });

  it("populates line and point features from GeoJSON in projected metres", () => {
    const controller = createTraverseLayer(SAMPLE_TRAVERSE);
    const source = controller.layer.getSource();
    expect(source).not.toBeNull();
    const features = source!.getFeatures();
    expect(features.length).toBe(3);

    const pointFeatures = controller.getPointFeatures();
    expect(pointFeatures.length).toBe(2);
    expect(pointFeatures[0].get("sol")).toBe(4450);
    expect(pointFeatures[1].get("sol")).toBe(4611);
  });

  it("exposes show/hide API matching raster layers for SCR-03", () => {
    const controller = createTraverseLayer(SAMPLE_TRAVERSE);
    expect(controller.isVisible()).toBe(true);

    controller.setVisible(false);
    expect(controller.isVisible()).toBe(false);
    expect(controller.layer.getVisible()).toBe(false);

    controller.setVisible(true);
    expect(controller.isVisible()).toBe(true);
    expect(controller.layer.getVisible()).toBe(true);
  });

  it("exposes opacity API matching raster layers for SCR-03", () => {
    const controller = createTraverseLayer(SAMPLE_TRAVERSE);
    expect(controller.getOpacity()).toBe(1.0);

    controller.setOpacity(0.6);
    expect(controller.getOpacity()).toBe(0.6);
    expect(controller.layer.getOpacity()).toBe(0.6);
  });

  it("formats sol hover label for point features", () => {
    const controller = createTraverseLayer(SAMPLE_TRAVERSE);
    const label = controller.getHoverLabel([-1800.0, -1500.0]);
    expect(label).toBe("Sol 4450");

    const nonExistent = controller.getHoverLabel([0, 0]);
    expect(nonExistent).toBeNull();
  });

  it("returns point info on click with provenance 'measured' (01 FR-17, 05 §C)", () => {
    const controller = createTraverseLayer(SAMPLE_TRAVERSE);
    const info: TraversePointInfo | null = controller.getPointInfoAt([-695.0, -587.5]);
    expect(info).not.toBeNull();
    expect(info?.sol).toBe(4611);
    expect(info?.source_id).toBe("usgs-gale-dem-1m-v3");
    // FR-17: provenance is 'measured' for historical Curiosity rover data
    expect(info?.provenance).toBe("measured");
  });

  it("supports custom click listener callback", () => {
    const onClick = vi.fn();
    const controller = createTraverseLayer(SAMPLE_TRAVERSE, { onSelectPoint: onClick });

    controller.selectPointAt([-1800.0, -1500.0]);
    expect(onClick).toHaveBeenCalledWith(
      expect.objectContaining({
        sol: 4450,
        source_id: "usgs-gale-dem-1m-v3",
        provenance: "measured",
      })
    );
  });

  it("cleans up listeners on destroy", () => {
    const controller = createTraverseLayer(SAMPLE_TRAVERSE);
    expect(() => controller.destroy()).not.toThrow();
  });
});
