/**
 * Curiosity traverse layer (T07.10; FR-17, FR-15, FR-16, 02 §E.1, 04 §C.1, §C.5, 05 §C TraversePoint).
 *
 * - The manifest's `traverse_asset` GeoJSON (working-projection metres) is drawn at the C10 traverse slot as a thin,
 *   dashed `--traverse` line at 60 % with a small marker per point; the sol label ("Sol 4611") shows on hover only
 *   (04 §C.5). Colours, font and size are design tokens read at run time (mapTokens.ts); a missing token throws.
 * - A point is a protocol `TraversePoint` (`sol`, `source_id`, optional `site_drive`, `lat`, `lon_e`,
 *   `elevation_m`). A point with no numeric sol, no `source_id` that names a manifest DataSource, bad coordinates or
 *   no provenance class is skipped and listed in `skipped()`; nothing is defaulted (no sol 0, no stand-in source).
 * - Provenance is the manifest Layer's: the layer whose `asset_id` is the `traverse_asset`. Only when the manifest has
 *   no such layer (the mock site) is the feature's own class used, if it is one of the six. TODO(decision): the mock
 *   manifest has no traverse layer; the real one should declare it so the class comes from the manifest alone.
 * - Show/hide and opacity use the same names as the raster layers (SCR-03). The asset is fetched here; a failed or
 *   missing asset leaves the layer `unavailable` and everything else running (FR-16).
 * - `attach(handle)` listens to the map's pointer: hover labels the nearest point and a click selects it, within a
 *   pixel tolerance times the view resolution. `traverseInfoElement` renders a selected point's sol and source with
 *   provenance and source id as text nodes.
 *
 * CRS: projected metres only; never EPSG:3857, WGS84 or `ol/sphere` (02 §C.4.2).
 */
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import Text from "ol/style/Text.js";
import type { Provenance, TraversePoint } from "@marswalk/protocol";
import { LAYER_Z_INDEX, PROVENANCE_VALUES, type LoadedSite, type MapHandle } from "../context";
import { provAttrs } from "../components/provenance";
import { colourToken, pxToken, readCssToken, requireToken, type TokenReader } from "./mapTokens";

/** A GeoJSON feature as `vectors/traverse.geojson` has it; properties are checked, not trusted. */
export interface TraverseGeoJsonFeature {
  type: "Feature";
  geometry: { type: "Point" | "LineString"; coordinates: unknown };
  properties?: Record<string, unknown> | null;
}

export interface TraverseGeoJson {
  type: "FeatureCollection";
  features: TraverseGeoJsonFeature[];
}

/** A selected traverse point: the protocol `TraversePoint`, where it is, and the class of its values. */
export interface TraversePointInfo {
  point: TraversePoint;
  coordinates: [number, number];
  provenance: Provenance;
}

export interface TraverseSkip {
  /** Index in the GeoJSON `features` array. */
  index: number;
  reason: string;
}

export type TraverseStatus = "loading" | "ready" | "unavailable";

export interface TraverseLayerOptions {
  /** Draw this document instead of fetching the traverse asset. */
  geojson?: TraverseGeoJson;
  /** Fetch the asset's JSON; default `fetch`, same origin. */
  fetchJson?: (url: string) => Promise<unknown>;
  readToken?: TokenReader;
  onSelectPoint?: (info: TraversePointInfo | null) => void;
  initialVisible?: boolean;
  initialOpacity?: number;
}

/** The pointer events of the map handle's OpenLayers map that the layer listens to (C10: `getMap` is untyped). */
interface PointerSource {
  on(type: "pointermove" | "singleclick", listener: (event: { coordinate: number[] }) => void): unknown;
  un(type: "pointermove" | "singleclick", listener: (event: { coordinate: number[] }) => void): void;
}

