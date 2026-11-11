/**
 * Shared fixtures for the map module tests: the F4 mock site exactly as the pipeline wrote it, as a `LoadedSite`
 * (the same lookup maps `loadSite` builds), plus a jsdom host element with a layout size, a recording
 * `ResizeObserver` stub, and a `matchMedia` stub. OpenLayers itself is real in these tests; only the browser
 * layout that jsdom lacks is stubbed.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DataSource, Layer, POIFeature, Site } from "@marswalk/protocol";
import type { LoadedAsset, LoadedSite } from "../../../src/ui/context";

const SITE_DIR = resolve(__dirname, "../../../../../data/sites/mock_site");
const readJson = <T>(relative: string): T => JSON.parse(readFileSync(join(SITE_DIR, relative), "utf8")) as T;

/** The mock site's manifest as the pipeline wrote it (the file the app fetches). */
export function mockManifest(): Site {
  return readJson<Site>("site-manifest.json");
}

/** Build a `LoadedSite` from a manifest and POI features, with the maps and `url`s `loadSite` builds. */
export function loadedSiteFrom(site: Site, poiFeatures: POIFeature[] = []): LoadedSite {
  return {
    site,
    layers: new Map<string, Layer>(site.layers.map((l) => [l.layer_id, l])),
    sources: new Map<string, DataSource>(site.sources.map((s) => [s.source_id, s])),
    assets: new Map<string, LoadedAsset>(
      site.assets.map((a) => [a.asset_id, { ...a, url: `sites/${site.site_id}/${a.path}` }]),
    ),
    pois: new Map<string, POIFeature>(poiFeatures.map((f) => [f.properties.poi_id, f])),
  };
}

export function mockLoadedSite(): LoadedSite {
  const pois = readJson<{ features: POIFeature[] }>("vectors/pois.geojson").features;
  return loadedSiteFrom(mockManifest(), pois);
}

/** The traverse GeoJSON feature collection of the mock site. */
export function mockTraverseGeoJson(): { type: "FeatureCollection"; features: unknown[] } {
  return readJson("vectors/traverse.geojson");
}

/** jsdom has no layout: give an element a size so OpenLayers can compute the map size. */
export function sizedHost(width = 800, height = 600): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "offsetWidth", { value: width, configurable: true });
  Object.defineProperty(el, "offsetHeight", { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

/** OpenLayers observes its target with ResizeObserver, which jsdom lacks. */
export function stubResizeObserver(): void {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

/** `window.matchMedia` answering `matches` for every query (jsdom has none). Returns a restore function. */
export function stubReducedMotion(matches: boolean): () => void {
  const win = window as unknown as { matchMedia?: unknown };
  const before = win.matchMedia;
  win.matchMedia = (query: string) => ({ matches, media: query, addEventListener() {}, removeEventListener() {} });
  return () => {
    win.matchMedia = before;
  };
}
