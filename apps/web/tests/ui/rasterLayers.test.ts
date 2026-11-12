/**
 * T07.07 — tiled raster layers (FR-01, FR-02, FR-16, NFR-07, 04 §C.1, C9; 01 §E.1 step 6).
 * Real OpenLayers; the browser pieces jsdom lacks (tile fetch and canvas) are injected through `deps`.
 */
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type TileLayer from "ol/layer/Tile.js";
import type DataTile from "ol/source/DataTile.js";
import type XYZ from "ol/source/XYZ.js";
import type { ImageLike } from "ol/DataTile.js";
import type { ClassesLegend, Layer, MissionScenario, Site } from "@marswalk/protocol";
import {
  attributionOf,
  classifySlopeTile,
  createRasterLayers,
  readSlopePalette,
  slopeBands,
  slopeLegend,
  zIndexOf,
  type DecodedTile,
  type RasterDeps,
  type RasterLayersController,
  type SlopePalette,
} from "../../src/ui/map/rasterLayers";
import { LAYER_Z_INDEX, type LoadedSite, type MapView } from "../../src/ui/context";
import type { PlanState } from "../../src/state/planStore";
import { parseHexColour } from "../../src/ui/map/mapTokens";
import { getMarsProjectionCode, registerMarsProjection } from "../../src/ui/map/projection";
import { loadedSiteFrom, mockManifest } from "./map/mapFixtures";
import { installDom, removeDom } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());

const TOKENS: Record<string, string> = {
  "--slope-5-10": "#FDE7A9",
  "--slope-10-15": "#F5A524",
  "--slope-15-25": "#E4572E",
  "--slope-gt-25": "#8B1E3F",
  "--slope-opacity-5-10": "0.40",
  "--slope-opacity-10-15": "0.55",
  "--slope-opacity-15-25": "0.65",
  "--slope-opacity-gt-25": "0.75",
};
const PALETTE: SlopePalette = readSlopePalette((name) => TOKENS[name] ?? "");