export interface TraverseLayerController {
  layer: VectorLayer<VectorSource>;
  getStatus(): TraverseStatus;
  /** Resolves when the asset has been drawn or has failed; never rejects. */
  ready(): Promise<void>;
  skipped(): readonly TraverseSkip[];
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  setOpacity(opacity: number): void;
  getOpacity(): number;
  getPointFeatures(): Feature<Point>[];
  /** Mark the point within `toleranceM` of `coord` as hovered (its sol label shows); null clears it. */
  setHover(coord: [number, number] | null, toleranceM?: number): void;
  getHoverLabel(coord: [number, number], toleranceM?: number): string | null;
  getPointInfoAt(coord: [number, number], toleranceM?: number): TraversePointInfo | null;
  /** Select the point at `coord` (or none), report it through `onSelectPoint` and return it. */
  selectPointAt(coord: [number, number], toleranceM?: number): TraversePointInfo | null;
  /** Hover and click handling on the map handle's map; returns the detach function. */
  attach(handle: Pick<MapHandle, "getMap" | "getResolution">): () => void;
  destroy(): void;
}

/** How close, in metres, a position must be to a point to hit it when the caller gives no tolerance. */
export const DEFAULT_HIT_TOLERANCE_M = 25;
/** Pointer tolerance for `attach`, screen pixels (the marker is 4 px in radius). */
export const HIT_TOLERANCE_PX = 10;

/** Line and marker geometry of the 04 §C.5 "thin dashed" style. */
const LINE_WIDTH_PX = 1.5;
const LINE_DASH_PX = [6, 6];
const MARKER_RADIUS_PX = 4;
const LABEL_OFFSET_Y_PX = -12;
/** 04 §C.1: the traverse is `--traverse` at 60 %. */
const LINE_OPACITY = 0.6;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isXY = (v: unknown): v is [number, number] => Array.isArray(v) && v.length >= 2 && isFiniteNumber(v[0]) && isFiniteNumber(v[1]);
const isProvenance = (v: unknown): v is Provenance => typeof v === "string" && (PROVENANCE_VALUES as readonly string[]).includes(v);

/** The `TraversePoint` of a feature's properties, or why it cannot be one. */
function readPoint(props: Record<string, unknown>, site: LoadedSite): TraversePoint | string {
  if (!isFiniteNumber(props.sol)) return "sol is not a finite number";
  if (typeof props.source_id !== "string" || props.source_id === "") return "source_id is missing";
  if (!site.sources.has(props.source_id)) return `source_id ${JSON.stringify(props.source_id)} is not a source of the manifest`;
  const point: TraversePoint = { sol: props.sol, source_id: props.source_id };
  if (typeof props.site_drive === "string") point.site_drive = props.site_drive;
  if (isFiniteNumber(props.lat)) point.lat = props.lat;
  if (isFiniteNumber(props.lon_e)) point.lon_e = props.lon_e;
  if (isFiniteNumber(props.elevation_m)) point.elevation_m = props.elevation_m;
  return point;
}

/**
 * Creates the Curiosity traverse layer and its controller. Throws when a design token is missing; a missing or
 * failing asset is a status, not an error.
 */
