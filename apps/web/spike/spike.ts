/**
 * T02.03 Spike page: site tiles in the custom Mars projection with a metric scale bar.
 * (02 §B, 01 FR-01, 04 §B; D-03). Throwaway: nothing under src/ imports this, and Vite builds only index.html.
 *
 * Everything comes from the served site bundle: the page fetches `../sites/<site>/site-manifest.json` (relative to
 * /spike/, like loadSite's `sites/<site>/...` relative to the app root; the Hab Core serves data/sites and `make dev`
 * proxies /sites to it), validates it with `parseSiteManifest`, and reads origin, resolutions and tile size from each
 * layer's `tile_grid`. It hard-codes none of them and imports nothing from data/. Panel values carry
 * data-provenance and data-source (FR-15, NFR-05).
 * Site: `?site=<id>` (`^[a-z0-9_]+$`), default `mock_site` (F4).
 * Harness hooks (package 04; read-only measurements for the `tiles-all-levels` and `scale-bar` checks):
 *   `?layer=<layer_id>` shows only that raster layer; `?zoom=<n>` opens at `resolutions_m[n]` (n is the tile z);
 *   `window.__spike` offers `levels()`, `resolution()`, `setZoom(z)`, `setCenter(x_m, y_m)` and `pixelOf(x_m, y_m)`.
 *   Nothing here computes a quantity: the resolution is the view's own value in metres per pixel.
 */
import Map from "ol/Map.js";
import View from "ol/View.js";
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";
import ScaleLine from "ol/control/ScaleLine.js";
import { defaults as defaultControls } from "ol/control/defaults.js";
import type TileGrid from "ol/tilegrid/TileGrid.js";
import type { Provenance, Site } from "@marswalk/protocol";
import { registerMarsProjection, getMarsProjectionCode, createTileGrid } from "../src/ui/map/projection.js";
import { DEFAULT_SITE_ID, SITE_ID_PATTERN, parseSiteManifest } from "../src/boot/loadSite.js";
import { provAttrs } from "../src/ui/components/provenance.js";

interface SpikeHook {
  levels(): number;
  resolution(): number;
  setZoom(z: number): void;
  setCenter(x_m: number, y_m: number): void;
  pixelOf(x_m: number, y_m: number): [number, number] | null;
}

function siteIdFromUrl(): string {
  const requested = new URLSearchParams(window.location.search).get("site") ?? DEFAULT_SITE_ID;
  if (!SITE_ID_PATTERN.test(requested)) throw new Error(`?site= must match ${SITE_ID_PATTERN.source}`);
  return requested;
}

async function loadSiteManifest(siteId: string): Promise<Site> {
  const url = `../sites/${siteId}/site-manifest.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status}. Start the Hab Core (make hab) and the dev server (make dev).`);
  }
  return parseSiteManifest(await res.json());
}

/** Show a panel value with its provenance class and source id (FR-15, NFR-05). */
function setValue(id: string, text: string, prov: Provenance, src: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  for (const [name, value] of Object.entries(provAttrs({ prov, src }))) el.setAttribute(name, value);
}

