/**
 * T07.10 — Curiosity traverse layer (FR-17, 02 §E.1, 04 §C.5, 05 §C TraversePoint; FR-15).
 * Real OpenLayers and the mock site's own traverse GeoJSON.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Layer } from "@marswalk/protocol";
import {
  createTraverseLayer,
  traverseInfoElement,
  type TraverseGeoJson,
  type TraverseLayerController,
  type TraversePointInfo,
} from "../../src/ui/map/traverseLayer";
import { LAYER_Z_INDEX, type LoadedSite } from "../../src/ui/context";
import { installDom, removeDom } from "./domHarness";
import { loadedSiteFrom, mockManifest, mockTraverseGeoJson } from "./map/mapFixtures";

beforeAll(() => installDom());
afterAll(() => removeDom());

const TOKENS: Record<string, string> = {
  "--traverse": "#E8EDF2",
  "--void": "#0B0D10",
  "--text-1": "#ECEFF2",
  "--font-mono": '"IBM Plex Mono", ui-monospace, monospace',
  "--text-micro": "12px",
};
const readToken = (name: string): string => TOKENS[name] ?? "";

const SITE = loadedSiteFrom(mockManifest());
const GEOJSON = mockTraverseGeoJson() as unknown as TraverseGeoJson;

const made: TraverseLayerController[] = [];
afterEach(() => made.splice(0).forEach((c) => c.destroy()));
/** `null` = no document, so the layer fetches the asset (an `undefined` argument would take the default). */
function make(site: LoadedSite = SITE, geojson: TraverseGeoJson | null = GEOJSON, extra: Record<string, unknown> = {}): TraverseLayerController {
  const controller = createTraverseLayer(site, { geojson: geojson ?? undefined, readToken, ...extra });
  made.push(controller);
  return controller;
}

const point = (props: Record<string, unknown>, coordinates: unknown = [10, 20]) =>
  ({ type: "Feature", geometry: { type: "Point", coordinates }, properties: props }) as unknown as TraverseGeoJson["features"][number];
const collection = (...features: TraverseGeoJson["features"]): TraverseGeoJson => ({ type: "FeatureCollection", features });
const GOOD = { sol: 4450, source_id: "usgs-gale-dem-1m-v3", provenance: "assumed" };

describe("createTraverseLayer: the mock site's traverse", () => {
  it("draws the three points and the line in projected metres at the C10 traverse slot", () => {
    const c = make();
    expect(c.getPointFeatures()).toHaveLength(3);
    expect(c.layer.getZIndex()).toBe(LAYER_Z_INDEX.TRAVERSE);
    const sources = c.layer.getSource()!.getFeatures();
    expect(sources).toHaveLength(4);
    expect(c.getPointFeatures()[0].getGeometry()!.getCoordinates()).toEqual([-1800, -1500]);
    expect(c.skipped()).toEqual([]);
    expect(c.getStatus()).toBe("ready");
  });

  it("show/hide and opacity act on the layer, with the same names as the raster layers", () => {
    const c = make();
    c.setVisible(false);
    c.setOpacity(0.3);
    expect(c.isVisible()).toBe(false);
    expect(c.getOpacity()).toBe(0.3);
    expect(c.layer.getVisible()).toBe(false);
  });
});

describe("invalid points are skipped, never given a fallback source or sol 0 (05 §C TraversePoint)", () => {
  it("skips a point with no sol, a non-numeric sol, no source_id, an unknown source_id or bad coordinates", () => {
    const c = make(
      SITE,
      collection(
        point({ source_id: GOOD.source_id }), // no sol
        point({ sol: "4450", source_id: GOOD.source_id }), // sol is a string
        point({ sol: Number.NaN, source_id: GOOD.source_id }),
        point({ sol: 4450 }), // no source_id
        point({ sol: 4450, source_id: "not-in-manifest" }), // FK does not resolve
        point(GOOD, [Number.NaN, 1]),
        point(GOOD, "oops"),
        point(GOOD, [5, 6]), // the one good point
      ),
    );
    expect(c.getPointFeatures()).toHaveLength(1);
    const skipped = c.skipped();
    expect(skipped).toHaveLength(7);
    expect(skipped.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(skipped[0].reason).toMatch(/sol/);
    expect(skipped[3].reason).toMatch(/source_id/);
    expect(skipped[4].reason).toMatch(/not-in-manifest/);
    expect(skipped[5].reason).toMatch(/coordinates/);
    expect(c.getPointInfoAt([5, 6])!.point.sol).toBe(4450);
    expect(c.getPointInfoAt([0, 0], 1)).toBeNull(); // no invented sol 0 point
  });

  it("a layer with no valid point reports them all skipped and still works", () => {
    const c = make(SITE, collection(point({})));
    expect(c.getPointFeatures()).toEqual([]);
    expect(c.skipped()).toHaveLength(1);
    expect(c.selectPointAt([0, 0])).toBeNull();
  });

  it("skips a line with fewer than two finite vertices", () => {
    const line = { type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0]] }, properties: {} } as unknown as TraverseGeoJson["features"][number];
    const c = make(SITE, collection(line));
    expect(c.layer.getSource()!.getFeatures()).toHaveLength(0);
    expect(c.skipped()[0].reason).toMatch(/vertices/);
  });
});