export function createTraverseLayer(site: LoadedSite, options: TraverseLayerOptions = {}): TraverseLayerController {
  const read = options.readToken ?? readCssToken;

  const lineStyle = new Style({
    stroke: new Stroke({ color: colourToken(read, "--traverse", LINE_OPACITY), width: LINE_WIDTH_PX, lineDash: LINE_DASH_PX }),
  });
  const markerImage = new CircleStyle({
    radius: MARKER_RADIUS_PX,
    fill: new Fill({ color: colourToken(read, "--traverse") }),
    stroke: new Stroke({ color: colourToken(read, "--void"), width: 1 }),
  });
  const markerStyle = new Style({ image: markerImage });
  const labelFont = `${pxToken(read, "--text-micro")}px ${requireToken(read, "--font-mono")}`;
  const labelFill = new Fill({ color: colourToken(read, "--text-1") });
  const labelStroke = new Stroke({ color: colourToken(read, "--void"), width: 3 });

  const source = new VectorSource();
  const points: Feature<Point>[] = [];
  const infos = new WeakMap<Feature, TraversePointInfo>();
  const skips: TraverseSkip[] = [];
  const labelStyles = new WeakMap<Feature, Style>();
  let hovered: Feature | null = null;

  const layer = new VectorLayer({
    source,
    zIndex: LAYER_Z_INDEX.TRAVERSE,
    visible: options.initialVisible ?? true,
    opacity: options.initialOpacity ?? 1,
    style: (feature) => {
      const info = infos.get(feature as Feature);
      if (!info) return lineStyle;
      if (feature !== hovered) return markerStyle;
      let label = labelStyles.get(feature as Feature);
      if (!label) {
        label = new Style({
          image: markerImage,
          text: new Text({ text: `Sol ${info.point.sol}`, font: labelFont, fill: labelFill, stroke: labelStroke, offsetY: LABEL_OFFSET_Y_PX }),
        });
        labelStyles.set(feature as Feature, label);
      }
      return label;
    },
  });

  // The manifest layer that owns the traverse asset gives the class of every value (FR-15).
  const owner = site.site.layers.find((l) => l.asset_id === site.site.traverse_asset);

  function draw(document: TraverseGeoJson): void {
    document.features.forEach((feature, index) => {
      const props = feature.properties ?? {};
      if (feature.geometry.type === "LineString") {
        const coords = feature.geometry.coordinates;
        if (!Array.isArray(coords) || coords.length < 2 || !coords.every(isXY)) {
          skips.push({ index, reason: "line has fewer than two finite vertices" });
          return;
        }
        source.addFeature(new Feature({ geometry: new LineString(coords as [number, number][]) }));
      } else if (feature.geometry.type === "Point") {
        const point = readPoint(props, site);
        if (typeof point === "string") {
          skips.push({ index, reason: point });
          return;
        }
        const coords = feature.geometry.coordinates;
        if (!isXY(coords)) {
          skips.push({ index, reason: "coordinates are not two finite numbers" });
          return;
        }
        const provenance = owner?.provenance ?? (isProvenance(props.provenance) ? props.provenance : null);
        if (provenance === null) {
          skips.push({ index, reason: "no provenance class: no manifest layer owns the traverse asset and the feature has none" });
          return;
        }
        const marker = new Feature({ geometry: new Point([coords[0], coords[1]]) });
        infos.set(marker, { point, coordinates: [coords[0], coords[1]], provenance });
        source.addFeature(marker);
        points.push(marker);
      } else {
        skips.push({ index, reason: `geometry ${String((feature.geometry as { type: unknown }).type)} is not drawn` });
      }
    });
  }

  let status: TraverseStatus = "loading";
  let loading: Promise<void>;
  const asset = site.assets.get(site.site.traverse_asset);
  if (options.geojson) {
    draw(options.geojson);
    status = "ready";
    loading = Promise.resolve();
  } else if (!asset) {
    status = "unavailable";
    loading = Promise.resolve();
  } else {
    const fetchJson = options.fetchJson ?? (async (url: string): Promise<unknown> => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return response.json();
    });
    loading = fetchJson(asset.url).then(
      (json) => {
        const features = (json as { features?: unknown } | null)?.features;
        if (!Array.isArray(features)) {
          status = "unavailable";
          return;
        }
        draw(json as TraverseGeoJson);
        status = "ready";
      },
      () => {
        status = "unavailable";
      },
    );
  }

  function nearest(coord: [number, number], toleranceM: number): Feature<Point> | null {
    let best: Feature<Point> | null = null;
    let bestDistance = Infinity;
    for (const marker of points) {
      const at = marker.getGeometry()!.getCoordinates();
      const distance = Math.hypot(at[0] - coord[0], at[1] - coord[1]);
      if (distance <= toleranceM && distance < bestDistance) {
        best = marker;
        bestDistance = distance;
      }
    }
    return best;
  }

  const infoAt = (coord: [number, number], toleranceM: number): TraversePointInfo | null => {
    const hit = nearest(coord, toleranceM);
    return hit ? (infos.get(hit) ?? null) : null;
  };

  const detachers = new Set<() => void>();
  let destroyed = false;

  return {
    layer,
    getStatus: () => status,
    ready: () => loading,
    skipped: () => skips,
    setVisible: (visible) => layer.setVisible(visible),
    isVisible: () => layer.getVisible(),
    setOpacity: (opacity) => layer.setOpacity(opacity),
    getOpacity: () => layer.getOpacity(),
    getPointFeatures: () => points,

    setHover(coord, toleranceM = DEFAULT_HIT_TOLERANCE_M) {
      const next = coord ? nearest(coord, toleranceM) : null;
      if (next === hovered) return;
      hovered = next;
      layer.changed();
    },

    getHoverLabel(coord, toleranceM = DEFAULT_HIT_TOLERANCE_M) {
      const info = infoAt(coord, toleranceM);
      return info ? `Sol ${info.point.sol}` : null;
    },

    getPointInfoAt: (coord, toleranceM = DEFAULT_HIT_TOLERANCE_M) => infoAt(coord, toleranceM),

    selectPointAt(coord, toleranceM = DEFAULT_HIT_TOLERANCE_M) {
      const info = infoAt(coord, toleranceM);
      options.onSelectPoint?.(info);
      return info;
    },

    attach(handle) {
      const map = handle.getMap<PointerSource>();
      const tolerance = (): number => HIT_TOLERANCE_PX * (handle.getResolution() ?? 1);
      const onMove = (event: { coordinate: number[] }): void => {
        this.setHover([event.coordinate[0], event.coordinate[1]], tolerance());
      };
      const onClick = (event: { coordinate: number[] }): void => {
        this.selectPointAt([event.coordinate[0], event.coordinate[1]], tolerance());
      };
      map.on("pointermove", onMove);
      map.on("singleclick", onClick);
      const detach = (): void => {
        map.un("pointermove", onMove);
        map.un("singleclick", onClick);
        detachers.delete(detach);
      };
      detachers.add(detach);
      return detach;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const detach of [...detachers]) detach();
      hovered = null;
      points.length = 0;
      source.clear();
      layer.dispose();
    },
  };
}

