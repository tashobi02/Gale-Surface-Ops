import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { Snapshot } from "@marswalk/protocol";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import LineString from "ol/geom/LineString.js";
import { mockLoadedSite } from "./map/mapFixtures";
import { installDom, mount, removeDom } from "./domHarness";

const maps = vi.hoisted(() => ({ layers: [] as unknown[] }));
vi.mock("../../src/boot/loadSite", () => ({ loadSite: vi.fn() }));
vi.mock("../../src/ui/map/tokenColors", () => ({ tokenColor: () => "#ffffff" }));
vi.mock("../../src/ui/map/createMap", () => ({ createMap: ({ target }: { target: HTMLElement }) => ({
  getTargetElement: () => target, getMap: () => ({ addLayer: (layer: unknown) => maps.layers.push(layer) }), destroy: () => {},
}) }));
vi.mock("../../src/ui/map/opsLayers", () => ({ createOpsLayers: () => ({ setOwnCrew: () => {}, update: () => {}, setHab: () => {}, setCommGrid: () => {}, destroy: () => {} }) }));
import { loadSite } from "../../src/boot/loadSite";
import { MiniMap } from "../../src/ui/eva/MiniMap";

beforeAll(installDom);
afterAll(removeDom);

it("redraws the EVA mini-map when a new route has the same number of points", async () => {
  const site = mockLoadedSite();
  site.site.layers = site.site.layers.filter((layer) => layer.category !== "optical");
  vi.mocked(loadSite).mockResolvedValue(site);
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array(site.site.grid.width * site.site.grid.height)));
  const snapshot = (geometry: [number, number][]) => ({ plan: { site_id: site.site.site_id, result: { legs: [{ status: "OK", geometry }] } } }) as unknown as Snapshot;
  const view = await mount(createElement(MiniMap, { snapshot: snapshot([[1, 2], [3, 4]]) }));
  const route = maps.layers.find((layer) => layer instanceof VectorLayer) as VectorLayer<VectorSource>;
  expect(route).toBeDefined();
  const source = route.getSource()!;
  expect((source.getFeatures()[0]!.getGeometry() as LineString).getCoordinates()).toEqual([[1, 2], [3, 4]]);
  await view.rerender(createElement(MiniMap, { snapshot: snapshot([[5, 6], [7, 8]]) }));
  expect((source.getFeatures()[0]!.getGeometry() as LineString).getCoordinates()).toEqual([[5, 6], [7, 8]]);
  await view.unmount();
  fetchSpy.mockRestore();
});
