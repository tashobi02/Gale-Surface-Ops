/** T02.06/T07.16: real Mars image sources and automatic tile degradation (FD-101, FD-193). */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type ImageLayer from "ol/layer/Image.js";
import type TileLayer from "ol/layer/Tile.js";
import Static from "ol/source/ImageStatic.js";
import { createImageStatic } from "../../src/ui/map/imageStatic";
import { createRasterLayers, type RasterLayersOptions } from "../../src/ui/map/rasterLayers";
import { DEFAULT_SCENARIO } from "../../src/state/planStore";
import { loadedSiteFrom, mockManifest } from "./map/mapFixtures";
import { installDom, removeDom } from "./domHarness";

beforeEach(installDom);
afterEach(removeDom);
const tokens: Record<string, string> = { "--slope-10-15": "#F5A524", "--slope-15-25": "#E4572E", "--slope-opacity-10-15": "0.55", "--slope-opacity-15-25": "0.65" };
const scenario = { get: () => ({ scenario: DEFAULT_SCENARIO }) as never, subscribe: () => () => {} };
const build = (site: ReturnType<typeof loadedSiteFrom>, extra: Partial<RasterLayersOptions> = {}) =>
  createRasterLayers(site, { scenario, deps: { readToken: n => tokens[n] ?? "", ...extra.deps }, ...extra });
const coarsest = { url: "sites/mock_site/tiles/elevation/0/0/0.png", extent: [-3000, -5192, 5192, 3000] };
/** The mock site has no ortho: its elevation tile set stands in for one (category `optical`). */
function orthoFixture() {
  const manifest = mockManifest();
  manifest.layers.find(l => l.layer_id === "elevation")!.category = "optical";
  return loadedSiteFrom(manifest);
}
/** Every attempted tile fails: the tile source reports one start and one error. */
function failAllTiles(tile: TileLayer): void {
  tile.getSource()!.dispatchEvent("tileloadstart"); tile.getSource()!.dispatchEvent("tileloaderror");
}

/** A site whose manifest declares the pipeline's static PNG for the elevation layer (BD-23). */
function declaredFixture() {
  const manifest = mockManifest();
  const def = manifest.layers.find(l => l.layer_id === "elevation")!;
  const asset = { ...manifest.assets.find(a => a.asset_id === def.asset_id)!, asset_id: "fixture-static-elevation", format: "png" as const, path: "images/elevation.png" };
  manifest.assets.push(asset);
  return { site: loadedSiteFrom(manifest), def, asset };
}

it("ImageStatic covers the AOI in projected Mars metres and credits its sources", () => {
  const { site, def, asset } = declaredFixture();
  const image = createImageStatic(site, { ...def, kind: "image_static", asset_id: asset.asset_id });
  const source = image.getSource()!;
  expect(source).toBeInstanceOf(Static);
  expect(source.getImageExtent()).toEqual(site.site.aoi.extent_m);
  expect(source.getProjection()?.getCode()).toBe("MARS_LOCAL:mock_site");
  expect(source.getUrl()).toBe("sites/mock_site/images/elevation.png");
  expect(source.getAttributions()?.({} as never).toString()).toContain(site.sources.get(def.source_ids[0])!.credit);
  image.dispose();
});

it("ImageStatic can cover a tile's own footprint when it is given the url and extent", () => {
  const { site, def } = declaredFixture();
  const image = createImageStatic(site, def, { url: coarsest.url, imageExtent: [-3000, -5192, 5192, 3000] });
  expect(image.getSource()!.getUrl()).toBe(coarsest.url);
  expect(image.getSource()!.getImageExtent()).toEqual(coarsest.extent);
  expect(image.getExtent()).toEqual(site.site.aoi.extent_m); // drawn only inside the AOI
  image.dispose();
});

it("tile failure switches to image", () => {
  const { site } = declaredFixture();
  const added: string[] = [];
  const controller = build(site, { onFallbackLayer: (id) => added.push(id) });
  const managed = controller.getLayer("elevation")!;
  const tile = managed.layer as TileLayer;
  managed.setVisible(true);
  expect(managed.getFallback()).toBeNull();
  expect(controller.olLayers()).toHaveLength(2); // the primary path adds nothing
  failAllTiles(tile);
  const fallback = managed.getFallback()!;
  // A declared static PNG (BD-23) wins over the coarsest tile.
  expect(fallback).toMatchObject({ kind: "declared_image", url: "sites/mock_site/images/elevation.png" });
  expect(added).toEqual(["elevation"]);
  const image = fallback.layer as ImageLayer<Static>;
  expect(image.getVisible()).toBe(true); expect(tile.getVisible()).toBe(false);
  expect(image.getSource()!.getImageExtent()).toEqual(site.site.aoi.extent_m);
  image.getSource()!.dispatchEvent("imageloadend");
  expect(managed.getStatus()).toBe("ready");
  managed.setOpacity(0.4); expect(image.getOpacity()).toBe(0.4); expect(tile.getOpacity()).toBe(0.4);
  managed.setVisible(false); expect(image.getVisible()).toBe(false); expect(tile.getVisible()).toBe(false);
  managed.setVisible(true); expect(image.getVisible()).toBe(true); expect(tile.getVisible()).toBe(false);
  image.getSource()!.dispatchEvent("imageloaderror");
  expect(managed.getStatus()).toBe("unavailable");
  controller.destroy();
});