async function init(): Promise<void> {
  const layerTogglesEl = document.getElementById("layer-toggles");
  const diagnosticsEl = document.getElementById("diagnostics");

  function log(message: string): void {
    if (diagnosticsEl) {
      const line = document.createElement("div");
      line.textContent = message;
      diagnosticsEl.appendChild(line);
      diagnosticsEl.scrollTop = diagnosticsEl.scrollHeight;
    }
  }

  try {
    const siteId = siteIdFromUrl();
    log(`Fetching sites/${siteId}/site-manifest.json ...`);
    const site = await loadSiteManifest(siteId);

    // Manifest values: configuration we chose, so `assumed` (01 provenance classes).
    setValue("site-name", site.name, "assumed", "site-manifest:name");
    setValue("site-crs", `${site.crs.base} (${site.site_id})`, "assumed", "site-manifest:crs.base");

    const proj = registerMarsProjection(site);
    log(`Registered projection code: ${getMarsProjectionCode(site)}`);

    const onlyLayer = new URLSearchParams(window.location.search).get("layer");
    const rasterLayers: TileLayer<XYZ>[] = [];
    const grids: TileGrid[] = [];
    let resolutions: number[] | null = null;

    for (const layer of site.layers) {
      if (layer.kind !== "raster_tiles" || !layer.tile_grid) continue;
      const spec = layer.tile_grid;

      // One view serves all layers, so its resolutions come from the manifest and every layer must agree.
      if (resolutions === null) {
        resolutions = spec.resolutions_m;
      } else if (JSON.stringify(resolutions) !== JSON.stringify(spec.resolutions_m)) {
        log(`ERROR: layer "${layer.layer_id}" has different resolutions_m; the spike shows one view only`);
        continue;
      }

      // The AOI extent keeps OpenLayers from requesting tiles outside the grid (they would be 404s).
      const tileGrid = createTileGrid(spec, site.aoi.extent_m);
      grids.push(tileGrid);
      const tileUrl = `../sites/${site.site_id}/tiles/${layer.layer_id}/{z}/{x}/{y}.${spec.format}`;
      log(`Layer "${layer.title}" -> ${tileUrl}`);

      const source = new XYZ({ projection: proj, tileGrid, url: tileUrl, wrapX: false });
      source.on("tileloaderror", () => log(`Tile load error on layer "${layer.layer_id}"`));
      const tileLayer = new TileLayer({
        source,
        visible: onlyLayer === null ? layer.default_visible : layer.layer_id === onlyLayer,
        properties: { layerId: layer.layer_id, title: layer.title },
      });
      rasterLayers.push(tileLayer);

      if (layerTogglesEl) {
        const item = document.createElement("div");
        item.className = "layer-item";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `toggle-${layer.layer_id}`;
        checkbox.checked = tileLayer.getVisible();
        checkbox.addEventListener("change", () => {
          tileLayer.setVisible(checkbox.checked);
          log(`Layer "${layer.layer_id}" visibility: ${checkbox.checked}`);
        });
        const label = document.createElement("label");
        label.htmlFor = checkbox.id;
        label.textContent = layer.units ? `${layer.title} (${layer.units})` : layer.title;
        item.append(checkbox, label);
        layerTogglesEl.appendChild(item);
      }
    }

    if (resolutions === null || grids.length === 0) {
      throw new Error("the manifest has no raster_tiles layer with a tile_grid");
    }

    // Scale line in metric units at the bottom left (04 §B); point resolution comes from the projection (metres).
    const scaleLineControl = new ScaleLine({ units: "metric", bar: false, text: true, minWidth: 100 });

    const [minX, minY, maxX, maxY] = site.aoi.extent_m;
    const zoomParam = new URLSearchParams(window.location.search).get("zoom");
    const openAt = zoomParam === null ? 0 : Number(zoomParam);
    if (!Number.isInteger(openAt) || openAt < 0 || openAt >= resolutions.length) {
      throw new Error(`?zoom= must be an integer from 0 to ${resolutions.length - 1}`);
    }
    const view = new View({
      projection: proj,
      center: [(minX + maxX) / 2, (minY + maxY) / 2],
      resolutions,
      resolution: resolutions[openAt],
      // No `extent` or `showFullExtent`: either one clamps the resolution so the AOI fills the window, which makes the
      // coarsest levels unreachable on a normal screen; the checks need every tile_grid level.
    });

    const map = new Map({
      target: "map",
      layers: rasterLayers,
      view,
      controls: defaultControls({ zoom: true, rotate: false, attribution: false }).extend([scaleLineControl]),
    });

    // Record the observed tile addressing for C9: the tile under the view centre, as z/x/y with y counted southward.
    function updateViewInfo(): void {
      const resolution = view.getResolution();
      const centre = view.getCenter();
      const z = view.getZoom();
      setValue("current-res", resolution === undefined ? "-" : String(resolution), "derived", "map:view");
      setValue("current-z", z === undefined ? "-" : z.toFixed(0), "derived", "map:view");
      if (centre && z !== undefined) {
        const [tz, tx, ty] = grids[0].getTileCoordForCoordAndZ(centre, Math.round(z));
        setValue("centre-tile", `${tz}/${tx}/${ty}`, "derived", "map:view");
      }
    }
    view.on("change:resolution", updateViewInfo);
    view.on("change:center", updateViewInfo);
    updateViewInfo();

    const levels = resolutions;
    const hook: SpikeHook = {
      levels: () => levels.length,
      resolution: () => view.getResolution() ?? Number.NaN,
      setZoom: (z) => {
        const r = levels[z];
        if (r === undefined) throw new Error(`no level ${z}`);
        view.setResolution(r);
      },
      setCenter: (x, y) => view.setCenter([x, y]),
      pixelOf: (x, y) => {
        const px = map.getPixelFromCoordinate([x, y]);
        return px ? [px[0], px[1]] : null;
      },
    };
    (window as unknown as { __spike: SpikeHook }).__spike = hook;

    log("Map initialised.");
    log(`Extent: [${site.aoi.extent_m.join(", ")}] m`);
    log(`Resolutions: [${resolutions.join(", ")}] m/px`);
  } catch (err: unknown) {
    log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
