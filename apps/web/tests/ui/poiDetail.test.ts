import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createElement } from "react";
import { PoiDetail } from "../../src/ui/screens/scr06PoiDetail";
import type { AppContext } from "../../src/ui/context";
import { click, fire, installDom, mount, must, removeDom } from "./domHarness";
import { fakePlanStore } from "./planStoreFake";
import { mockLoadedSite } from "./map/mapFixtures";
beforeAll(installDom);
afterAll(removeDom);

function fixture(image = false) {
  const site = mockLoadedSite();
  const poi = [...site.pois.values()][0]!;
  if (image) {
    const asset = site.assets.get("grid-elevation")!;
    site.assets.set(asset.asset_id, { ...asset, url: "/sites/mock_site/images/test.jpg" });
    const source = site.sources.values().next().value!;
    poi.properties = { ...poi.properties, image_asset: asset.asset_id, image_credit: source.credit, image_source_url: source.url, image_sol: 4171, image_date: "2024-05-01", image_camera: "Mastcam" };
  }
  const fake = fakePlanStore();
  const ctx = { site, planStore: fake.store } as AppContext;
  return { ctx, poi, fake };
}
it("image missing state stays usable", async () => {
  const { ctx, poi, fake } = fixture();
  const add = vi.spyOn(fake.store, "addWaypoint");
  const view = await mount(createElement(PoiDetail, { ctx, selectedPoiId: poi.properties.poi_id }));
  expect(view.container.textContent).toContain("Image not available");
  expect(view.container.textContent).toContain(poi.properties.science_objective);
  await click(must(view.container, "button[data-add-stop]"));
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: "", role: "stop", poi_id: poi.properties.poi_id, x_m: poi.geometry.coordinates[0], y_m: poi.geometry.coordinates[1] }));
  await view.unmount();
});
it("credit and sol labelled", async () => {
  const { ctx, poi } = fixture(true);
  const view = await mount(createElement(PoiDetail, { ctx, selectedPoiId: poi.properties.poi_id }));
  for (const field of ["credit", "sol", "date", "camera"]) {
    const el = must(view.container, `[data-image-${field}]`);
    expect(el.getAttribute("data-provenance")).toBe("measured");
    expect(el.getAttribute("data-source")).toBe(poi.properties.image_source_url);
    expect(el.textContent).not.toBe("—");
  }
  const img = must(view.container, "img");
  expect(img.getAttribute("alt")).toContain("Boxwork ridge");
  expect(img.getAttribute("alt")).toContain("Mastcam");
  expect(img.getAttribute("alt")).toContain("4171");
  expect(img.getAttribute("src")).toBe("/sites/mock_site/images/test.jpg");
  await fire(img, new window.Event("error"));
  expect(view.container.textContent).toContain("Image not available");
  expect(must<HTMLButtonElement>(view.container, "[data-add-stop]").disabled).toBe(false);
  await view.unmount();
});
it("stop type shape and word", async () => {
  const { ctx, poi } = fixture();
  const view = await mount(createElement(PoiDetail, { ctx, selectedPoiId: poi.properties.poi_id }));
  expect(must(view.container, "[data-stop-type]").getAttribute("data-shape")).toBe("triangle");
  expect(must(view.container, "[data-stop-type]").textContent).toContain("SCIENCE");
  expect(view.container.textContent).toContain("EZ—SCI 01");
  expect(must(view.container, "[data-position]").getAttribute("data-source")).toBe(`pois:${poi.properties.poi_id}`);
  await view.unmount();
});
it("remove stop uses the existing waypoint id", async () => {
  const { ctx, poi, fake } = fixture();
  fake.emit({ waypoints: [...fake.store.get().waypoints, { id: "wp-2", role: "stop", x_m: 410, y_m: 325, poi_id: poi.properties.poi_id }] });
  const remove = vi.spyOn(fake.store, "deleteWaypoint");
  const view = await mount(createElement(PoiDetail, { ctx, selectedPoiId: poi.properties.poi_id }));
  const button = must(view.container, "[data-remove-stop]");
  expect(button.textContent).toBe("Remove stop");
  await click(button);
  expect(remove).toHaveBeenCalledWith("wp-2");
  await view.unmount();
});
it("remote image assets are never requested", async () => {
  const { ctx, poi } = fixture(true);
  ctx.site.assets.get(poi.properties.image_asset!)!.url = poi.properties.image_source_url!;
  const view = await mount(createElement(PoiDetail, { ctx, selectedPoiId: poi.properties.poi_id }));
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container.textContent).toContain("Image not available");
  await view.unmount();
});
it("native image dialog closes and returns focus", async () => {
  const { ctx, poi } = fixture(true);
  Object.defineProperty(window.HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(window.HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); } });
  const view = await mount(createElement(PoiDetail, { ctx, selectedPoiId: poi.properties.poi_id }));
  await fire(must(view.container, "img"), new window.Event("load"));
  const open = must<HTMLButtonElement>(view.container, "[data-enlarge-image]");
  await click(open);
  expect(must<HTMLDialogElement>(view.container, "dialog").open).toBe(true);
  await click(must(view.container, "dialog button"));
  expect(document.activeElement).toBe(open);
  await view.unmount();
});
it("EZ numbering follows global POI order across stop types", async () => {
  const { ctx, poi } = fixture();
  const resource = { ...poi, properties: { ...poi.properties, poi_id: "poi-sulfate-ledge", stop_type: "resource" as const } };
  ctx.site.pois.set(resource.properties.poi_id, resource);
  const view = await mount(createElement(PoiDetail, { ctx, selectedPoiId: resource.properties.poi_id }));
  expect(view.container.textContent).toContain("EZ—RES 02");
  expect(must(view.container, "[data-stop-type]").getAttribute("data-shape")).toBe("square");
  await view.unmount();
});
it("full plan disables Add as stop with a sourced limit reason", async () => {
  const { ctx, poi, fake } = fixture();
  fake.emit({ waypoints: [...fake.store.get().waypoints.slice(0, 1), ...Array.from({ length: 10 }, (_, i) => ({ id: `wp-${i + 1}`, role: "stop" as const, x_m: 0, y_m: 0 }))] });
  const view = await mount(createElement(PoiDetail, { ctx, selectedPoiId: poi.properties.poi_id }));
  expect(must<HTMLButtonElement>(view.container, "[data-add-stop]").disabled).toBe(true);
  expect(must(view.container, "#scr06-stop-limit").textContent).toContain("10");
  expect(must(view.container, "#scr06-stop-limit [data-source]").getAttribute("data-source")).toBe("spec:02-E.3");
  await view.unmount();
});