it("the ortho falls back to its coarsest tile image over the tile's own footprint when no static PNG is declared (FD-101)", () => {
  const site = orthoFixture();
  const statuses: string[] = [];
  const controller = build(site, { onStatusChange: (_id, status) => statuses.push(status) });
  const managed = controller.getLayer("elevation")!;
  const tile = managed.layer as TileLayer;
  managed.setVisible(true);
  failAllTiles(tile);
  const fallback = managed.getFallback()!;
  expect(fallback).toMatchObject({ kind: "coarsest_tile", url: coarsest.url, resolutionM: 32 });
  const source = (fallback.layer as ImageLayer<Static>).getSource()!;
  expect(source.getImageExtent()).toEqual(coarsest.extent);
  expect(source.getProjection()?.getCode()).toBe("MARS_LOCAL:mock_site");
  expect(managed.getStatus()).toBe("loading");
  source.dispatchEvent("imageloadend");
  expect(managed.getStatus()).toBe("ready");
  expect(statuses.at(-1)).toBe("ready");
  controller.destroy();
});

it("a failed tile does not discard other successfully loaded tiles", () => {
  const { site } = declaredFixture();
  const controller = build(site);
  const managed = controller.getLayer("elevation")!;
  const tile = managed.layer as TileLayer;
  managed.setVisible(true);
  tile.getSource()!.dispatchEvent("tileloadstart"); tile.getSource()!.dispatchEvent("tileloadstart");
  tile.getSource()!.dispatchEvent("tileloadend"); tile.getSource()!.dispatchEvent("tileloaderror");
  expect(managed.getFallback()).toBeNull(); expect(tile.getVisible()).toBe(true);
  controller.destroy();
});

it("waits for every attempted tile before it switches", () => {
  const site = orthoFixture();
  const controller = build(site);
  const managed = controller.getLayer("elevation")!;
  const tile = managed.layer as TileLayer;
  managed.setVisible(true);
  tile.getSource()!.dispatchEvent("tileloadstart"); tile.getSource()!.dispatchEvent("tileloadstart");
  tile.getSource()!.dispatchEvent("tileloaderror");
  expect(managed.getFallback()).toBeNull(); // one tile is still on its way
  tile.getSource()!.dispatchEvent("tileloaderror");
  expect(managed.getFallback()?.kind).toBe("coarsest_tile");
  controller.destroy();
});

it("a 2 m overlay without a declared PNG has no stand-in and stays unavailable; so does an ortho with no tile set", () => {
  const overlay = build(loadedSiteFrom(mockManifest()));
  const managed = overlay.getLayer("elevation")!;
  managed.setVisible(true);
  failAllTiles(managed.layer as TileLayer);
  expect(managed.getFallback()).toBeNull();
  expect(managed.getStatus()).toBe("unavailable");
  overlay.destroy();

  const ortho = orthoFixture();
  ortho.assets.delete("tiles-elevation");
  const missing = build(ortho);
  expect(missing.getLayer("elevation")!.getStatus()).toBe("unavailable");
  expect(missing.getLayer("elevation")!.getFallback()).toBeNull();
  missing.destroy();
});

it("a missing tile set with a declared PNG shows the image at once", () => {
  const withImage = declaredFixture();
  withImage.site.assets.delete("tiles-elevation");
  const first = build(withImage.site);
  expect(first.getLayer("elevation")!.getFallback()?.kind).toBe("declared_image");
  first.destroy();
});

it("keeps an unavailable row for an image_static layer whose asset is missing", () => {
  const { site, def } = declaredFixture();
  def.kind = "image_static"; def.asset_id = "missing-fixture-image";
  const controller = build(site);
  expect(controller.getLayer(def.layer_id)?.getStatus()).toBe("unavailable");
  controller.destroy();
});