/** A scenario store whose limits a test can change; only `get` and `subscribe` are used. */
function scenarioStore(caution: number, hard: number) {
  let state = { scenario: { caution_slope_deg: caution, hard_slope_limit_deg: hard } as MissionScenario } as PlanState;
  const listeners = new Set<(s: PlanState) => void>();
  return {
    get: () => state,
    subscribe: (fn: (s: PlanState) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(next: Partial<MissionScenario>) {
      state = { ...state, scenario: { ...state.scenario, ...next } };
      listeners.forEach((fn) => fn(state));
    },
    listenerCount: () => listeners.size,
  };
}

/** A slope tile: each pixel a data value (degrees x 4) in R = G = B, alpha 255. */
function slopeTile(degrees: number[], width = degrees.length, height = 1): DecodedTile {
  const data = new Uint8ClampedArray(width * height * 4);
  degrees.forEach((deg, i) => {
    const value = deg === 255 ? 255 : Math.round(deg * 4);
    data.set([value, value, value, 255], i * 4);
  });
  return { width, height, data };
}
const pixel = (t: DecodedTile, i: number): number[] => [...t.data.slice(i * 4, i * 4 + 4)];

interface Harness {
  controller: RasterLayersController;
  store: ReturnType<typeof scenarioStore>;
  decode: ReturnType<typeof vi.fn>;
  encoded: DecodedTile[];
}
const open: RasterLayersController[] = [];
afterEach(() => open.splice(0).forEach((c) => c.destroy()));

function build(
  site: LoadedSite = loadedSiteFrom(mockManifest()),
  opts: { limits?: [number, number]; decode?: (url: string) => Promise<DecodedTile>; mapHandle?: Parameters<typeof createRasterLayers>[1]["mapHandle"]; onStatusChange?: (id: string, s: string) => void } = {},
): Harness {
  registerMarsProjection(site.site);
  const store = scenarioStore(...(opts.limits ?? [10, 15]));
  const decode = vi.fn(opts.decode ?? (async () => slopeTile([0, 7, 12, 20, 30, 255])));
  const encoded: DecodedTile[] = [];
  const deps: Partial<RasterDeps> = {
    decodeTile: decode as unknown as RasterDeps["decodeTile"],
    encodeTile: (t) => {
      encoded.push(t);
      return t as unknown as ImageLike;
    },
    readToken: (name) => TOKENS[name] ?? "",
  };
  const controller = createRasterLayers(site, { scenario: store, deps, mapHandle: opts.mapHandle, onStatusChange: opts.onStatusChange });
  open.push(controller);
  return { controller, store, decode, encoded };
}

const sourceOf = <T>(c: RasterLayersController, id: string): T => c.getLayer(id)!.layer.getSource() as unknown as T;

async function loadTile(source: DataTile, z: number, x: number, y: number): Promise<NonNullable<ReturnType<DataTile["getTile"]>>> {
  const projection = source.getProjection()!;
  const tile = source.getTile(z, x, y, 1, projection)!;
  tile.load();
  await vi.waitFor(() => expect([2, 3]).toContain(tile.getState())); // LOADED = 2, ERROR = 3
  return tile;
}

describe("createRasterLayers: one tile layer per raster_tiles manifest layer (FR-01, FR-02)", () => {
  it("builds the mock site's slope and elevation layers and skips vector layers", () => {
    const { controller } = build();
    expect([...controller.layers.keys()].sort()).toEqual(["elevation", "slope"]);
    expect(controller.olLayers()).toHaveLength(2);
  });

  it("starts visible or hidden by default_visible, with opacity 1", () => {
    const manifest = mockManifest();
    manifest.layers = manifest.layers.map((l) => (l.layer_id === "elevation" ? { ...l, default_visible: true } : l));
    const { controller } = build(loadedSiteFrom(manifest));
    expect(controller.getLayer("elevation")!.isVisible()).toBe(true);
    expect(controller.getLayer("slope")!.isVisible()).toBe(false);
    expect(controller.getLayer("slope")!.getOpacity()).toBe(1);
  });

  it("show/hide and opacity act on the OpenLayers layer", () => {
    const { controller } = build();
    const slope = controller.getLayer("slope")!;
    slope.setVisible(true);
    slope.setOpacity(0.4);
    expect(slope.layer.getVisible()).toBe(true);
    expect(slope.layer.getOpacity()).toBe(0.4);
    expect(slope.isVisible()).toBe(true);
    expect(slope.getOpacity()).toBe(0.4);
  });

  it("uses the Mars projection and a TileGrid from the manifest limited to the AOI extent, never EPSG:3857", () => {
    const site = loadedSiteFrom(mockManifest());
    const { controller } = build(site);
    for (const id of ["slope", "elevation"]) {
      const source = sourceOf<XYZ>(controller, id);
      const spec = site.layers.get(id)!.tile_grid!;
      expect(source.getProjection()!.getCode()).toBe(getMarsProjectionCode(site.site));
      const grid = source.getTileGrid()!;
      expect(grid.getOrigin(0)).toEqual(spec.origin_m);
      expect(grid.getResolutions()).toEqual(spec.resolutions_m);
      expect(grid.getTileSize(0)).toBe(spec.tile_size_px);
      expect(grid.getExtent()).toEqual(site.site.aoi.extent_m);
    }
  });

  it("resolves tile URLs from Layer.asset_id to Asset.url, {y} counted southward (C9 §3.1), same origin, no crossOrigin", () => {
    const { controller } = build();
    const source = sourceOf<XYZ>(controller, "elevation");
    const url = source.getTileUrlFunction()([3, 2, 1], 1, source.getProjection()!);
    expect(url).toBe("sites/mock_site/tiles/elevation/3/2/1.png");
    expect(url).not.toMatch(/^[a-z]+:\/\//);
    expect((source as unknown as { crossOrigin?: string | null }).crossOrigin ?? null).toBeNull();
  });

  it("follows the asset path, not the layer id, when they differ", () => {
    const manifest = mockManifest();
    manifest.assets = manifest.assets.map((a) => (a.asset_id === "tiles-elevation" ? { ...a, path: "tiles/dem_v2" } : a));
    const { controller } = build(loadedSiteFrom(manifest));
    const source = sourceOf<XYZ>(controller, "elevation");
    expect(source.getTileUrlFunction()([0, 0, 0], 1, source.getProjection()!)).toBe("sites/mock_site/tiles/dem_v2/0/0/0.png");
  });

  it("stacks basemap < hillshade < scientific overlay < hazards (FR-02) through the C10 slots", () => {
    const layer = (over: Partial<Layer>): Layer => ({ ...mockManifest().layers[0], ...over });
    expect(zIndexOf(layer({ layer_id: "ortho", category: "optical" }))).toBe(LAYER_Z_INDEX.BASEMAP);
    expect(zIndexOf(layer({ layer_id: "hillshade", category: "topographic" }))).toBe(LAYER_Z_INDEX.HILLSHADE);
    expect(zIndexOf(layer({ layer_id: "slope", category: "topographic" }))).toBe(LAYER_Z_INDEX.SCIENTIFIC_OVERLAY);
    expect(zIndexOf(layer({ layer_id: "ti", category: "thermal" }))).toBe(LAYER_Z_INDEX.SCIENTIFIC_OVERLAY);
    expect(zIndexOf(layer({ layer_id: "comm_hab", category: "hazard" }))).toBe(LAYER_Z_INDEX.HAZARDS);
    expect(LAYER_Z_INDEX.BASEMAP).toBeLessThan(LAYER_Z_INDEX.HILLSHADE);
    expect(LAYER_Z_INDEX.HILLSHADE).toBeLessThan(LAYER_Z_INDEX.SCIENTIFIC_OVERLAY);
    expect(LAYER_Z_INDEX.SCIENTIFIC_OVERLAY).toBeLessThan(LAYER_Z_INDEX.HAZARDS);

    const { controller } = build();
    expect(controller.getLayer("slope")!.layer.getZIndex()).toBe(LAYER_Z_INDEX.SCIENTIFIC_OVERLAY);
  });
});

describe("attributions from source_ids (NFR-07)", () => {
  it("credits every layer's DataSources from the manifest", () => {
    const site = loadedSiteFrom(mockManifest());
    const { controller } = build(site);
    for (const id of ["slope", "elevation"]) {
      const attributions = sourceOf<XYZ>(controller, id).getAttributions()!({} as never);
      const expected = site.layers.get(id)!.source_ids.map((sid) => attributionOf(site.sources.get(sid)!));
      expect(attributions).toEqual(expected);
    }
    const dem = site.sources.get("usgs-gale-dem-1m-v3")!;
    expect(attributionOf(dem)).toContain(dem.title);
    expect(attributionOf(dem)).toContain(dem.credit);
    expect(attributionOf(dem)).toContain(dem.authors!);
  });
});

describe("slope classes follow the scenario's limits (01 §E.1 step 6; FD-076)", () => {
  const legend = mockManifest().layers.find((l) => l.layer_id === "slope")!.legend as ClassesLegend;

  it("slope classes follow scenario limits: the only edges are the scenario's caution and hard limits, kept ascending", () => {
    expect(slopeBands({ cautionDeg: 10, hardDeg: 15 })).toEqual({ cautionDeg: 10, hardDeg: 15 });
    expect(slopeBands({ cautionDeg: 8, hardDeg: 12 })).toEqual({ cautionDeg: 8, hardDeg: 12 });
    // a hard limit below the caution limit cannot make the classes overlap
    expect(slopeBands({ cautionDeg: 20, hardDeg: 10 })).toEqual({ cautionDeg: 20, hardDeg: 20 });
  });

  it("classifySlopeTile: transparent below the caution limit and at no data; caution and over-limit take their 04 §C.1 colour and opacity", () => {
    const bands = slopeBands({ cautionDeg: 10, hardDeg: 15 });
    const out = classifySlopeTile(slopeTile([0, 7, 12, 255]), bands, PALETTE);
    expect(pixel(out, 0)[3]).toBe(0); // 0°
    expect(pixel(out, 1)[3]).toBe(0); // 7° < caution: no 5° edge any more
    expect(pixel(out, 2)).toEqual([0xf5, 0xa5, 0x24, Math.round(0.55 * 255)]); // caution..hard
    expect(pixel(out, 3)[3]).toBe(0); // 255 = no data
  });

  it("classifySlopeTile: alpha 0 in the data tile is no data, whatever the value", () => {
    const tile = slopeTile([20]);
    tile.data[3] = 0;
    expect(pixel(classifySlopeTile(tile, slopeBands({ cautionDeg: 10, hardDeg: 15 }), PALETTE), 0)[3]).toBe(0);
  });

  it("over-limit pixels are hatched, with no 25° edge: 20° and 60° look alike, stripe pixels opaque, the rest at the class opacity", () => {
    const bands = slopeBands({ cautionDeg: 10, hardDeg: 15 });
    const over = classifySlopeTile(slopeTile(new Array(8).fill(20)), bands, PALETTE);
    const alphas = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => pixel(over, i)[3]);
    expect(alphas.filter((a) => a === 255)).toHaveLength(4); // 4 px stripe in 8 px
    expect(alphas.filter((a) => a === Math.round(0.65 * 255))).toHaveLength(4);
    expect(pixel(over, 0).slice(0, 3)).toEqual([0xe4, 0x57, 0x2e]);
    const steeper = classifySlopeTile(slopeTile(new Array(8).fill(60)), bands, PALETTE);
    expect([...steeper.data]).toEqual([...over.data]);
  });

  it("the same pixel changes class when the hard limit changes: 12° is caution at 15° and over-limit at 12°", () => {
    const tile = slopeTile([12]);
    const at15 = classifySlopeTile(tile, slopeBands({ cautionDeg: 10, hardDeg: 15 }), PALETTE);
    const at12 = classifySlopeTile(tile, slopeBands({ cautionDeg: 10, hardDeg: 12 }), PALETTE);
    expect(pixel(at15, 0).slice(0, 3)).toEqual([0xf5, 0xa5, 0x24]);
    expect(pixel(at12, 0).slice(0, 3)).toEqual([0xe4, 0x57, 0x2e]);
  });

  it("reads the limits from the scenario, not constants: a tile is coloured with caution 8 and hard 12", async () => {
    const { controller, encoded } = build(undefined, { limits: [8, 12] });
    expect(controller.getSlopeLimits()).toEqual({ cautionDeg: 8, hardDeg: 12 });
    await loadTile(sourceOf<DataTile>(controller, "slope"), 4, 0, 0);
    // decoded tile [0, 7, 12, 20, 30, 255] degrees
    const out = encoded.at(-1)!;
    expect(pixel(out, 1)[3]).toBe(0); // 7° < caution 8
    expect(pixel(out, 2).slice(0, 3)).toEqual([0xe4, 0x57, 0x2e]); // 12° = hard: over limit
  });

  it("re-colours without fetching again when the scenario's hard limit changes 15° -> 12°", async () => {
    const { controller, store, decode, encoded } = build(undefined, { limits: [10, 15] });
    const source = sourceOf<DataTile>(controller, "slope");
    await loadTile(source, 4, 0, 0);
    expect(pixel(encoded.at(-1)!, 2).slice(0, 3)).toEqual([0xf5, 0xa5, 0x24]); // 12° caution at 15°
    expect(decode).toHaveBeenCalledTimes(1);

    store.set({ hard_slope_limit_deg: 12 });
    expect(controller.getSlopeLimits()).toEqual({ cautionDeg: 10, hardDeg: 12 });
    await loadTile(source, 4, 0, 0);
    expect(pixel(encoded.at(-1)!, 2).slice(0, 3)).toEqual([0xe4, 0x57, 0x2e]); // now over limit
    expect(decode).toHaveBeenCalledTimes(1); // the raw tile was kept
  });

  it("setSlopeLimits sets them directly; an unchanged value does not redraw", () => {
    const { controller } = build();
    const refresh = vi.spyOn(sourceOf<DataTile>(controller, "slope"), "refresh");
    controller.setSlopeLimits(10, 15);
    expect(refresh).not.toHaveBeenCalled();
    controller.setSlopeLimits(9, 14);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(controller.getSlopeLimits()).toEqual({ cautionDeg: 9, hardDeg: 14 });
  });

  it("requests the tile under the asset's url", async () => {
    const { controller, decode } = build();
    await loadTile(sourceOf<DataTile>(controller, "slope"), 4, 3, 2);
    expect(decode).toHaveBeenCalledWith("sites/mock_site/tiles/slope/4/3/2.png");
  });

  it("slopeLegend: the manifest's class labels over the scenario's edges, never a fixed 5° or 25°", () => {
    expect(slopeLegend(legend, { cautionDeg: 10, hardDeg: 15 })).toEqual([
      { key: "caution", label: "caution", fromDeg: 10, toDeg: 15 },
      { key: "over_limit", label: "over limit", fromDeg: 15, toDeg: null },
    ]);
    expect(slopeLegend(legend, { cautionDeg: 8, hardDeg: 12 }).map((c) => [c.fromDeg, c.toDeg])).toEqual([[8, 12], [12, null]]);
    expect(() => slopeLegend({ type: "classes", classes: [[0, 5, "flat"]] }, { cautionDeg: 10, hardDeg: 15 })).toThrow(/5 classes/);
  });
});

describe("palette from design tokens (FD-065)", () => {
  it("parses hex colours and reads colours and opacities from tokens", () => {
    expect(parseHexColour("#FDE7A9")).toEqual([0xfd, 0xe7, 0xa9]);
    expect(parseHexColour("#fa0")).toEqual([0xff, 0xaa, 0x00]);
    expect(() => parseHexColour("orange")).toThrow(/hex colour/);
    expect(PALETTE.overLimit).toEqual({ rgb: [0xe4, 0x57, 0x2e], opacity: 0.65 });
    expect(PALETTE.caution).toEqual({ rgb: [0xf5, 0xa5, 0x24], opacity: 0.55 });
  });

  it("names a missing or bad token instead of falling back to a hard-coded colour", () => {
    expect(() => readSlopePalette((n) => (n === "--slope-15-25" ? "" : TOKENS[n]))).toThrow("--slope-15-25");
    expect(() => readSlopePalette((n) => (n === "--slope-opacity-10-15" ? "55%" : TOKENS[n]))).toThrow("--slope-opacity-10-15");
  });

  it("validates the tokens once, at layer creation: a missing token throws from createRasterLayers, not from a tile load", () => {
    const site = loadedSiteFrom(mockManifest());
    registerMarsProjection(site.site);
    const readToken = (name: string): string => (name === "--slope-opacity-15-25" ? "" : TOKENS[name] ?? "");
    expect(() => createRasterLayers(site, { scenario: scenarioStore(10, 15), deps: { readToken } })).toThrow("--slope-opacity-15-25");
  });
});

describe("the ortho basemap is grayscale in OPS only (FD-003)", () => {
  it("an optical layer carries the marswalk-ortho class (CSS filters it in OPS); a scientific layer does not", () => {
    const manifest = mockManifest();
    manifest.layers = manifest.layers.map((l) => (l.layer_id === "elevation" ? { ...l, category: "optical" as const } : l));
    const { controller } = build(loadedSiteFrom(manifest));
    expect(controller.getLayer("elevation")!.layer.getClassName()).toContain("marswalk-ortho");
    expect(controller.getLayer("slope")!.layer.getClassName()).not.toContain("marswalk-ortho");
  });
});

describe("per-layer state and failures (FR-16, 05 §E.6)", () => {
  it("a layer whose asset is missing is unavailable and requests nothing; the other layer is unaffected", () => {
    const manifest = mockManifest();
    manifest.assets = manifest.assets.filter((a) => a.asset_id !== "tiles-slope");
    const seen: string[] = [];
    const { controller, decode } = build(loadedSiteFrom(manifest), { onStatusChange: (id, s) => seen.push(`${id}:${s}`) });
    expect(controller.getLayer("slope")!.getStatus()).toBe("unavailable");
    expect(controller.getLayer("elevation")!.getStatus()).toBe("ready");
    const source = sourceOf<XYZ>(controller, "slope");
    expect(source.getTileUrlFunction()([0, 0, 0], 1, source.getProjection()!)).toBeUndefined();
    expect(decode).not.toHaveBeenCalled();
    expect(seen).toEqual([]); // set at creation, nothing to report afterwards
  });

  it("an asset that is not a tile set is unavailable", () => {
    const manifest = mockManifest();
    manifest.assets = manifest.assets.map((a) => (a.asset_id === "tiles-elevation" ? { ...a, format: "png" as const } : a));
    expect(build(loadedSiteFrom(manifest)).controller.getLayer("elevation")!.getStatus()).toBe("unavailable");
  });

  it("loading while tiles are in flight, then ready; reported through onStatusChange", async () => {
    const seen: string[] = [];
    let release: (t: DecodedTile) => void = () => {};
    const { controller } = build(undefined, {
      decode: () => new Promise<DecodedTile>((resolve) => (release = resolve)),
      onStatusChange: (id, s) => seen.push(`${id}:${s}`),
    });
    const source = sourceOf<DataTile>(controller, "slope");
    const tile = source.getTile(4, 0, 0, 1, source.getProjection()!)!;
    tile.load();
    expect(controller.getLayer("slope")!.getStatus()).toBe("loading");
    release(slopeTile([20]));
    await vi.waitFor(() => expect(controller.getLayer("slope")!.getStatus()).toBe("ready"));
    expect(seen).toEqual(["slope:loading", "slope:ready"]);
  });

  it("one failed tile does not take the layer down: it stays ready, counts the failure, and other tiles still load", async () => {
    const { controller, encoded } = build(undefined, {
      decode: async (url) => {
        if (url.endsWith("/4/1/1.png")) throw new Error("HTTP 404");
        return slopeTile([20]);
      },
    });
    const source = sourceOf<DataTile>(controller, "slope");
    await loadTile(source, 4, 0, 0);
    await loadTile(source, 4, 1, 1);
    await loadTile(source, 4, 2, 0);
    const slope = controller.getLayer("slope")!;
    expect(slope.getStatus()).toBe("ready");
    expect(slope.failedTiles()).toBe(1);
    expect(encoded).toHaveLength(2);
  });

  it("is unavailable when every tile tried has failed, and recovers when one loads", async () => {
    let fail = true;
    const { controller } = build(undefined, {
      decode: async () => {
        if (fail) throw new Error("HTTP 404");
        return slopeTile([20]);
      },
    });
    const source = sourceOf<DataTile>(controller, "slope");
    await loadTile(source, 4, 0, 0);
    expect(controller.getLayer("slope")!.getStatus()).toBe("unavailable");
    fail = false;
    await loadTile(source, 4, 1, 0);
    expect(controller.getLayer("slope")!.getStatus()).toBe("ready");
  });

  it("a failed tile is requested again, not cached as a failure", async () => {
    let fail = true;
    const { controller, decode } = build(undefined, {
      decode: async () => {
        if (fail) throw new Error("HTTP 404");
        return slopeTile([20]);
      },
    });
    const source = sourceOf<DataTile>(controller, "slope");
    await loadTile(source, 4, 0, 0);
    fail = false;
    source.refresh();
    await loadTile(source, 4, 0, 0);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(controller.getLayer("slope")!.getStatus()).toBe("ready");
  });

  it("an image layer (elevation) counts tile errors the same way", () => {
    const { controller } = build();
    const source = sourceOf<XYZ>(controller, "elevation");
    const elevation = controller.getLayer("elevation")!;
    source.dispatchEvent({ type: "tileloadstart" } as never);
    source.dispatchEvent({ type: "tileloaderror" } as never);
    expect(elevation.getStatus()).toBe("unavailable");
    expect(elevation.failedTiles()).toBe(1);
    source.dispatchEvent({ type: "tileloadstart" } as never);
    source.dispatchEvent({ type: "tileloadend" } as never);
    expect(elevation.getStatus()).toBe("ready");
  });

  it("is out_of_range when the view is coarser than the coarsest tile level, and back when zoomed in", () => {
    let resolution = 64;
    const listeners = new Set<(v: MapView) => void>();
    const mapHandle = {
      getResolution: () => resolution,
      onViewChange: (fn: (v: MapView) => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
    const { controller } = build(undefined, { mapHandle });
    const slope = controller.getLayer("slope")!;
    expect(slope.getStatus()).toBe("out_of_range"); // coarsest level is 32 m/px
    resolution = 16;
    listeners.forEach((fn) => fn({ center_x_m: 0, center_y_m: 0, resolution_m_per_px: 16 }));
    expect(slope.getStatus()).toBe("ready");
    expect(controller.getLayer("elevation")!.getStatus()).toBe("ready");
  });

  it("destroy releases the scenario and view subscriptions and the layers", () => {
    const listeners = new Set<(v: MapView) => void>();
    const mapHandle = {
      getResolution: () => 4,
      onViewChange: (fn: (v: MapView) => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
    const { controller, store } = build(undefined, { mapHandle });
    expect(store.listenerCount()).toBe(1);
    expect(listeners.size).toBe(2);
    controller.destroy();
    expect(store.listenerCount()).toBe(0);
    expect(listeners.size).toBe(0);
    expect(controller.layers.size).toBe(0);
    expect(() => controller.destroy()).not.toThrow();
  });
});

describe("web CRS guard", () => {
  it("builds on a manifest whose site id is not mock_site without touching an Earth projection", () => {
    const manifest: Site = { ...mockManifest(), site_id: "other_site" };
    const { controller } = build(loadedSiteFrom(manifest));
    expect((controller.getLayer("slope")!.layer as TileLayer).getSource()!.getProjection()!.getCode()).toBe("MARS_LOCAL:other_site");
  });
});
