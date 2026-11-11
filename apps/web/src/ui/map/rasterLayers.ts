/**
 * Tiled raster layers: slope, elevation, thermal inertia, hillshade, basemap (T07.07; FR-01, FR-02, FR-16, NFR-07,
 * 04 §C.1 Map overlays, 05 §C Layer, 05 §E.6, C9 docs/contracts/tile-grid.md; 01 §E.1 step 6).
 *
 * - One OpenLayers tile layer per manifest layer of kind `raster_tiles`, on the Mars projection (never XYZ's default
 *   EPSG:3857) with the C9 `TileGrid` from the manifest, limited to the AOI extent so no tile outside it is requested.
 * - Tile address: the layer's `asset_id` resolves to an Asset; its fetchable `url` plus `/{z}/{x}/{y}.{format}` (C9
 *   §3.1). Nothing is requested from outside the site folder, and no `crossOrigin` is set (same origin).
 * - Slope: the tiles are data (degrees × 4, 255 = no data, C9 §4) and are coloured in the browser. The class edges are
 *   the legend's, except that the caution and hard edges are the scenario's `caution_slope_deg` and
 *   `hard_slope_limit_deg`, read from the plan store and re-applied when they change (01 §E.1 step 6: 15° → 12°)
 *   without fetching a tile again. Colours and opacities are the `--slope-*` tokens (04 §C.1), read at run time; the
 *   over-limit class is hatched and the steepest cross-hatched.
 * - Per-layer state for SCR-03 (03 SCR-03, FR-16): `loading`, `unavailable` (the asset is missing, or every tile that
 *   has been tried failed), `out_of_range` (zoomed out beyond the coarsest tile level), else `ready`. A failed tile
 *   does not take the layer down: the other tiles keep loading and `failedTiles()` counts the failures.
 * - Stacking follows FR-02 through `LAYER_Z_INDEX`: basemap < hillshade < scientific overlay < hazards.
 * - Attribution (NFR-07): every layer credits its `source_ids` from the manifest DataSources.
 *
 * TODO(decision): the slope ramp's 5° and 25° edges (04 §C.1) are the legend's own and do not follow the scenario;
 * only the caution and hard edges do. `image_static` layers (the C9 §6 fallback, T02.06) are not built here.
 * TODO(decision): elevation and thermal inertia are drawn as the pre-coloured PNG the pipeline writes (C9 §4).
 */
import TileLayer from "ol/layer/Tile.js";
import DataTile from "ol/source/DataTile.js";
import XYZ from "ol/source/XYZ.js";
import type { ImageLike } from "ol/DataTile.js";
import type { Layer, ClassesLegend, DataSource, MissionScenario } from "@marswalk/protocol";
import { LAYER_Z_INDEX, type LoadedAsset, type LoadedSite, type MapHandle } from "../context";
import type { PlanStore } from "../../state/planStore";
import { createTileGrid, ensureMarsProjection } from "./projection";

export type LayerStatus = "ready" | "loading" | "unavailable" | "out_of_range";

/** The scenario's slope limits, degrees (05 §C MissionScenario). */
export interface SlopeLimits {
  cautionDeg: number;
  hardDeg: number;
}