describe("a point's info: protocol TraversePoint and provenance from the manifest Layer (FR-15, FR-17)", () => {
  const withLayer = (provenance: Layer["provenance"]): LoadedSite => {
    const manifest = mockManifest();
    const base = manifest.layers[0];
    manifest.layers = [
      ...manifest.layers,
      { ...base, layer_id: "traverse", title: "Curiosity traverse", category: "mission", kind: "vector", provenance, asset_id: manifest.traverse_asset, tile_grid: undefined },
    ];
    return loadedSiteFrom(manifest);
  };

  it("carries the TraversePoint fields and takes the provenance of the manifest layer that owns the traverse asset", () => {
    const c = make(
      withLayer("measured"),
      collection(point({ sol: 4450, source_id: GOOD.source_id, site_drive: "2000_1240", lat: -4.7, lon_e: 137.38, elevation_m: -4400, provenance: "assumed" }, [-1800, -1500])),
    );
    const info = c.getPointInfoAt([-1800, -1500])!;
    expect(info.point).toEqual({ sol: 4450, source_id: GOOD.source_id, site_drive: "2000_1240", lat: -4.7, lon_e: 137.38, elevation_m: -4400 });
    expect(info.coordinates).toEqual([-1800, -1500]);
    expect(info.provenance).toBe("measured"); // the Layer's, not the feature's "assumed"
  });

  it("follows the layer when it says assumed (synthetic fixture), not a hard-coded measured", () => {
    const c = make(withLayer("assumed"));
    expect(c.getPointInfoAt([-1800, -1500])!.provenance).toBe("assumed");
  });

  it("without a manifest layer for the asset, uses the feature's own class when it is one of the six", () => {
    expect(make().getPointInfoAt([-1800, -1500])!.provenance).toBe("assumed"); // mock features say assumed
  });

  it("a point whose class cannot be known (no manifest layer, no valid feature class) is skipped: nothing is shown unlabelled", () => {
    const c = make(SITE, collection(point({ sol: 1, source_id: GOOD.source_id, provenance: "measuredd" }), point({ sol: 2, source_id: GOOD.source_id })));
    expect(c.getPointFeatures()).toHaveLength(0);
    expect(c.skipped().map((s) => s.reason)).toEqual([expect.stringMatching(/provenance/), expect.stringMatching(/provenance/)]);
  });

  it("does not invent fields: absent optional values stay absent", () => {
    const c = make(SITE, collection(point(GOOD)));
    expect(Object.keys(c.getPointInfoAt([10, 20])!.point).sort()).toEqual(["sol", "source_id"]);
  });
});

describe("hover shows the sol label (04 §C.5)", () => {
  const styleOf = (c: TraverseLayerController, index: number) => {
    const feature = c.getPointFeatures()[index];
    const fn = c.layer.getStyleFunction()!;
    const style = fn(feature, 1);
    return Array.isArray(style) ? style[0] : (style as import("ol/style/Style.js").default);
  };

  it("labels no point until one is hovered, then only that one", () => {
    const c = make();
    expect(styleOf(c, 0).getText()).toBeNull();
    c.setHover([410, 325]);
    expect(styleOf(c, 2).getText()!.getText()).toBe("Sol 4750");
    expect(styleOf(c, 0).getText()).toBeNull();
    c.setHover(null);
    expect(styleOf(c, 2).getText()).toBeNull();
  });

  it("hover outside the tolerance labels nothing; getHoverLabel reports the label", () => {
    const c = make();
    c.setHover([0, 0]);
    expect(c.getHoverLabel([0, 0])).toBeNull();
    expect(c.getHoverLabel([-695, -587.5])).toBe("Sol 4611");
  });

  it("label text is the 12 px token size in the mono token font", () => {
    const c = make();
    c.setHover([410, 325]);
    const text = styleOf(c, 2).getText()!;
    expect(text.getFont()).toBe(`12px ${TOKENS["--font-mono"]}`);
  });
});

