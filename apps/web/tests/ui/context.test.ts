import { describe, it, expect } from "vitest";
import {
  LAYER_Z_INDEX,
  PROVENANCE_ATTR,
  PROVENANCE_VALUES,
  SOURCE_ID_ATTR,
  URL_PARAMS,
} from "../../src/ui/context";
import { loadSite } from "../../src/boot/loadSite";
import { validateSite } from "../../src/boot/validateSite";
import { createWorkerClient } from "../../src/ui/workerClient";
import { initDebugOverlay } from "../../src/ui/debug";
import { createMap } from "../../src/ui/map/createMap";
import { createRasterLayers } from "../../src/ui/map/rasterLayers";
import { createTraverseLayer } from "../../src/ui/map/traverseLayer";
import { createPoiLayer } from "../../src/ui/map/poiLayer";
import { initPointInspector } from "../../src/ui/map/inspector";
import { createWaypointLayer } from "../../src/ui/map/waypointLayer";
import { initAddStopMode } from "../../src/ui/map/addStopMode";
import { initWaypointDrag } from "../../src/ui/map/waypointDrag";
import { initTouchInput } from "../../src/ui/map/touchInput";
import { createRouteLayer } from "../../src/ui/map/routeLayer";
import { initMapKeyboard } from "../../src/ui/map/keyboard";
import { renderStopsList } from "../../src/ui/plan/stopsList";
import { renderProfileChart } from "../../src/ui/results/profileChart";
import { renderWarningsList } from "../../src/ui/results/warningsList";
import { linkProfileToMap } from "../../src/ui/results/profileLink";
import { createMapSnapshot } from "../../src/ui/briefing/mapSnapshot";
import { exportPlan } from "../../src/export/planExport";
import { formatMetric } from "../../src/ui/components/metric";
import { renderStatusIcon } from "../../src/ui/components/statusIcon";

describe("T07.01 UI Context and Module Stubs (Contract C10)", () => {
  it("exports FR-02 layer order constants", () => {
    expect(LAYER_Z_INDEX.BASEMAP).toBeLessThan(LAYER_Z_INDEX.HILLSHADE);
    expect(LAYER_Z_INDEX.HILLSHADE).toBeLessThan(LAYER_Z_INDEX.SCIENTIFIC_OVERLAY);
    expect(LAYER_Z_INDEX.SCIENTIFIC_OVERLAY).toBeLessThan(LAYER_Z_INDEX.HAZARDS);
    expect(LAYER_Z_INDEX.HAZARDS).toBeLessThan(LAYER_Z_INDEX.ROUTE);
    expect(LAYER_Z_INDEX.ROUTE).toBeLessThan(LAYER_Z_INDEX.POIS);
  });

  it("exports provenance attribute names and values (FR-15, NFR-05)", () => {
    expect(PROVENANCE_ATTR).toBe("data-provenance");
    expect(SOURCE_ID_ATTR).toBe("data-source-id");
    expect(PROVENANCE_VALUES).toContain("measured");
    expect(PROVENANCE_VALUES).toContain("derived");
    expect(PROVENANCE_VALUES).toContain("modelled");
    expect(PROVENANCE_VALUES).toContain("assumed");
    expect(PROVENANCE_VALUES).toContain("replayed");
    expect(PROVENANCE_VALUES).toContain("simulated");
  });

  it("exports URL parameters constants", () => {
    expect(URL_PARAMS.SITE).toBe("site");
    expect(URL_PARAMS.DEBUG).toBe("debug");
    expect(URL_PARAMS.MOCK_WORKER).toBe("mock_worker");
  });

  it("stubs throw TODO(<owner id>) per the C10 stub convention", async () => {
    await expect(loadSite()).rejects.toThrow("TODO(T07.02)");
    expect(() => validateSite({} as any)).toThrow("TODO(T14.03)");
    expect(() => createWorkerClient()).toThrow("TODO(T07.04)");
    expect(() => initDebugOverlay({} as any, {} as any)).toThrow("TODO(T07.13)");
    expect(() => createMap({} as any)).toThrow("TODO(T07.06)");
    expect(() => createRasterLayers({} as any)).toThrow("TODO(T07.07)");
    expect(() => createTraverseLayer({} as any)).toThrow("TODO(T07.10)");
    expect(() => createPoiLayer({} as any)).toThrow("TODO(T07.11)");
    expect(() => initPointInspector({} as any, {} as any)).toThrow("TODO(T07.12)");
    expect(() => createWaypointLayer({} as any)).toThrow("TODO(T08.06)");
    expect(() => initAddStopMode({} as any, {} as any)).toThrow("TODO(T08.07)");
    expect(() => initWaypointDrag({} as any, {} as any)).toThrow("TODO(T08.08)");
    expect(() => initTouchInput({} as any)).toThrow("TODO(T08.09)");
    expect(() => initMapKeyboard({} as any)).toThrow("TODO(T13.06)");
    expect(() => renderStopsList({} as any, {} as any)).toThrow("TODO(T08.05)");
    expect(() => renderProfileChart({} as any, {} as any)).toThrow("TODO(T09.02)");
    expect(() => linkProfileToMap({} as any, {} as any)).toThrow("TODO(T09.05)");
    await expect(createMapSnapshot({} as any)).rejects.toThrow("TODO(T11.04)");
    expect(() => exportPlan({} as any, {} as any)).toThrow("TODO(T11.02)");
    expect(() => formatMetric({} as any)).toThrow("TODO(T12.01)");
  });
});