/** A decoded tile: RGBA pixels, row 0 at the top. */
export interface DecodedTile {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Colour and opacity of one slope class (04 §C.1). */
export interface SlopeClassStyle {
  rgb: [number, number, number];
  /** 0–1. */
  opacity: number;
}

/** The four drawn slope classes: 5–caution, caution–hard, hard–steep (hatched), beyond steep (cross-hatched). */
export interface SlopePalette {
  gentle: SlopeClassStyle;
  caution: SlopeClassStyle;
  overLimit: SlopeClassStyle;
  steep: SlopeClassStyle;
}

/** Class edges in degrees, ascending: below `lowDeg` is transparent. */
export interface SlopeBands {
  lowDeg: number;
  cautionDeg: number;
  hardDeg: number;
  steepDeg: number;
}

/** Browser operations, replaceable in tests (jsdom has no canvas and no `fetch` of tiles). */
export interface RasterDeps {
  /** Fetch and decode a tile image to RGBA pixels. Rejects when the tile is missing. */
  decodeTile(url: string): Promise<DecodedTile>;
  /** Wrap RGBA pixels as something OpenLayers can draw. */
  encodeTile(tile: DecodedTile): ImageLike;
  /** Read a CSS custom property (`--slope-5-10`) from the document; empty string when it is not defined. */
  readToken(name: string): string;
}

export interface RasterLayersOptions {
  /** The plan store: its scenario carries the slope limits (05 §C MissionScenario) and tells when they change. */
  scenario: Pick<PlanStore, "get" | "subscribe">;
  /** The map, so a layer can report `out_of_range` when the view is coarser than its tiles. */
  mapHandle?: Pick<MapHandle, "getResolution" | "onViewChange">;
  onStatusChange?: (layerId: string, status: LayerStatus) => void;
  deps?: Partial<RasterDeps>;
}

/** One raster layer with the state SCR-03 shows. */
export interface ManagedRasterLayer {
  readonly layerId: string;
  readonly title: string;
  readonly category: Layer["category"];
  /** The OpenLayers layer; add it to the map. */
  readonly layer: TileLayer;
  readonly provenance: Layer["provenance"];
  readonly sourceIds: readonly string[];
  readonly units?: string;
  readonly limitations: string;
  getStatus(): LayerStatus;
  /** Tiles that failed to load so far; the layer keeps drawing the others. */
  failedTiles(): number;
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  setOpacity(opacity: number): void;
  getOpacity(): number;
}

export interface RasterLayersController {
  layers: Map<string, ManagedRasterLayer>;
  getLayer(layerId: string): ManagedRasterLayer | undefined;
  /** The OpenLayers layers in manifest order, for `map.addLayer`. */
  olLayers(): TileLayer[];
  /** Set the slope limits directly (the controller also follows the plan store's scenario). */
  setSlopeLimits(cautionDeg: number, hardDeg: number): void;
  getSlopeLimits(): SlopeLimits;
  destroy(): void;
}

/** Class edges of the legend with the scenario's limits in place of the caution and hard edges (clamped ascending). */
export function slopeBands(legend: ClassesLegend, limits: SlopeLimits): SlopeBands {
  const edges = legend.classes;
  if (edges.length < 5) {
    throw new Error(`slope legend needs 5 classes (flat, gentle, caution, over limit, steep), has ${edges.length}`);
  }
  const lowDeg = edges[0][1];
  const cautionDeg = Math.max(lowDeg, limits.cautionDeg);
  const hardDeg = Math.max(cautionDeg, limits.hardDeg);
  return { lowDeg, cautionDeg, hardDeg, steepDeg: Math.max(hardDeg, edges[3][1]) };
}

/** Hatch geometry follows patterns.css: diagonal 4 px stripe in 8 px, cross-hatch 3 px stripe in 6 px. */
const HATCH = { period: 8, stripe: 4 } as const;
const CROSS_HATCH = { period: 6, stripe: 3 } as const;

/** u8 steps per degree in the C9 slope encoding, and the no-data value. */
const SLOPE_U8_PER_DEG = 4;
const SLOPE_NO_DATA = 255;

/**
 * Colour data-encoded slope pixels (C9 §4: R = G = B = round(deg × 4), alpha 0 and value 255 = no data). Below the
 * low edge and at no data the pixel is transparent. The over-limit class is hatched and the steepest cross-hatched;
 * hatch pixels are drawn opaque, the rest at the class opacity (04 §C.1). Pure: returns a new RGBA array.
 */
export function classifySlopeTile(tile: DecodedTile, bands: SlopeBands, palette: SlopePalette): DecodedTile {
  const out = new Uint8ClampedArray(tile.data.length);
  for (let row = 0; row < tile.height; row += 1) {
    for (let col = 0; col < tile.width; col += 1) {
      const at = (row * tile.width + col) * 4;
      const value = tile.data[at];
      if (tile.data[at + 3] === 0 || value === SLOPE_NO_DATA) continue;
      const deg = value / SLOPE_U8_PER_DEG;
      if (deg < bands.lowDeg) continue;

      let style: SlopeClassStyle;
      let hatched = false;
      if (deg < bands.cautionDeg) {
        style = palette.gentle;
      } else if (deg < bands.hardDeg) {
        style = palette.caution;
      } else if (deg < bands.steepDeg) {
        style = palette.overLimit;
        hatched = (col + row) % HATCH.period < HATCH.stripe;
      } else {
        style = palette.steep;
        hatched =
          (col + row) % CROSS_HATCH.period < CROSS_HATCH.stripe ||
          (col - row + CROSS_HATCH.period * tile.height) % CROSS_HATCH.period < CROSS_HATCH.stripe;
      }
      out[at] = style.rgb[0];
      out[at + 1] = style.rgb[1];
      out[at + 2] = style.rgb[2];
      out[at + 3] = hatched ? 255 : Math.round(style.opacity * 255);
    }
  }
  return { width: tile.width, height: tile.height, data: out };
}

/** `#RRGGBB` or `#RGB` to channels; throws for anything else. */
export function parseHexColour(text: string): [number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!hex) throw new Error(`not a hex colour: ${JSON.stringify(text)}`);
  const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join("") : hex[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
}

/** The slope palette from the `--slope-*` colour and `--slope-opacity-*` tokens; throws naming a missing token. */
export function readSlopePalette(readToken: (name: string) => string): SlopePalette {
  const token = (name: string): string => {
    const value = readToken(name).trim();
    if (value === "") throw new Error(`design token ${name} is not defined`);
    return value;
  };
  const style = (colour: string, opacity: string): SlopeClassStyle => {
    const alpha = Number(token(opacity));
    if (!(alpha >= 0 && alpha <= 1)) throw new Error(`design token ${opacity} is not an opacity: ${token(opacity)}`);
    return { rgb: parseHexColour(token(colour)), opacity: alpha };
  };
  return {
    gentle: style("--slope-5-10", "--slope-opacity-5-10"),
    caution: style("--slope-10-15", "--slope-opacity-10-15"),
    overLimit: style("--slope-15-25", "--slope-opacity-15-25"),
    steep: style("--slope-gt-25", "--slope-opacity-gt-25"),
  };
}

/** Credit line for a DataSource (NFR-07): title, the manifest `credit`, and the authors when listed. */
export function attributionOf(source: DataSource): string {
  return `${source.title} — ${source.credit}${source.authors ? ` (${source.authors})` : ""}`;
}

/** FR-02 stacking slot of a layer: basemap < hillshade < scientific overlay < hazards. */
export function zIndexOf(layer: Layer): number {
  if (layer.category === "optical") return LAYER_Z_INDEX.BASEMAP;
  if (layer.layer_id === "hillshade") return LAYER_Z_INDEX.HILLSHADE;
  if (layer.category === "hazard") return LAYER_Z_INDEX.HAZARDS;
  return LAYER_Z_INDEX.SCIENTIFIC_OVERLAY;
}

const browserDeps: RasterDeps = {
  async decodeTile(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`tile ${url}: HTTP ${response.status}`);
    // Keep the data bytes exact: no colour conversion, no alpha premultiplication.
    const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2D canvas context");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: image.width, height: image.height, data: image.data };
  },
  encodeTile(tile) {
    const canvas = document.createElement("canvas");
    canvas.width = tile.width;
    canvas.height = tile.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2D canvas context");
    context.putImageData(new ImageData(new Uint8ClampedArray(tile.data), tile.width, tile.height), 0, 0);
    return canvas;
  },
  readToken: (name) => getComputedStyle(document.documentElement).getPropertyValue(name),
};

