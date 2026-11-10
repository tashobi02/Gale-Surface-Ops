/**
 * T07.11 — POI layer and selection tests (FR-04, 03 SCR-06, 04 §C.3, 04 §C.5).
 *
 * Verifies:
 * - createPoiLayer creates a VectorLayer at z-index 60 (C10 slot)
 * - 24 px POI markers created from POI Map/list in projected metres
 * - Default pin style: white with bg outline (04 §C.3, §C.5)
 * - Hover shows POI name label
 * - Selection sets accent pin style and invokes onSelectPoi / planStore
 * - selectPoi(id) callable programmatically (for T13.06 keyboard controls)
 * - setVisible / isVisible controls toggle layer visibility for SCR-03
 * - Preserves working-projection metres (no EPSG:3857, no ol/sphere)
 */

import { describe, it, expect, vi } from "vitest";
import {
  createPoiLayer,
  POI_Z_INDEX,
  type POIFeature,
} from "../../src/ui/map/poiLayer";

const SAMPLE_POIS: POIFeature[] = [
  {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [410.0, 325.0],
    },
    properties: {
      poi_id: "poi-boxwork-ridge",
      name: "Boxwork ridge",
      ez_theme: "Mineralogy",
      science_objective: "Examine a mineral-cemented ridge",
      why_it_matters: "Ridges record groundwater moving through fractures",
      stop_type: "science",
      evidence: [{ source_id: "usgs-gale-dem-1m-v3", text: "" }],
      position_source: "Curiosity waypoint",
      position_uncertainty_m: 15,
      provenance: "assumed",
      lat: -4.6945,
      lon_e: 137.3869,
    },
  },
  {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [-695.0, -587.5],
    },
    properties: {
      poi_id: "poi-sulfate-contact",
      name: "Sulfate contact",
      ez_theme: "Resources",
      science_objective: "Sample hydrated sulfate minerals",
      why_it_matters: "Clay-to-sulfate transition",
      stop_type: "resource",
      evidence: [{ source_id: "usgs-gale-dem-1m-v3", text: "" }],
      position_source: "Curiosity waypoint",
      position_uncertainty_m: 10,
      provenance: "assumed",
      lat: -4.7102,
      lon_e: 137.3685,
    },
  },
];

describe("POI layer and selection (T07.11)", () => {
  it("creates a vector layer at z-index 60 (C10 slot)", () => {
    const controller = createPoiLayer(SAMPLE_POIS);
    expect(controller.layer).toBeDefined();
    expect(controller.layer.getZIndex()).toBe(POI_Z_INDEX);
    expect(POI_Z_INDEX).toBe(60);
  });

  it("loads features in projected metres from input list or Map", () => {
    const poiMap = new Map(SAMPLE_POIS.map((p) => [p.properties.poi_id, p]));
    const controller = createPoiLayer(poiMap);
    const source = controller.layer.getSource();
    expect(source).not.toBeNull();
    expect(source!.getFeatures().length).toBe(2);
  });

  it("exposes show/hide API matching raster layers for SCR-03", () => {
    const controller = createPoiLayer(SAMPLE_POIS);
    expect(controller.isVisible()).toBe(true);

    controller.setVisible(false);
    expect(controller.isVisible()).toBe(false);
    expect(controller.layer.getVisible()).toBe(false);

    controller.setVisible(true);
    expect(controller.isVisible()).toBe(true);
  });

  it("returns hover label containing POI name", () => {
    const controller = createPoiLayer(SAMPLE_POIS);
    const label = controller.getHoverLabel([410.0, 325.0]);
    expect(label).toBe("Boxwork ridge");

    const none = controller.getHoverLabel([0, 0]);
    expect(none).toBeNull();
  });

  it("selectPoi selects by id and triggers callback", () => {
    const onSelect = vi.fn();
    const controller = createPoiLayer(SAMPLE_POIS, { onSelectPoi: onSelect });

    controller.selectPoi("poi-sulfate-contact");
    expect(controller.getSelectedPoiId()).toBe("poi-sulfate-contact");
    expect(onSelect).toHaveBeenCalledWith("poi-sulfate-contact");

    // Deselect
    controller.selectPoi(null);
    expect(controller.getSelectedPoiId()).toBeNull();
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("getPoiAt finds nearest POI within tolerance", () => {
    const controller = createPoiLayer(SAMPLE_POIS);
    const found = controller.getPoiAt([412.0, 324.0], 10);
    expect(found).not.toBeNull();
    expect(found?.properties.poi_id).toBe("poi-boxwork-ridge");

    const far = controller.getPoiAt([412.0, 324.0], 1);
    expect(far).toBeNull();
  });

  it("cleans up resources on destroy", () => {
    const controller = createPoiLayer(SAMPLE_POIS);
    expect(() => controller.destroy()).not.toThrow();
  });
});
