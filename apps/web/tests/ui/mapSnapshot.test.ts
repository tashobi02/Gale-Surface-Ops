/** T11.04: compositing, asynchronous rendering and view restoration. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapHandle } from "../../src/ui/context";
import { createMapSnapshot, createMapSnapshotDataUrl } from "../../src/ui/briefing/mapSnapshot";
import { installDom, removeDom } from "./domHarness";

describe("map snapshot", () => {
  beforeEach(installDom);
  afterEach(() => { vi.restoreAllMocks(); removeDom(); });
  function fixture() {
    const host = document.createElement("div");
    const layer = document.createElement("div"); layer.className = "ol-layer"; layer.style.opacity = "0.5";
    const canvas = document.createElement("canvas"); canvas.width = 430; canvas.height = 235;
    canvas.style.transform = "matrix(2, 0, 0, 2, 10, 20)"; layer.append(canvas); host.append(layer);
    let ready: (() => void) | undefined;
    const map = { getSize: () => [430, 235], once: vi.fn((_event, fn) => { ready = fn; }), un: vi.fn(), renderSync: vi.fn(() => { ready?.(); }) };
    const handle = { getMap: () => map, getTargetElement: () => host, getCenter: () => [1000, 2000], getZoom: () => 4, fitExtent: vi.fn(), setCenter: vi.fn(), setZoom: vi.fn() } as unknown as MapHandle;
    const context = { setTransform: vi.fn(), drawImage: vi.fn(), clearRect: vi.fn(), globalAlpha: 1 };
    vi.spyOn(window.HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    vi.spyOn(window.HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback) { callback(new Blob(["png"], { type: "image/png" })); });
    vi.spyOn(window.HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,cG5n");
    return { host, handle, context, map };
  }
  it("fits projected extent, waits for rendercomplete and restores view", async () => {
    const { handle, map, context } = fixture();
    expect(await createMapSnapshot(handle, { extent: [100, 200, 500, 600] })).toBeInstanceOf(Blob);
    expect(handle.fitExtent).toHaveBeenCalledWith([100, 200, 500, 600], { animate: false });
    expect(map.once).toHaveBeenCalledWith("rendercomplete", expect.any(Function));
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(context.setTransform).toHaveBeenCalledWith(4, 0, 0, 4, 20, 40);
    expect(handle.setCenter).toHaveBeenLastCalledWith([1000, 2000]);
    expect(handle.setZoom).toHaveBeenLastCalledWith(4);
  });
  it("provides a PNG data URL", async () => {
    const { handle } = fixture();
    expect(await createMapSnapshotDataUrl(handle)).toMatch(/^data:image\/png/);
  });
  it("composes the map into a canvas element, never a data URL (FD-363)", async () => {
    // The app's CSP is `default-src 'self'`, so an `<img src="data:image/png,...">` is refused and the briefing
    // map would never appear. The snapshot is drawn into a canvas element instead, which the CSP does not restrict.
    const { handle, context } = fixture();
    const compose = await import("../../src/ui/briefing/mapSnapshot");
    const composed = await compose.composeBriefingCanvas(handle);
    expect(composed).toBeInstanceOf(window.HTMLCanvasElement);
    expect(composed.width).toBe(860);
    expect(composed.height).toBe(470);
    expect(context.drawImage).toHaveBeenCalled();
  });
  it("rejects a blank map explicitly and restores view", async () => {
    const { host, handle } = fixture(); host.replaceChildren();
    await expect(createMapSnapshot(handle)).rejects.toThrow(/no rendered map/i);
    expect(handle.setZoom).toHaveBeenLastCalledWith(4);
  });
  it("restores the view after a tainted canvas fails", async () => {
    const { handle } = fixture();
    vi.spyOn(window.HTMLCanvasElement.prototype, "toBlob").mockImplementation(() => { throw new Error("Tainted canvas"); });
    await expect(createMapSnapshot(handle)).rejects.toThrow("Tainted canvas");
    expect(handle.setCenter).toHaveBeenLastCalledWith([1000, 2000]);
  });
  it("canvas failure uses thumbnail", async () => {
    const { handle, context } = fixture();
    context.drawImage.mockImplementation(() => { throw new Error("Tainted canvas"); });
    const { createBriefingFallback } = await import("../../src/ui/briefing/mapSnapshot");
    const { mockLoadedSite } = await import("./map/mapFixtures");
    const site = mockLoadedSite();
    const fallback = createBriefingFallback(site, {
      waypoints: [{ id: "start", role: "start", x_m: -3000, y_m: 3000 }, { id: "stop", role: "stop", x_m: 3000, y_m: -3000 }],
      result: { legs: [{ status: "NO_ROUTE", from: "start", to: "stop", reason: "DISCONNECTED_BY_NODATA" }] },
    } as never);
    // The export that fails is the one the card would have used; the fallback needs no canvas at all.
    await expect(createMapSnapshot(handle)).rejects.toThrow("Tainted canvas");
    expect(fallback.querySelector("canvas")).toBeNull();
    // The SCR-01 thumbnail (the coarsest tile of the basemap, FD-109/137) over its own projected footprint: no new asset.
    const image = fallback.querySelector("img")!;
    expect(image.getAttribute("src")).toMatch(/^sites\/mock_site\/tiles\/.+\/0\/0\/0\.png$/);
    expect(image.style.left).toBe("0%"); expect(image.style.top).toBe("0%");
    expect(parseFloat(image.style.width)).toBeCloseTo(8192 / 6000 * 100, 3); // the 32 m/px tile is wider than the 6 km AOI
    expect(image.getAttribute("data-provenance")).toBeTruthy(); expect(image.getAttribute("data-source")).toBeTruthy();
    // North up, linear from aoi.extent_m, one projected metre per unit on both axes (a square AOI gives a square frame).
    const svg = fallback.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 235 235");
    const frame = fallback.querySelector<HTMLElement>(".scr08-fallback-frame")!;
    expect(frame.style.width).toBe("235px");
    // A NO ROUTE leg is the straight dashed line between its stops, labelled by class (dashes live in the .css file, CSP).
    const route = svg.querySelector("polyline.route")!;
    expect(route.getAttribute("points")).toBe("0,0 235,235");
    expect(route.classList.contains("no-route")).toBe(true);
    expect(svg.querySelectorAll("circle.stop")).toHaveLength(2);
    expect([...svg.querySelectorAll("text")].map(t => t.textContent)).toEqual(["0", "1"]);
    expect(svg.getAttribute("data-provenance")).toBe("derived"); expect(svg.getAttribute("data-source")).toBeTruthy();
    expect(svg.getAttribute("aria-label")).toMatch(/NO ROUTE/);
  });
  it("the fallback draws an OK leg from its geometry, row 0 north, and says the basemap is missing when the thumbnail fails", async () => {
    const { createBriefingFallback } = await import("../../src/ui/briefing/mapSnapshot");
    const { mockLoadedSite } = await import("./map/mapFixtures");
    const fallback = createBriefingFallback(mockLoadedSite(), {
      waypoints: [{ id: "start", role: "start", x_m: 0, y_m: 0 }, { id: "stop", role: "stop", x_m: 1500, y_m: 1500 }],
      result: { legs: [{ status: "OK", from: "start", to: "stop", geometry: [[0, 0], [1500, 0], [1500, 1500]] }] },
    } as never);
    const route = fallback.querySelector("polyline.route")!;
    expect(route.classList.contains("no-route")).toBe(false);
    // x = (x_m + 3000) / 6000 * 235 and y = (3000 - y_m) / 6000 * 235: north is up, so a larger y_m is a smaller y.
    expect(route.getAttribute("points")).toBe("117.5,117.5 176.25,117.5 176.25,58.75");
    fallback.querySelector("img")!.dispatchEvent(new window.Event("error"));
    expect(fallback.querySelector("img")).toBeNull();
    const missing = fallback.querySelector<HTMLElement>(".scr08-thumbnail-missing")!;
    expect(missing.textContent).toBe("Basemap —");
    expect(missing.dataset.unavailable).toBe("true"); expect(missing.dataset.source).toBeTruthy();
  });
  it("bounds the render wait and removes the listener", async () => {
    const { handle, map } = fixture(); map.renderSync.mockImplementation(() => {});
    await expect(createMapSnapshot(handle, { timeoutMs: 1 })).rejects.toThrow(/timed out/i);
    expect(map.un).toHaveBeenCalledWith("rendercomplete", expect.any(Function));
    expect(handle.setZoom).toHaveBeenLastCalledWith(4);
  });
});

it("PRINT vector palette clones styles and uses PRINT ink and paper", async () => {
  const { applyPrintPalette } = await import("../../src/ui/briefing/mapSnapshot");
  const [{ default: VectorLayer }, { default: Style }, { default: Stroke }, { default: Fill }, { default: Circle }, { default: Feature }] = await Promise.all([
    import("ol/layer/Vector"), import("ol/style/Style"), import("ol/style/Stroke"), import("ol/style/Fill"), import("ol/style/Circle"), import("ol/Feature"),
  ]);
  const original = new Style({ stroke: new Stroke({ color: "cyan", width: 4, lineDash: [8, 8] }), image: new Circle({ radius: 14, fill: new Fill({ color: "cyan" }), stroke: new Stroke({ color: "red" }) }) });
  const layer = new VectorLayer({ style: original });
  applyPrintPalette(layer, { ink: "black", paper: "white" });
  const styled = layer.getStyleFunction()!(new Feature(), 1) as import("ol/style/Style").default[];
  expect(styled[0].getStroke()?.getColor()).toBe("black");
  expect(styled[0].getStroke()?.getLineDash()).toEqual([8, 8]);
  expect((styled[0].getImage() as import("ol/style/Circle").default).getFill()?.getColor()).toBe("white");
  // OL draws from cached render options, not directly from the mutable Stroke object.
  const cached = styled[0].getImage() as unknown as { renderOptions_: { strokeStyle: string } };
  expect(cached.renderOptions_.strokeStyle).toBe("black");
  expect(original.getStroke()?.getColor()).toBe("cyan");
});
