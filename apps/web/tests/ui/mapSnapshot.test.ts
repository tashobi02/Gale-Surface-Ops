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
