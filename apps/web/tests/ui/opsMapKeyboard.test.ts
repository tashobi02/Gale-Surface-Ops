import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createElement } from "react";
import { mockLoadedSite } from "./map/mapFixtures";
import { fire, installDom, mount, must, removeDom } from "./domHarness";

const fake = vi.hoisted(() => ({ centre: [100, 200] as [number, number], options: null as null | { keyboard?: unknown }, pan: vi.fn(), attach: vi.fn(() => () => {}) }));
vi.mock("../../src/boot/loadSite", () => ({ loadSite: vi.fn() }));
vi.mock("../../src/ui/map/createMap", () => ({ createMap: (options: { target: HTMLElement; keyboard?: unknown }) => {
  fake.options = options;
  const viewport = document.createElement("div"); viewport.tabIndex = 0; options.target.append(viewport);
  return { getMap: () => ({ addLayer: () => {}, on: () => {} }), getTargetElement: () => viewport,
    getCenter: () => fake.centre, panBy: fake.pan, destroy: () => {} };
} }));
vi.mock("../../src/ui/map/opsLayers", () => ({
  createOpsLayers: () => ({ setHab: () => {}, update: () => {}, setHavenRule: () => {}, rows: () => [], destroy: () => {} }),
  opsLayerRows: () => [],
}));
vi.mock("../../src/ui/map/keyboard", () => ({ attachKeyboardControls: fake.attach }));
import { loadSite } from "../../src/boot/loadSite";
import { OpsMap } from "../../src/ui/ops/OpsMap";

beforeAll(installDom);
afterAll(removeDom);

it("offers keyboard map panning and picks the centre with Enter only in picking mode", async () => {
  const site = mockLoadedSite(); site.site.layers = []; site.assets.clear();
  vi.mocked(loadSite).mockResolvedValue(site);
  const pick = vi.fn();
  const view = await mount(createElement(OpsMap, { snapshot: null, picking: true, onPick: pick }));
  const canvas = must(view.container, '[data-slot="map-canvas"]');
  const viewport = must<HTMLElement>(canvas, '[tabindex="0"]');
  expect(fake.attach).toHaveBeenCalledWith(expect.objectContaining({ target: viewport }));
  expect(view.container.querySelector('[data-slot="pick-crosshair"]')).not.toBeNull();
  viewport.focus();
  await fire(viewport, new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  expect(pick).toHaveBeenCalledWith({ x_m: 100, y_m: 200 });
  await view.rerender(createElement(OpsMap, { snapshot: null, picking: false, onPick: pick }));
  await fire(viewport, new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  expect(pick).toHaveBeenCalledTimes(1);
  await view.unmount();
});
