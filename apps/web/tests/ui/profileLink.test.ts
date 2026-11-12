import { afterAll, beforeAll, expect, it } from "vitest";
import type VectorLayer from "ol/layer/Vector.js";
import type VectorSource from "ol/source/Vector.js";
import { linkProfileToMap } from "../../src/ui/results/profileLink";
import { installDom, removeDom } from "./domHarness";
import { fakeMapHandle } from "./fakeMapHandle";
import { fakePlanStore } from "./planStoreFake";
beforeAll(installDom);
afterAll(removeDom);

it("hover sets map marker", () => {
  const { handle, host } = fakeMapHandle();
  const fake = fakePlanStore();
  const { store } = fake;
  store.setHover = (hover) => fake.emit({ hover });
  const el = document.createElement("div");
  el.innerHTML = '<svg><circle data-profile-sample data-distance-m="5" data-leg-index="0" data-x-m="3" data-y-m="4" tabindex="0" /></svg>';
  const unlink = linkProfileToMap(handle, el, store);
  el.querySelector("circle")!.dispatchEvent(new window.MouseEvent("pointerover", { bubbles: true }));
  expect(store.get().hover).toEqual({ distance_m: 5, leg_index: 0, coord: [3, 4] });
  const layer = host.layers[0] as VectorLayer<VectorSource>;
  expect(layer.getSource()!.getFeatures()[0]!.getGeometry()!.getExtent()).toEqual([3, 4, 3, 4]);
  el.dispatchEvent(new window.MouseEvent("pointerleave"));
  expect(store.get().hover).toBeNull();
  unlink();
  expect(host.layers).toHaveLength(0);
});
it("map hover highlights the matching profile sample and focus is keyboard reachable", () => {
  const { handle } = fakeMapHandle();
  const fake = fakePlanStore();
  const { store } = fake;
  store.setHover = (hover) => fake.emit({ hover });
  const el = document.createElement("div");
  el.innerHTML = '<svg><circle data-profile-sample data-distance-m="5" data-leg-index="0" data-x-m="3" data-y-m="4" tabindex="0" /></svg>';
  const unlink = linkProfileToMap(handle, el, store);
  const sample = el.querySelector("circle")!;
  sample.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
  expect(store.get().hover?.distance_m).toBe(5);
  store.setHover({ distance_m: 5, leg_index: 0, coord: [3, 4] });
  expect(sample.getAttribute("data-active")).toBe("true");
  unlink();
  expect(sample.hasAttribute("data-active")).toBe(false);
});
it("map pointer over the first route leg updates the profile and unregisters listeners", () => {
  const { handle, host } = fakeMapHandle();
  const fake = fakePlanStore();
  fake.store.setHover = hover => fake.emit({ hover });
  let listener: ((e: { coordinate: number[]; pixel: number[] }) => void) | undefined;
  Object.assign(host, {
    on: (_type: string, fn: typeof listener) => { listener = fn; },
    un: (_type: string, fn: typeof listener) => { if (listener === fn) listener = undefined; },
    forEachFeatureAtPixel: (_pixel: unknown, callback: (f: { get: (key: string) => unknown }) => unknown) => {
      const result = callback({ get: key => key === "type" ? "ok_leg" : 0 });
      return result || undefined; // OL only stops on a truthy callback value.
    },
  });
  const el = document.createElement("div");
  el.innerHTML = '<svg><circle data-profile-sample data-distance-m="5" data-leg-index="0" data-x-m="3" data-y-m="4" tabindex="0" /></svg>';
  const unlink = linkProfileToMap(handle, el, fake.store);
  listener!({ coordinate: [3, 4], pixel: [0, 0] });
  expect(fake.store.get().hover?.leg_index).toBe(0);
  expect(el.querySelector("circle")!.getAttribute("data-active")).toBe("true");
  unlink();
  expect(listener).toBeUndefined();
});
it("arrow keys move the profile cursor between samples", () => {
  const { handle } = fakeMapHandle();
  const fake = fakePlanStore();
  fake.store.setHover = hover => fake.emit({ hover });
  const el = document.createElement("div");
  document.body.append(el);
  el.innerHTML = '<svg><circle data-profile-sample data-distance-m="0" data-leg-index="0" data-x-m="0" data-y-m="0" tabindex="0" /><circle data-profile-sample data-distance-m="5" data-leg-index="0" data-x-m="5" data-y-m="0" tabindex="0" /></svg>';
  const unlink = linkProfileToMap(handle, el, fake.store);
  const first = el.querySelector("circle")!;
  first.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
  expect(fake.store.get().hover?.distance_m).toBe(5);
  unlink(); el.remove();
});
