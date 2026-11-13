/**
 * Tiled raster layers: slope, elevation, thermal inertia, hillshade, basemap (T07.07; FR-01, FR-02, FR-16, NFR-07,
 * 04 §C.1 Map overlays, 05 §C Layer, 05 §E.6, C9 docs/contracts/tile-grid.md; 01 §E.1 step 6).
 *
 * - One OpenLayers tile layer per manifest layer of kind `raster_tiles`, on the Mars projection (never XYZ's default
 *   EPSG:3857) with the C9 `TileGrid` from the manifest, limited to the AOI extent so no tile outside it is requested.
 * - Tile address: the layer's `asset_id` resolves to an Asset; its fetchable `url` plus `/{z}/{x}/{y}.{format}` (C9
 *   §3.1). Nothing is requested from outside the site folder, and no `crossOrigin` is set (same origin).
 * - Slope: the tiles are data (degrees × 4, 255 = no data, C9 §4) and are coloured in the browser. The only class edges are
 *   the scenario's `caution_slope_deg` and `hard_slope_limit_deg`, read from the plan store and re-applied when they change
 *   (01 §E.1 step 6: 15° → 12°) without fetching a tile again: below caution nothing is drawn, caution to hard is the
 *   caution class, hard and above is the over-limit class, hatched. The legend's own 5° and 25° edges are not drawn
 *   (FD-076; 04 §C.1 "class edges follow the current limits"). Colours and opacities are the `--slope-10-15` and
 *   `--slope-15-25` tokens (04 §C.1), read and checked once when the layers are created (FD-065), so a missing token
 *   fails there and not inside a tile load.
 * - Elevation and thermal inertia are drawn as the pre-coloured PNG the pipeline writes (C9 §4, FD-077). Canvas 2D only,
 *   never WebGL (FD-107). A layer of category `optical` (the ortho basemap) carries the class `marswalk-ortho`, which the
 *   OPS stylesheet turns grayscale (FD-003); BRIEF slabs keep the colour.
 * - Per-layer state for SCR-03 (03 SCR-03, FR-16): `loading`, `unavailable` (the asset is missing, or every tile that
 *   has been tried failed), `out_of_range` (zoomed out beyond the coarsest tile level), else `ready`. A failed tile
 *   does not take the layer down: the other tiles keep loading and `failedTiles()` counts the failures.
 * - Stacking follows FR-02 through `LAYER_Z_INDEX`: basemap < hillshade < scientific overlay < hazards.
 * - Attribution (NFR-07): every layer credits its `source_ids` from the manifest DataSources.
 *
 * - Degradation (T02.06/T07.16, FD-101, FD-193): when every tile a layer tried has failed, the layer switches itself to an
 *   ImageStatic layer in the Mars projection and says so (`getFallback`). The image is the pipeline's static PNG when the
 *   manifest declares one (`images/<layer_id>.png`, BD-23); the ortho basemap (category `optical`) otherwise uses the coarsest
 *   tile of its own tile set (FD-101). Any other layer without a PNG stays `unavailable`. The primary tile path is unchanged and adds no layer to the map until it fails.
 */
import TileLayer from "ol/layer/Tile.js";
import ImageLayer from "ol/layer/Image.js";
import type Static from "ol/source/ImageStatic.js";
import { createImageStatic, createImageStaticSource } from "./imageStatic";
import DataTile from "ol/source/DataTile.js";
import XYZ from "ol/source/XYZ.js";
import type { ImageLike } from "ol/DataTile.js";
import type { Layer, ClassesLegend, DataSource, MissionScenario } from "@marswalk/protocol";
import { LAYER_Z_INDEX, type LoadedAsset, type LoadedSite, type MapHandle } from "../context";
import type { PlanStore } from "../../state/planStore";
import { parseHexColour, readCssToken, requireToken } from "./mapTokens";
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

/** The two drawn slope classes: caution to hard, and hard and above (hatched). */
export interface SlopePalette {
  caution: SlopeClassStyle;
  overLimit: SlopeClassStyle;
}