describe("styling from tokens (04 §C.1, §C.5)", () => {
  it("draws the line thin, dashed, in --traverse at 60 %", () => {
    const c = make();
    const line = c.layer.getSource()!.getFeatures().find((f) => f.getGeometry()!.getType() === "LineString")!;
    const style = c.layer.getStyleFunction()!(line, 1) as import("ol/style/Style.js").default;
    const stroke = style.getStroke()!;
    expect(stroke.getColor()).toBe("rgba(232, 237, 242, 0.6)");
    expect(stroke.getLineDash()).toEqual([6, 6]);
    expect(stroke.getWidth()).toBeLessThanOrEqual(2);
  });

  it("fails naming a token that is missing instead of falling back to a hex colour", () => {
    expect(() => make(SITE, GEOJSON, { readToken: (n: string) => (n === "--traverse" ? "" : TOKENS[n]) })).toThrow("--traverse");
  });

  it("the module has no hard-coded colour", () => {
    const source = readFileSync(resolve(__dirname, "../../src/ui/map/traverseLayer.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(\s*\d/);
    expect(source).not.toMatch(/innerHTML/);
  });
});

describe("selection and the map events", () => {
  it("selectPointAt reports the point's info, or null on an empty click", () => {
    const onSelectPoint = vi.fn<(info: TraversePointInfo | null) => void>();
    const c = make(SITE, GEOJSON, { onSelectPoint });
    const hit = c.selectPointAt([-695, -587.5], 5)!;
    expect(hit.point.sol).toBe(4611);
    expect(hit.point.source_id).toBe("usgs-gale-dem-1m-v3");
    expect(c.selectPointAt([1000, 1000], 5)).toBeNull();
    expect(onSelectPoint.mock.calls.map(([i]) => i?.point.sol ?? null)).toEqual([4611, null]);
  });

  function fakeMap(resolution = 2) {
    const listeners = new Map<string, Set<(e: { coordinate: number[] }) => void>>();
    const map = {
      on: (type: string, fn: (e: { coordinate: number[] }) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      un: (type: string, fn: (e: { coordinate: number[] }) => void) => listeners.get(type)?.delete(fn),
    };
    const emit = (type: string, coordinate: number[]) => listeners.get(type)?.forEach((fn) => fn({ coordinate }));
    return { handle: { getMap: () => map, getResolution: () => resolution }, listeners, emit };
  }

  it("attach: pointermove hovers and singleclick selects, with a pixel tolerance times the resolution", () => {
    const onSelectPoint = vi.fn();
    const c = make(SITE, GEOJSON, { onSelectPoint });
    const { handle, emit, listeners } = fakeMap(2);
    const detach = c.attach(handle as never);
    expect(listeners.get("pointermove")!.size).toBe(1);

    emit("pointermove", [-695 + 15, -587.5]); // 15 m away = 7.5 px at 2 m/px: inside 10 px
    expect(c.getHoverLabel([-695, -587.5])).toBe("Sol 4611");
    const hovered = c.layer.getStyleFunction()!(c.getPointFeatures()[1], 1) as import("ol/style/Style.js").default;
    expect(hovered.getText()!.getText()).toBe("Sol 4611");

    emit("pointermove", [-695 + 40, -587.5]); // 20 px away: outside
    const away = c.layer.getStyleFunction()!(c.getPointFeatures()[1], 1) as import("ol/style/Style.js").default;
    expect(away.getText()).toBeNull();

    emit("singleclick", [410, 325]);
    expect(onSelectPoint).toHaveBeenLastCalledWith(expect.objectContaining({ point: expect.objectContaining({ sol: 4750 }) }));

    detach();
    expect(listeners.get("pointermove")!.size).toBe(0);
    expect(listeners.get("singleclick")!.size).toBe(0);
  });

  it("destroy detaches from the map and empties the layer", () => {
    const c = make();
    const source = c.layer.getSource()!;
    const { handle, listeners } = fakeMap();
    c.attach(handle as never);
    c.destroy();
    expect(listeners.get("pointermove")!.size).toBe(0);
    expect(source.getFeatures()).toHaveLength(0);
    expect(() => c.destroy()).not.toThrow();
  });
});

describe("loading the traverse asset (FR-16)", () => {
  it("fetches the manifest's traverse asset when no GeoJSON is given, and becomes ready", async () => {
    const fetchJson = vi.fn(async (url: string) => {
      void url;
      return GEOJSON;
    });
    const c = make(SITE, null, { fetchJson });
    expect(c.getStatus()).toBe("loading");
    await c.ready();
    expect(fetchJson).toHaveBeenCalledWith("sites/mock_site/vectors/traverse.geojson");
    expect(c.getStatus()).toBe("ready");
    expect(c.getPointFeatures()).toHaveLength(3);
  });

  it("a null feature or a feature with null geometry (valid GeoJSON) is skipped; ready() never rejects (review 12 Nov)", async () => {
    const doc = { type: "FeatureCollection", features: [null, { type: "Feature", geometry: null, properties: GOOD }, point(GOOD)] };
    const c = make(SITE, null, { fetchJson: async () => doc });
    await expect(c.ready()).resolves.toBeUndefined();
    expect(c.getStatus()).toBe("ready");
    expect(c.getPointFeatures()).toHaveLength(1);
    expect(c.skipped()).toHaveLength(2);
  });

  it("a throw while drawing makes the layer unavailable instead of rejecting ready()", async () => {
    const doc = { type: "FeatureCollection", features: [{ type: "Feature", get geometry(): never { throw new Error("boom"); }, properties: GOOD }] };
    const c = make(SITE, null, { fetchJson: async () => doc });
    await expect(c.ready()).resolves.toBeUndefined();
    expect(c.getStatus()).toBe("unavailable");
  });

  it("is unavailable, not thrown, when the fetch fails; and when the asset is missing", async () => {
    const failing = make(SITE, null, { fetchJson: async () => { throw new Error("HTTP 404"); } });
    await failing.ready();
    expect(failing.getStatus()).toBe("unavailable");

    const manifest = mockManifest();
    manifest.assets = manifest.assets.filter((a) => a.asset_id !== manifest.traverse_asset);
    const missing = make(loadedSiteFrom(manifest), null, { fetchJson: vi.fn() });
    await missing.ready();
    expect(missing.getStatus()).toBe("unavailable");
  });

  it("a malformed document is unavailable too", async () => {
    const c = make(SITE, null, { fetchJson: async () => ({ features: "nope" }) });
    await c.ready();
    expect(c.getStatus()).toBe("unavailable");
  });
});

describe("traverseInfoElement: shows the sol and the source with provenance and source id (FR-17, FR-15)", () => {
  it("builds text nodes with data-provenance and data-source on each value", () => {
    const c = make();
    const info = c.getPointInfoAt([410, 325])!;
    const el = traverseInfoElement(info, SITE);
    expect(el.textContent).toContain("Sol 4750");
    expect(el.textContent).toContain(SITE.sources.get(info.point.source_id)!.title);
    for (const row of el.querySelectorAll<HTMLElement>("[data-field]")) {
      expect(row.getAttribute("data-source"), row.dataset.field).toBe(info.point.source_id);
      expect(row.getAttribute("data-provenance"), row.dataset.field).toBe("assumed");
    }
    expect(el.querySelector("[data-field='sol']")).not.toBeNull();
  });

  it("lists the optional fields only when the point has them, each labelled", () => {
    const c = make(SITE, collection(point({ ...GOOD, site_drive: "2000_1240", lat: -4.7, lon_e: 137.38, elevation_m: -4400 })));
    const el = traverseInfoElement(c.getPointInfoAt([10, 20])!, SITE);
    expect([...el.querySelectorAll<HTMLElement>("[data-field]")].map((r) => r.dataset.field)).toEqual(["sol", "source", "site_drive", "position", "elevation"]);
    const plain = traverseInfoElement(make(SITE, collection(point(GOOD))).getPointInfoAt([10, 20])!, SITE);
    expect([...plain.querySelectorAll<HTMLElement>("[data-field]")].map((r) => r.dataset.field)).toEqual(["sol", "source"]);
  });
});
