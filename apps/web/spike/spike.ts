/**
 * T02.03 Spike page: site tiles in the custom Mars projection with a metric scale bar.
 * (02 §B, 01 FR-01, 04 §B; D-03). Throwaway: nothing under src/ imports this, and Vite builds only index.html.
 *
 * Everything comes from the served site bundle: the page fetches `/sites/<site>/site-manifest.json` (the Hab Core
 * serves data/sites; `make dev` proxies /sites to it) and reads origin, resolutions and tile size from each layer's
 * `tile_grid`. It hard-codes none of them and imports nothing from data/.
 * Site: `?site=<id>` (`^[a-z0-9_]+$`), default `mock_site` (F4).
 */
import Map from "ol/Map.js";
import View from "ol/View.js";
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";
import ScaleLine from "ol/control/ScaleLine.js";
import { defaults as defaultControls } from "ol/control/defaults.js";
import type TileGrid from "ol/tilegrid/TileGrid.js";
import type { Layer, Site } from "@marswalk/protocol";
import {
  registerMarsProjection,
  getMarsProjectionCode,
  createTileGrid,
  type MarsProjectionSite,
} from "../src/ui/map/projection.js";

const DEFAULT_SITE_ID = "mock_site";
const SITE_ID_PATTERN = /^[a-z0-9_]+$/;

/** What the page uses of the manifest, narrowed from the JSON at runtime. */
interface SpikeSite extends MarsProjectionSite {
  name: string;
  layers: Layer[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberTuple(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((n) => typeof n === "number" && Number.isFinite(n));
}

/** Check the fields the spike reads, so a malformed manifest fails with a message instead of a type cast. */
function parseSpikeSite(json: unknown): SpikeSite {
  if (!isRecord(json)) throw new Error("manifest is not a JSON object");
  const { site_id, name, crs, aoi, layers } = json;
  if (typeof site_id !== "string" || !SITE_ID_PATTERN.test(site_id)) throw new Error("manifest site_id is missing or invalid");
  if (typeof name !== "string") throw new Error("manifest name is missing");
  if (!isRecord(crs) || typeof crs.proj4 !== "string" || typeof crs.base !== "string") throw new Error("manifest crs.proj4 / crs.base missing");
  if (!isRecord(aoi) || !isNumberTuple(aoi.extent_m, 4) || !isNumberTuple(aoi.bbox_geo, 4)) throw new Error("manifest aoi.extent_m / aoi.bbox_geo missing");
  if (!Array.isArray(layers)) throw new Error("manifest layers is not an array");
  return { site_id, name, crs, aoi, layers } as SpikeSite;
}

function siteIdFromUrl(): string {
  const requested = new URLSearchParams(window.location.search).get("site") ?? DEFAULT_SITE_ID;
  if (!SITE_ID_PATTERN.test(requested)) throw new Error(`?site= must match ${SITE_ID_PATTERN.source}`);
  return requested;
}

async function loadSiteManifest(siteId: string): Promise<SpikeSite> {
  const url = `/sites/${siteId}/site-manifest.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status}. Start the Hab Core (make hab) and the dev server (make dev).`);
  }
  return parseSpikeSite(await res.json());
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
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
    log(`Fetching /sites/${siteId}/site-manifest.json ...`);
    const site = await loadSiteManifest(siteId);

    setText("site-name", site.name);
    setText("site-crs", `${site.crs.base} (${site.site_id})`);

    const proj = registerMarsProjection(site);
    log(`Registered projection code: ${getMarsProjectionCode(site)}`);

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

      const tileGrid = createTileGrid(spec);
      grids.push(tileGrid);
      const tileUrl = `/sites/${site.site_id}/tiles/${layer.layer_id}/{z}/{x}/{y}.${spec.format}`;
      log(`Layer "${layer.title}" -> ${tileUrl}`);

      const source = new XYZ({ projection: proj, tileGrid, url: tileUrl, wrapX: false });
      source.on("tileloaderror", () => log(`Tile load error on layer "${layer.layer_id}"`));
      const tileLayer = new TileLayer({
        source,
        visible: layer.default_visible,
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
    const view = new View({
      projection: proj,
      center: [(minX + maxX) / 2, (minY + maxY) / 2],
      resolutions,
      resolution: resolutions[0],
      extent: site.aoi.extent_m,
      showFullExtent: true,
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
      setText("current-res", resolution === undefined ? "-" : String(resolution));
      setText("current-z", z === undefined ? "-" : z.toFixed(0));
      if (centre && z !== undefined) {
        const [tz, tx, ty] = grids[0].getTileCoordForCoordAndZ(centre, Math.round(z));
        setText("centre-tile", `${tz}/${tx}/${ty}`);
      }
    }
    view.on("change:resolution", updateViewInfo);
    view.on("change:center", updateViewInfo);
    updateViewInfo();

    log("Map initialised.");
    log(`Extent: [${site.aoi.extent_m.join(", ")}] m`);
    log(`Resolutions: [${resolutions.join(", ")}] m/px`);
    void map;
  } catch (err: unknown) {
    log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