it("data-encoded static slope uses the same palette and changes with scenario limits", async () => {
  for (const name of ["HTMLImageElement", "HTMLCanvasElement", "HTMLVideoElement"] as const) vi.stubGlobal(name, window[name]);
  try {
    const manifest = mockManifest();
    const def = manifest.layers.find(l => l.layer_id === "slope")!;
    def.kind = "image_static";
    const asset = manifest.assets.find(a => a.asset_id === def.asset_id)!; asset.format = "png"; asset.path = "images/slope.png";
    const site = loadedSiteFrom(manifest);
    const encoded: number[][] = [];
    const decodeTile = vi.fn(async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([48, 48, 48, 255]) })); // 12 degrees, C9 encoding.
    const controller = build(site, { deps: {
      readToken: n => tokens[n] ?? "", decodeTile,
      encodeTile: tile => { encoded.push([...tile.data]); const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1; return canvas; },
    } });
    const image = controller.getLayer("slope")!.layer as ImageLayer<Static>;
    const first = (image.getSource() as never as { getImageInternal(...a: unknown[]): { load(): void; getState(): number; getResolution(): number[] } })
      .getImageInternal(site.site.aoi.extent_m, 1, 1, image.getSource()!.getProjection()!);
    first.load(); await vi.waitFor(() => expect(first.getState()).toBe(2));
    expect(encoded[0]).toEqual([245, 165, 36, 140]);
    expect(first.getResolution()).toEqual([6000, 6000]);
    controller.setSlopeLimits(8, 10);
    const second = (image.getSource() as never as { getImageInternal(...a: unknown[]): { load(): void; getState(): number } })
      .getImageInternal(site.site.aoi.extent_m, 1, 1, image.getSource()!.getProjection()!);
    second.load(); await vi.waitFor(() => expect(second.getState()).toBe(2));
    expect(encoded[1]).toEqual([228, 87, 46, 255]);
    expect(controller.getLayer("slope")!.getStatus()).toBe("ready");
    controller.destroy();
  } finally { vi.unstubAllGlobals(); }
});

it("the slope fallback decodes the declared PNG with the scenario palette and follows the limits", async () => {
  for (const name of ["HTMLImageElement", "HTMLCanvasElement", "HTMLVideoElement"] as const) vi.stubGlobal(name, window[name]);
  try {
    const manifest = mockManifest();
    manifest.assets.push({ asset_id: "fixture-static-slope", format: "png", path: "images/slope.png", sha256: "0".repeat(64), bytes: 1, width: 1, height: 1 } as never);
    const site = loadedSiteFrom(manifest);
    const decoded: string[] = [], encoded: number[][] = [];
    const controller = build(site, { deps: {
      readToken: n => tokens[n] ?? "",
      decodeTile: async (url) => { decoded.push(url); return { width: 1, height: 1, data: new Uint8ClampedArray([48, 48, 48, 255]) }; },
      encodeTile: tile => { encoded.push([...tile.data]); const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1; return canvas; },
    } });
    const managed = controller.getLayer("slope")!;
    managed.setVisible(true);
    failAllTiles(managed.layer as TileLayer);
    const fallback = managed.getFallback()!;
    expect(fallback).toMatchObject({ kind: "declared_image", url: "sites/mock_site/images/slope.png", resolutionM: 6000 });
    const imageOf = () => (fallback.layer as ImageLayer<Static>).getSource() as never as { getImageInternal(...a: unknown[]): { load(): void; getState(): number } };
    const projection = (fallback.layer as ImageLayer<Static>).getSource()!.getProjection()!;
    const first = imageOf().getImageInternal(site.site.aoi.extent_m, 1, 1, projection);
    first.load(); await vi.waitFor(() => expect(first.getState()).toBe(2));
    expect(decoded.at(-1)).toBe("sites/mock_site/images/slope.png");
    expect(encoded.at(-1)).toEqual([245, 165, 36, 140]); // 12 degrees: caution class at 10..15
    controller.setSlopeLimits(8, 10);
    const second = imageOf().getImageInternal(site.site.aoi.extent_m, 1, 1, projection);
    second.load(); await vi.waitFor(() => expect(second.getState()).toBe(2));
    expect(encoded.at(-1)).toEqual([228, 87, 46, 255]); // 12 degrees is now over the hard limit
    controller.destroy();
  } finally { vi.unstubAllGlobals(); }
});

it("destroy disposes the fallback layer and stops reporting", () => {
  const site = orthoFixture();
  const statuses: string[] = [];
  const controller = build(site, { onStatusChange: (_id, status) => statuses.push(status) });
  const managed = controller.getLayer("elevation")!;
  managed.setVisible(true);
  failAllTiles(managed.layer as TileLayer);
  const image = managed.getFallback()!.layer as ImageLayer<Static>;
  const dispose = vi.spyOn(image, "dispose");
  controller.destroy();
  expect(dispose).toHaveBeenCalled();
  const seen = statuses.length;
  image.getSource()?.dispatchEvent("imageloadend");
  expect(statuses).toHaveLength(seen);
});
