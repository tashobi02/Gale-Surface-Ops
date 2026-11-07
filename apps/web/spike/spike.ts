/**
 * T02.03 Spike page: mock-site tiles in the custom Mars projection with a metric scale bar.
 * (02 §B, 01 FR-01, 04 §B; D-03).
 */
import Map from "ol/Map.js";
import View from "ol/View.js";
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";
import ScaleLine from "ol/control/ScaleLine.js";
import { defaults as defaultControls } from "ol/control/defaults.js";
import type { Site, Layer } from "@marswalk/protocol";
import {
  registerMarsProjection,
  getMarsProjectionCode,
  createTileGrid,
} from "../src/ui/map/projection.js";

async function loadSiteManifest(): Promise<Site> {
  const url = "/sites/mock_site/site-manifest.json";
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as Site;
  } catch (fetchErr) {
    console.warn("fetch(/sites/mock_site/site-manifest.json) failed, falling back to static import:", fetchErr);
    // Dynamic import fallback for standalone dev / test environments
    const mod = await import("../../../data/sites/mock_site/site-manifest.json");
    return mod.default as unknown as Site;
  }
}

async function init() {
  const siteNameEl = document.getElementById("site-name");
  const siteCrsEl = document.getElementById("site-crs");
  const currentResEl = document.getElementById("current-res");
  const currentZEl = document.getElementById("current-z");
  const layerTogglesEl = document.getElementById("layer-toggles");
  const diagnosticsEl = document.getElementById("diagnostics");

  function log(msg: string) {
    if (diagnosticsEl) {
      diagnosticsEl.innerHTML += `<div>${msg}</div>`;
      diagnosticsEl.scrollTop = diagnosticsEl.scrollHeight;
    }
    console.log(`[T02.03 Spike] ${msg}`);
  }

  try {
    log("Fetching site manifest...");
    const site = await loadSiteManifest();

    if (siteNameEl) siteNameEl.textContent = site.name;
    if (siteCrsEl) siteCrsEl.textContent = `${site.crs.base} (${site.site_id})`;

    log(`Registering Mars projection for site ${site.site_id}...`);
    const proj = registerMarsProjection(site);
    const projCode = getMarsProjectionCode(site);
    log(`Registered projection code: ${projCode}`);

    const rasterLayers: TileLayer<XYZ>[] = [];
    let primaryResolutions: number[] = [32, 16, 8, 4, 2];

    for (const layer of site.layers) {
      if (!layer.tile_grid) continue;

      const tileGrid = createTileGrid(layer.tile_grid);
      primaryResolutions = layer.tile_grid.resolutions_m;

      const tileUrl = `/sites/${site.site_id}/tiles/${layer.layer_id}/{z}/{x}/{y}.${layer.tile_grid.format}`;
      log(`Setting up layer "${layer.title}" -> ${tileUrl}`);

      const source = new XYZ({
        projection: proj,
        tileGrid,
        url: tileUrl,
        wrapX: false,
      });

      source.on("tileloaderror", (event) => {
        console.warn(`Tile load error on layer "${layer.layer_id}":`, event);
      });

      const tileLayer = new TileLayer({
        source,
        visible: layer.default_visible ?? true,
        properties: { layerId: layer.layer_id, title: layer.title },
      });

      rasterLayers.push(tileLayer);

      // Create UI toggle
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
        label.textContent = `${layer.title} (${layer.units})`;

        item.appendChild(checkbox);
        item.appendChild(label);
        layerTogglesEl.appendChild(item);
      }
    }

    // Scale line control in metric units (metres / km) placed bottom-left (04 §B)
    const scaleLineControl = new ScaleLine({
      units: "metric",
      bar: false,
      text: true,
      minWidth: 100,
    });

    const [minX, minY, maxX, maxY] = site.aoi.extent_m;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const view = new View({
      projection: proj,
      center: [centerX, centerY],
      resolutions: primaryResolutions,
      resolution: primaryResolutions[0],
      extent: site.aoi.extent_m,
      showFullExtent: true,
    });

    const map = new Map({
      target: "map",
      layers: rasterLayers,
      view,
      controls: defaultControls({
        zoom: true,
        rotate: false,
        attribution: false,
      }).extend([scaleLineControl]),
    });

    function updateViewInfo() {
      const res = view.getResolution();
      const z = view.getZoom();
      if (currentResEl && res !== undefined) {
        currentResEl.textContent = res.toFixed(1);
      }
      if (currentZEl && z !== undefined) {
        currentZEl.textContent = z.toFixed(0);
      }
    }

    view.on("change:resolution", updateViewInfo);
    updateViewInfo();

    log("Map initialised successfully.");
    log(`Extent: [${site.aoi.extent_m.join(", ")}] m`);
    log(`Resolutions: [${primaryResolutions.join(", ")}] m/px`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(`ERROR: ${message}`);
    console.error("Spike initialisation failed:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
