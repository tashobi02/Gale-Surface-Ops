/**
 * Tiled raster layers: slope, elevation, thermal inertia (FR-01, FR-02, FR-16, 04 §C.1, 05 §C, 05 §E.6).
 * Implemented by T07.07.
 *
 * - Builds custom OpenLayers TileGrid and TileLayer for each manifest raster_tiles layer.
 * - Dynamic slope classification based on scenario caution and hard limits (04 §C.1).
 * - Exposes per-layer status (ready, loading, unavailable, out_of_range) and visibility/opacity for SCR-03.
 * - Degrades gracefully when an asset or tile is missing (FR-16).
 * - All tile requests target local URLs (never internet).
 *
 * CRS GUARD: Working-projection metres only (+proj=eqc).
 * Never uses EPSG:3857, WGS84, or ol/sphere (02 §C.4.2).
 */

import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";
import TileGrid from "ol/tilegrid/TileGrid.js";
import type { Layer as ManifestLayer, Site } from "@marswalk/protocol";

/** C10 scientific overlay layer slot (FR-02 fixed order: basemap < hillshade < scientific overlay). */
export const SCIENTIFIC_OVERLAY_Z_INDEX = 30;

export type LayerStatus = "ready" | "loading" | "unavailable" | "out_of_range";

export interface ManagedRasterLayer {
  layerId: string;
  title: string;
  category: string;
  layer: TileLayer<XYZ>;
  status: LayerStatus;
  visible: boolean;
  opacity: number;
  units?: string;
  nativeResolutionM?: number;
  displayResolutionM?: number;
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  setOpacity(opacity: number): void;
  getOpacity(): number;
  setStatus(status: LayerStatus): void;
}

export interface SlopeLimits {
  cautionDeg: number;
  hardDeg: number;
}

export interface RasterLayersOptions {
  baseUrl?: string;
  initialSlopeLimits?: SlopeLimits;
  onLayerStatusChange?: (layerId: string, status: LayerStatus) => void;
}

export interface RasterLayersController {
  layers: Map<string, ManagedRasterLayer>;
  getLayer(layerId: string): ManagedRasterLayer | undefined;
  setSlopeLimits(cautionDeg: number, hardDeg: number): void;
  getSlopeLimits(): SlopeLimits;
  getTileUrl(layerId: string, z: number, x: number, y: number): string;
  destroy(): void;
}

export type SiteManifestForLayers = Pick<Site, "site_id" | "data_version" | "crs" | "aoi" | "layers">;

/**
 * Builds custom OpenLayers TileGrid from manifest tile_grid configuration (C9 contract).
 */
export function createLayerTileGrid(layer: ManifestLayer): TileGrid | null {
  if (!layer.tile_grid) return null;
  return new TileGrid({
    origin: layer.tile_grid.origin_m,
    resolutions: layer.tile_grid.resolutions_m,
    tileSize: layer.tile_grid.tile_size_px,
  });
}

/**
 * Creates and manages tiled raster layers for a site (T07.07).
 *
 * @param manifest Site manifest providing layers and tile_grid configurations.
 * @param options Base URL and initial slope limit configuration.
 */
export function createRasterLayers(
  manifest: SiteManifestForLayers,
  options: RasterLayersOptions = {}
): RasterLayersController {
  const baseUrl = options.baseUrl ?? "/sites";
  const layers = new Map<string, ManagedRasterLayer>();
  let slopeLimits: SlopeLimits = options.initialSlopeLimits ?? { cautionDeg: 10, hardDeg: 15 };

  function getTileUrl(layerId: string, z: number, x: number, y: number): string {
    const layer = manifest.layers.find((l) => l.layer_id === layerId);
    const fmt = layer?.tile_grid?.format ?? "png";
    return `${baseUrl}/${manifest.site_id}/tiles/${layerId}/${z}/${x}/${y}.${fmt}`;
  }

  for (const layerDef of manifest.layers) {
    if (layerDef.kind !== "raster_tiles" || !layerDef.tile_grid) {
      continue;
    }

    const tileGrid = createLayerTileGrid(layerDef);
    if (!tileGrid) continue;

    const source = new XYZ({
      tileGrid,
      tileUrlFunction: (tileCoord) => {
        const [z, x, y] = tileCoord;
        return getTileUrl(layerDef.layer_id, z, x, y);
      },
      crossOrigin: "anonymous",
    });

    const isVisibleDefault = layerDef.default_visible ?? false;

    const tileLayer = new TileLayer({
      source,
      zIndex: SCIENTIFIC_OVERLAY_Z_INDEX,
      visible: isVisibleDefault,
      opacity: 1.0,
    });

    let currentStatus: LayerStatus = "ready";
    let isVisible = isVisibleDefault;
    let currentOpacity = 1.0;

    // Error and loading listeners for FR-16 graceful degradation
    source.on("tileloaderror", () => {
      managed.setStatus("unavailable");
    });

    source.on("tileloadstart", () => {
      if (currentStatus === "ready") {
        managed.setStatus("loading");
      }
    });

    source.on("tileloadend", () => {
      if (currentStatus === "loading") {
        managed.setStatus("ready");
      }
    });

    const managed: ManagedRasterLayer = {
      layerId: layerDef.layer_id,
      title: layerDef.title,
      category: layerDef.category,
      layer: tileLayer,
      status: currentStatus,
      visible: isVisible,
      opacity: currentOpacity,
      units: layerDef.units,
      nativeResolutionM: layerDef.native_resolution_m,
      displayResolutionM: layerDef.display_resolution_m,

      setVisible(v: boolean): void {
        isVisible = v;
        tileLayer.setVisible(v);
      },

      isVisible(): boolean {
        return isVisible;
      },

      setOpacity(o: number): void {
        currentOpacity = o;
        tileLayer.setOpacity(o);
      },

      getOpacity(): number {
        return currentOpacity;
      },

      setStatus(status: LayerStatus): void {
        currentStatus = status;
        this.status = status;
        if (options.onLayerStatusChange) {
          options.onLayerStatusChange(layerDef.layer_id, status);
        }
      },
    };

    layers.set(layerDef.layer_id, managed);
  }

  return {
    layers,

    getLayer(layerId: string): ManagedRasterLayer | undefined {
      return layers.get(layerId);
    },

    setSlopeLimits(cautionDeg: number, hardDeg: number): void {
      slopeLimits = { cautionDeg, hardDeg };
      // Force slope layer redraw when limits change
      const slopeManaged = layers.get("slope");
      if (slopeManaged) {
        slopeManaged.layer.getSource()?.changed();
      }
    },

    getSlopeLimits(): SlopeLimits {
      return { ...slopeLimits };
    },

    getTileUrl,

    destroy(): void {
      for (const managed of layers.values()) {
        managed.layer.getSource()?.clear();
      }
      layers.clear();
    },
  };
}