/**
 * A selected point's sol and source as a small element of text nodes. Every row carries `data-provenance` and the
 * point's `source_id` as `data-source` (FR-15); optional fields appear only when the point has them.
 */
export function traverseInfoElement(info: TraversePointInfo, site: LoadedSite): HTMLElement {
  const root = document.createElement("div");
  root.setAttribute("data-testid", "traverse-info");
  const { point } = info;
  const sourced = { prov: info.provenance, src: point.source_id } as const;
  const row = (field: string, text: string): void => {
    const el = document.createElement("div");
    el.setAttribute("data-field", field);
    for (const [key, value] of Object.entries(provAttrs(sourced))) el.setAttribute(key, value);
    el.textContent = text;
    root.appendChild(el);
  };
  row("sol", `Sol ${point.sol}`);
  row("source", site.sources.get(point.source_id)?.title ?? point.source_id);
  if (point.site_drive !== undefined) row("site_drive", `Site/drive ${point.site_drive}`);
  if (point.lat !== undefined && point.lon_e !== undefined) {
    row("position", `${point.lat < 0 ? "−" : ""}${Math.abs(point.lat).toFixed(5)}°, ${point.lon_e.toFixed(5)}°E`);
  }
  if (point.elevation_m !== undefined) row("elevation", `${point.elevation_m.toFixed(1)} m`);
  return root;
}