/** Class edges in degrees: the scenario's limits, `hardDeg >= cautionDeg`. Below `cautionDeg` nothing is drawn. */
export interface SlopeBands {
  cautionDeg: number;
  hardDeg: number;
}

/** One class of the legend: the manifest's word over the scenario's edges (`toDeg` null = no upper edge). */
export interface SlopeLegendClass {
  key: "caution" | "over_limit";
  label: string;
  fromDeg: number;
  toDeg: number | null;
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

/** Which image stands in for a layer whose tiles did not load. */
export type RasterFallbackKind = "declared_image" | "coarsest_tile";

/** The degradation in force for one layer (FD-193): shown on the layer row and in the map's notice. */
export interface RasterFallback {
  readonly kind: RasterFallbackKind;
  /** The file the ImageStatic layer draws. */
  readonly url: string;
  /** Metres per image pixel when the manifest says (the coarsest tile's resolution, or the PNG's width over the AOI). */
  readonly resolutionM: number | null;
  /** The ImageStatic layer; the map shows it in place of the tile layer. */
  readonly layer: ImageLayer<Static>;
}

export interface RasterLayersOptions {
  /** The plan store: its scenario carries the slope limits (05 §C MissionScenario) and tells when they change. */
  scenario: Pick<PlanStore, "get" | "subscribe">;
  /** The map, so a layer can report `out_of_range` when the view is coarser than its tiles. */
  mapHandle?: Pick<MapHandle, "getResolution" | "onViewChange">;
  onStatusChange?: (layerId: string, status: LayerStatus) => void;
  /** Called once per layer, when its tiles failed and its ImageStatic layer replaces them: add `layer` to the map. */
  onFallbackLayer?: (layerId: string, layer: ImageLayer<Static>) => void;
  deps?: Partial<RasterDeps>;
}

/** One raster layer with the state SCR-03 shows. */
export interface ManagedRasterLayer {
  readonly layerId: string;
  readonly title: string;
  readonly category: Layer["category"];
  /** The OpenLayers layer; add it to the map. */
  readonly layer: TileLayer | ImageLayer<Static>;
  readonly provenance: Layer["provenance"];
  readonly sourceIds: readonly string[];
  readonly units?: string;
  readonly limitations: string;
  getStatus(): LayerStatus;
  /** Tiles that failed to load so far; the layer keeps drawing the others. */
  failedTiles(): number;
  /** The ImageStatic stand-in once every attempted tile failed, else null (the primary path is in use). */
  getFallback(): RasterFallback | null;
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  setOpacity(opacity: number): void;
  getOpacity(): number;
}

export interface RasterLayersController {
  layers: Map<string, ManagedRasterLayer>;
  getLayer(layerId: string): ManagedRasterLayer | undefined;
  /** The OpenLayers layers in manifest order, for `map.addLayer`. */
  olLayers(): (TileLayer | ImageLayer<Static>)[];
  /** Set the slope limits directly (the controller also follows the plan store's scenario). */
  setSlopeLimits(cautionDeg: number, hardDeg: number): void;
  getSlopeLimits(): SlopeLimits;
  destroy(): void;
}

/** The class edges: the scenario's caution and hard limits, the hard edge never below the caution edge. */
export function slopeBands(limits: SlopeLimits): SlopeBands {
  return { cautionDeg: limits.cautionDeg, hardDeg: Math.max(limits.cautionDeg, limits.hardDeg) };
}

/**
 * The legend's two drawn classes, worded by the manifest (`classes[2]` caution, `classes[3]` over limit) and bounded by the
 * scenario's limits. Throws when the manifest legend does not have the five classes of 05 §F.1.
 */
export function slopeLegend(legend: ClassesLegend, limits: SlopeLimits): SlopeLegendClass[] {
  const classes = legend.classes;
  if (classes.length < 5) {
    throw new Error(`slope legend needs 5 classes (flat, gentle, caution, over limit, steep), has ${classes.length}`);
  }
  const bands = slopeBands(limits);
  return [
    { key: "caution", label: classes[2][2], fromDeg: bands.cautionDeg, toDeg: bands.hardDeg },
    { key: "over_limit", label: classes[3][2], fromDeg: bands.hardDeg, toDeg: null },
  ];
}

/** Hatch geometry follows patterns.css: diagonal 4 px stripe in 8 px. */
const HATCH = { period: 8, stripe: 4 } as const;

/** u8 steps per degree in the C9 slope encoding, and the no-data value. */
const SLOPE_U8_PER_DEG = 4;
const SLOPE_NO_DATA = 255;

/**
 * Colour data-encoded slope pixels (C9 §4: R = G = B = round(deg × 4), alpha 0 and value 255 = no data). Below the caution
 * edge and at no data the pixel is transparent; caution to hard is the caution class; hard and above is the over-limit class,
 * hatched. Hatch pixels are drawn opaque, the rest at the class opacity (04 §C.1). Pure: returns a new RGBA array.
 */
export function classifySlopeTile(tile: DecodedTile, bands: SlopeBands, palette: SlopePalette): DecodedTile {
  const out = new Uint8ClampedArray(tile.data.length);
  for (let row = 0; row < tile.height; row += 1) {
    for (let col = 0; col < tile.width; col += 1) {
      const at = (row * tile.width + col) * 4;
      const value = tile.data[at];
      if (tile.data[at + 3] === 0 || value === SLOPE_NO_DATA) continue;
      const deg = value / SLOPE_U8_PER_DEG;
      if (deg < bands.cautionDeg) continue;

      let style: SlopeClassStyle;
      let hatched = false;
      if (deg < bands.hardDeg) {
        style = palette.caution;
      } else {
        style = palette.overLimit;
        hatched = (col + row) % HATCH.period < HATCH.stripe;
      }
      out[at] = style.rgb[0];
      out[at + 1] = style.rgb[1];
      out[at + 2] = style.rgb[2];
      out[at + 3] = hatched ? 255 : Math.round(style.opacity * 255);
    }
  }
  return { width: tile.width, height: tile.height, data: out };
}

/** The slope palette from the `--slope-10-15` and `--slope-15-25` colour and opacity tokens; throws naming a missing token. */
export function readSlopePalette(readToken: (name: string) => string): SlopePalette {
  const token = (name: string): string => requireToken(readToken, name);
  const style = (colour: string, opacity: string): SlopeClassStyle => {
    const alpha = Number(token(opacity));
    if (!(alpha >= 0 && alpha <= 1)) throw new Error(`design token ${opacity} is not an opacity: ${token(opacity)}`);
    return { rgb: parseHexColour(token(colour)), opacity: alpha };
  };
  return {
    caution: style("--slope-10-15", "--slope-opacity-10-15"),
    overLimit: style("--slope-15-25", "--slope-opacity-15-25"),
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

/**
 * The class an optical (ortho) tile layer carries, and the rule the OPS mode greys it with (FD-003). Every map that draws
 * the ortho uses this name, so the grayscale reaches the EVA mini-map and the planner alike.
 */
export const OPS_ORTHO_LAYER_CLASS = "ol-layer marswalk-ortho";

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
  readToken: readCssToken,
};

/** Whether a layer's pixels are data to colour in the browser: its legend says its class breaks follow the scenario. */
function isScenarioColoured(layer: Layer): layer is Layer & { legend: ClassesLegend } {
  return layer.legend.type === "classes" && layer.legend.breaks_follow_scenario === true;
}

/** The ImageStatic source events and the layer status each one means. */
const STATIC_EVENTS = [["imageloadstart", "loading"], ["imageloadend", "ready"], ["imageloaderror", "unavailable"]] as const;

/** A managed layer over one OpenLayers layer whose visibility and opacity are the layer's own (an image-only definition). */
function managedOf(def: Layer, layer: TileLayer | ImageLayer<Static>, state: { status: () => LayerStatus }): ManagedRasterLayer {
  return {
    layerId: def.layer_id, title: def.title, category: def.category, layer,
    provenance: def.provenance, sourceIds: def.source_ids, units: def.units, limitations: def.limitations,
    getStatus: state.status, failedTiles: () => 0, getFallback: () => null,
    setVisible: (v) => layer.setVisible(v), isVisible: () => layer.getVisible(),
    setOpacity: (o) => layer.setOpacity(o), getOpacity: () => layer.getOpacity(),
  };
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
  // FD-065: the tokens are checked once, here, so a missing one fails at creation and not inside a tile load.
  const palette = readSlopePalette(deps.readToken);

  const layers = new Map<string, ManagedRasterLayer>();
  const redraws: (() => void)[] = [];
  const disposers: (() => void)[] = [];
  let destroyed = false;
  const rawTiles = new Map<string, Promise<DecodedTile>>();

  const applyLimits = (next: SlopeLimits): void => {
    if (next.cautionDeg === limits.cautionDeg && next.hardDeg === limits.hardDeg) return;
    limits = next;
    for (const redraw of redraws) redraw();
  };
  disposers.push(
    options.scenario.subscribe((state) => applyLimits(scenarioLimits(state.scenario))),
  );

  /** A tile's decoded pixels, fetched once per url; a tile that failed is tried again on the next request. */
  const rawTile = (url: string): Promise<DecodedTile> => {
    let raw = rawTiles.get(url);
    if (!raw) {
      raw = deps.decodeTile(url);
      rawTiles.set(url, raw);
      raw.catch(() => rawTiles.delete(url));
    }
    return raw;
  };
  /** The loader of a data-encoded slope image: decode, then colour by the scenario's current limits. */
  const colouredImage = (url: string) => async (): Promise<ImageLike> =>
    deps.encodeTile(classifySlopeTile(await rawTile(url), slopeBands(limits), palette));

  for (const def of site.site.layers) {
    if (def.kind === "image_static") {
      // A layer the manifest declares as one image: no tile grid, no tile request (T07.16).
      const staticAsset = site.assets.get(def.asset_id);
      if (!staticAsset || staticAsset.format !== "png") {
        const placeholder = new ImageLayer<Static>({ visible: def.default_visible, zIndex: zIndexOf(def) });
        layers.set(def.layer_id, managedOf(def, placeholder, { status: () => "unavailable" }));
        continue;
      }
      const imageOptions = { zIndex: zIndexOf(def), className: def.category === "optical" ? OPS_ORTHO_LAYER_CLASS : "ol-layer" };
      const loader = (): { load?: () => Promise<ImageLike> } => (isScenarioColoured(def) ? { load: colouredImage(staticAsset.url) } : {});
      let imageStatus: LayerStatus = "loading";
      const image = createImageStatic(site, def, { ...imageOptions, ...loader() });
      const bind = (): void => {
        for (const [event, next] of STATIC_EVENTS) {
          image.getSource()!.on(event, () => { if (!destroyed) { imageStatus = next; options.onStatusChange?.(def.layer_id, next); } });
        }
      };
      bind();
      if (isScenarioColoured(def)) redraws.push(() => {
        image.setSource(createImageStaticSource(site, def, loader()));
        imageStatus = "loading"; bind(); options.onStatusChange?.(def.layer_id, imageStatus);
      });
      layers.set(def.layer_id, managedOf(def, image, { status: () => imageStatus }));
      continue;
    }
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

    let fallback: RasterFallback | null = null;
    let fallbackStatus: LayerStatus = "loading";
    const compute = (): LayerStatus =>
      fallback
        ? fallbackStatus
        : assetMissing || (failed > 0 && loaded === 0 && pending === 0)
          ? "unavailable"
          : outOfRange
            ? "out_of_range"
            : pending > 0
              ? "loading"
              : "ready";
    let status: LayerStatus = compute();

    const notify = (): void => {
      if (destroyed) return;
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
      const load = async (z: number, x: number, y: number): Promise<ImageLike> => {
        const url = template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
        return deps.encodeTile(classifySlopeTile(await rawTile(url), slopeBands(limits), palette));
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

    // The ortho basemap is grayscale in OPS by CSS on this class (FD-003): `filter` on that layer's canvas only.
    const className = def.category === "optical" ? OPS_ORTHO_LAYER_CLASS : "ol-layer";
    let wantVisible = def.default_visible;
    let wantOpacity = 1;
    const tileLayer = new TileLayer({ source, zIndex: zIndexOf(def), visible: wantVisible, opacity: 1, className });
    const showWhatDraws = (): void => {
      tileLayer.setVisible(wantVisible && !fallback);
      fallback?.layer.setVisible(wantVisible);
    };

    /** The image that can stand in for this layer's tiles: the pipeline's PNG (BD-23) first, else the ortho's coarsest tile (FD-101). */
    const standIn = (): Omit<RasterFallback, "layer"> & { imageExtent: [number, number, number, number] } | null => {
      const declared = [...site.assets.values()].find((a) => a.format === "png" && a.path === `images/${def.layer_id}.png`);
      if (declared) {
        const widthM = aoiExtent[2] - aoiExtent[0];
        return { kind: "declared_image", url: declared.url, imageExtent: [...aoiExtent], resolutionM: declared.width ? widthM / declared.width : null };
      }
      // FD-101: only the ortho basemap falls back to its own coarsest tile; a 2 m overlay without a PNG stays unavailable.
      if (tilesOk && def.category === "optical" && coarsest !== undefined) {
        const size = spec.tile_size_px * coarsest;
        const [originX, originY] = spec.origin_m;
        return { kind: "coarsest_tile", url: `${asset.url}/0/0/0.${spec.format}`, imageExtent: [originX, originY - size, originX + size, originY], resolutionM: coarsest };
      }
      return null;
    };
    const switchToImage = (): void => {
      if (destroyed || fallback || loaded > 0 || pending > 0) return;
      const plan = standIn();
      if (!plan) return;
      const { imageExtent, ...info } = plan;
      const base = { url: plan.url, imageExtent };
      const loader = (): { load?: () => Promise<ImageLike> } => (isScenarioColoured(def) ? { load: colouredImage(plan.url) } : {});
      const layer = createImageStatic(site, def, { ...base, ...loader(), className, zIndex: zIndexOf(def), visible: wantVisible });
      layer.setOpacity(wantOpacity);
      const bind = (): void => {
        for (const [event, next] of STATIC_EVENTS) layer.getSource()!.on(event, () => { fallbackStatus = next; notify(); });
      };
      bind();
      if (isScenarioColoured(def)) redraws.push(() => {
        layer.setSource(createImageStaticSource(site, def, { ...base, ...loader() }));
        fallbackStatus = "loading"; bind(); notify();
      });
      fallback = { ...info, layer };
      showWhatDraws();
      options.onFallbackLayer?.(def.layer_id, layer);
      notify();
    };
    source.on("tileloaderror", () => {
      pending = Math.max(0, pending - 1);
      failed += 1;
      switchToImage();
      notify();
    });
    if (assetMissing) switchToImage();

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
      ...managedOf(def, tileLayer, { status: () => status }),
      failedTiles: () => failed,
      getFallback: () => fallback,
      setVisible: (v) => { wantVisible = v; showWhatDraws(); },
      isVisible: () => wantVisible,
      setOpacity: (o) => { wantOpacity = o; tileLayer.setOpacity(o); fallback?.layer.setOpacity(o); },
      getOpacity: () => wantOpacity,
    });
  }

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
      for (const managed of layers.values()) {
        managed.getFallback()?.layer.dispose();
        managed.layer.dispose();
      }
      layers.clear();
    },
  };
}
