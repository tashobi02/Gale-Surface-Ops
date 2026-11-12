/** T24.09: mounted map wiring; rendering and pinch use the real view in the browser check. */
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { createElement } from "react";
import { FullScreenMap } from "../../../src/ui/map/FullScreenMap";
import { loadSite } from "../../../src/boot/loadSite";
import { createMap } from "../../../src/ui/map/createMap";
import { createRasterLayers } from "../../../src/ui/map/rasterLayers";
import { createOpsLayers } from "../../../src/ui/map/opsLayers";
import { loadedSiteFrom, mockManifest } from "./mapFixtures";
import { storeFromBeat } from "../fixtureStore";
import { click, flush, installDom, mount, must, removeDom, type Mounted } from "../domHarness";
vi.mock("../../../src/boot/loadSite", () => ({ loadSite: vi.fn() }));
vi.mock("../../../src/ui/map/createMap", () => ({ createMap: vi.fn() }));
vi.mock("../../../src/ui/map/rasterLayers", () => ({ createRasterLayers: vi.fn() }));
vi.mock("../../../src/ui/map/opsLayers", () => ({ createOpsLayers: vi.fn() }));
let mounted: Mounted | undefined;
const snapshot = storeFromBeat("connect").state()!;
const handle = { getMap: vi.fn(() => ({ addLayer: vi.fn(), on: vi.fn(), un: vi.fn() })), getTargetElement: () => document.createElement("div"), setCenter: vi.fn(), getCenter: () => [0, 0], getResolution: () => 2, getZoom: () => 3, zoomBy: vi.fn(), fitExtent: vi.fn(), onViewChange: vi.fn(() => () => {}), destroy: vi.fn() };
const raster = { olLayers: () => [], layers: new Map(), getLayer: () => undefined, destroy: vi.fn(), setSlopeLimits: vi.fn() };
const ops = { update: vi.fn(), setOwnCrew: vi.fn(), setHab: vi.fn(), setCommGrid: vi.fn(), setHavenRule: vi.fn(), bindLayer: vi.fn(), toggleLayer: vi.fn(), availability: () => ({ comm_shadow: false, haven_bands: false }), destroy: vi.fn() };
beforeAll(() => { installDom(); document.documentElement.style.setProperty("--route", "#FFFFFF"); });
afterAll(removeDom);
afterEach(async () => { await mounted?.unmount(); mounted = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function open() {
  vi.mocked(loadSite).mockResolvedValue(loadedSiteFrom(mockManifest()));
  vi.mocked(createMap).mockReturnValue(handle as never);
  vi.mocked(createRasterLayers).mockReturnValue(raster as never);
  vi.mocked(createOpsLayers).mockReturnValue(ops as never);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
  mounted = await mount(createElement(FullScreenMap, { snapshot, crewId: "EV1", onClose: () => {} }));
  await flush();
  return mounted;
}
it("mounts the shared Mars map and real raster controller, and destroys them on close", async () => {
  await open();
  expect(createMap).toHaveBeenCalledOnce();
  expect(createRasterLayers).toHaveBeenCalledOnce();
  expect(ops.update).toHaveBeenCalledWith(snapshot);
  await mounted!.unmount(); mounted = undefined;
  expect(handle.destroy).toHaveBeenCalledOnce();
  expect(raster.destroy).toHaveBeenCalledOnce();
});
it("FOLLOW uses this crew's snapshot position and stops recentering while off; zoom drives the map handle", async () => {
  const view = await open();
  const own = snapshot.crew.find((c) => c.crew_id === "EV1")!;
  expect(handle.setCenter).toHaveBeenCalledWith([own.x_m, own.y_m]);
  await click(must(view.container, '#map-ctrl-follow'));
  handle.setCenter.mockClear();
  const moved = { ...snapshot, crew: snapshot.crew.map((c) => ({ ...c, x_m: c.x_m + 1 })) };
  await view.rerender(createElement(FullScreenMap, { snapshot: moved, crewId: "EV1", onClose: () => {} }));
  expect(ops.update).toHaveBeenLastCalledWith(moved);
  expect(handle.setCenter).not.toHaveBeenCalled();
  await click(must(view.container, '#map-ctrl-follow'));
  expect(handle.setCenter).toHaveBeenCalledWith([own.x_m + 1, own.y_m]);
  await click(must(view.container, '#map-ctrl-zoom-in'));
  expect(handle.zoomBy).toHaveBeenCalledWith(1);
});
it("absent scientific layers are unavailable rather than enabled badges", async () => {
  const view = await open();
  await click(must(view.container, '#map-ctrl-layers'));
  const haven = must<HTMLButtonElement>(view.container, '[data-layer="haven_bands"]');
  expect(haven.disabled).toBe(true);
  expect(haven.textContent).toMatch(/—.*unavailable|unavailable.*—/i);
  expect(view.container.textContent).not.toContain("LAYER: Slope");
});

it("binds the manifest's thermal category even when its raster id is ti", async () => {
  const thermal = { layerId: "ti", category: "thermal", layer: {}, provenance: "modelled", sourceIds: mockManifest().layers[0]!.source_ids, getStatus: () => "ready", setVisible: vi.fn() };
  raster.layers.set("ti", thermal);
  try {
    await open();
    expect(ops.bindLayer).toHaveBeenCalledWith("thermal_inertia", thermal.layer);
  } finally { raster.layers.clear(); }
});