/** Whether a layer's pixels are data to colour in the browser: its legend says its class breaks follow the scenario. */
function isScenarioColoured(layer: Layer): layer is Layer & { legend: ClassesLegend } {
  return layer.legend.type === "classes" && layer.legend.breaks_follow_scenario === true;
}

/**
 * Builds the raster layers of a site. Layers whose asset is missing are returned with status `unavailable` and
 * request nothing; every other layer still renders (FR-16).
 */
export function createRasterLayers(site: LoadedSite, options: RasterLayersOptions): RasterLayersController {
  const deps: RasterDeps = { ...browserDeps, ...options.deps };
  const projection = ensureMarsProjection(site.site);
  const aoiExtent = site.site.aoi.extent_m;

  const scenarioLimits = (scenario: Pick<MissionScenario, "caution_slope_deg" | "hard_slope_limit_deg">): SlopeLimits => ({
    cautionDeg: scenario.caution_slope_deg,
    hardDeg: scenario.hard_slope_limit_deg,
  });
  let limits = scenarioLimits(options.scenario.get().scenario);

  const layers = new Map<string, ManagedRasterLayer>();
  const redraws: (() => void)[] = [];
  const disposers: (() => void)[] = [];
  const rawTiles = new Map<string, Promise<DecodedTile>>();

  const applyLimits = (next: SlopeLimits): void => {
    if (next.cautionDeg === limits.cautionDeg && next.hardDeg === limits.hardDeg) return;
    limits = next;
    for (const redraw of redraws) redraw();
  };
  disposers.push(
    options.scenario.subscribe((state) => applyLimits(scenarioLimits(state.scenario))),
  );

  for (const def of site.site.layers) {
    if (def.kind !== "raster_tiles" || !def.tile_grid) continue;
    const spec = def.tile_grid;
    const asset: LoadedAsset | undefined = site.assets.get(def.asset_id);
    const tilesOk = asset !== undefined && asset.format === "tiles";

    const assetMissing = !tilesOk;
    let pending = 0;
    let loaded = 0;
    let failed = 0;
    let outOfRange = false;
    const coarsest = spec.resolutions_m[0];

    const compute = (): LayerStatus =>
      assetMissing || (failed > 0 && loaded === 0 && pending === 0)
        ? "unavailable"
        : outOfRange
          ? "out_of_range"
          : pending > 0
            ? "loading"
            : "ready";
    let status: LayerStatus = compute();

    const notify = (): void => {
      const next = compute();
      if (next !== status) {
        status = next;
        options.onStatusChange?.(def.layer_id, status);
      }
    };

    const attributions = def.source_ids
      .map((id) => site.sources.get(id))
      .filter((source): source is DataSource => source !== undefined)
      .map(attributionOf);
    const tileGrid = createTileGrid(spec, aoiExtent);
    const template = tilesOk ? `${asset.url}/{z}/{x}/{y}.${spec.format}` : undefined;

    let source: XYZ | DataTile;
    if (template === undefined) {
      // No asset: a source with no URL requests nothing.
      source = new XYZ({ projection, tileGrid, wrapX: false, attributions, tileUrlFunction: () => undefined });
    } else if (isScenarioColoured(def)) {
      const legend = def.legend;
      const load = async (z: number, x: number, y: number): Promise<ImageLike> => {
        const url = template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
        let raw = rawTiles.get(url);
        if (!raw) {
          raw = deps.decodeTile(url);
          rawTiles.set(url, raw);
          // A tile that failed is tried again on the next request.
          raw.catch(() => rawTiles.delete(url));
        }
        const bands = slopeBands(legend, limits);
        return deps.encodeTile(classifySlopeTile(await raw, bands, readSlopePalette(deps.readToken)));
      };
      const dataSource = new DataTile({ projection, tileGrid, wrapX: false, attributions, loader: load });
      source = dataSource;
      redraws.push(() => dataSource.refresh());
    } else {
      source = new XYZ({ projection, tileGrid, wrapX: false, attributions, url: template });
    }

    source.on("tileloadstart", () => {
      pending += 1;
      notify();
    });
    source.on("tileloadend", () => {
      pending = Math.max(0, pending - 1);
      loaded += 1;
      notify();
    });
    source.on("tileloaderror", () => {
      pending = Math.max(0, pending - 1);
      failed += 1;
      notify();
    });

    const visible = def.default_visible;
    const tileLayer = new TileLayer({ source, zIndex: zIndexOf(def), visible, opacity: 1 });

    const view = options.mapHandle;
    if (view && !assetMissing) {
      const apply = (resolution: number | undefined): void => {
        outOfRange = resolution !== undefined && resolution > coarsest;
        notify();
      };
      apply(view.getResolution());
      disposers.push(view.onViewChange((v) => apply(v.resolution_m_per_px)));
    }

    layers.set(def.layer_id, {
      layerId: def.layer_id,
      title: def.title,
      category: def.category,
      layer: tileLayer,
      provenance: def.provenance,
      sourceIds: def.source_ids,
      units: def.units,
      limitations: def.limitations,
      getStatus: () => status,
      failedTiles: () => failed,
      setVisible: (v) => tileLayer.setVisible(v),
      isVisible: () => tileLayer.getVisible(),
      setOpacity: (o) => tileLayer.setOpacity(o),
      getOpacity: () => tileLayer.getOpacity(),
    });
  }

  let destroyed = false;
  return {
    layers,
    getLayer: (layerId) => layers.get(layerId),
    olLayers: () => [...layers.values()].map((managed) => managed.layer),
    setSlopeLimits: (cautionDeg, hardDeg) => applyLimits({ cautionDeg, hardDeg }),
    getSlopeLimits: () => ({ ...limits }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const dispose of disposers) dispose();
      disposers.length = 0;
      redraws.length = 0;
      rawTiles.clear();
      for (const managed of layers.values()) managed.layer.dispose();
      layers.clear();
    },
  };
}
