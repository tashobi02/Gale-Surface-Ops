/**
 * Curiosity traverse layer (01 FR-17, 02 §E.1, 04 §C.5, 05 §C TraversePoint).
 * Implemented by T07.10.
 *
 * - Loads the manifest traverse GeoJSON in local Mars working-projection metres.
 * - Styles the traverse polyline per 04 §C.5: thin #E8EDF2 line at 60 % opacity, dashed.
 * - Waypoint points carry sol labels on hover.
 * - Clicking a traverse waypoint provides sol and source metadata with provenance 'measured' (01 FR-17).
 * - Exposes show/hide and opacity API matching raster layers for SCR-03.
 *
 * CRS GUARD: Working-projection metres only (+proj=eqc).
 * Never uses EPSG:3857, WGS84, or ol/sphere (02 §C.4.2).
 */

import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import LineString from "ol/geom/LineString.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import Text from "ol/style/Text.js";
import type { Provenance } from "@marswalk/protocol";

/** C10 layer stack slot for traverse layer (open point 7). */
export const TRAVERSE_Z_INDEX = 45;

/** Visual tokens from 04 §C.1, 04 §C.5 and tokens.css */
const COLOR_TRAVERSE_STROKE = "rgba(232, 237, 242, 0.6)"; // thin #E8EDF2 60%
const COLOR_POINT_FILL = "rgba(232, 237, 242, 0.85)";
const COLOR_VOID = "#0B0D10";
const COLOR_TEXT = "#E8EDF2";

export interface TraversePointProperties {
  sol?: number;
  source_id?: string;
  provenance?: Provenance;
  site_drive?: string;
  lat?: number;
  lon_e?: number;
  elevation_m?: number;
  note?: string;
  [key: string]: unknown;
}

export interface TraverseGeoJsonFeature {
  type: "Feature";
  geometry: {
    type: "Point" | "LineString";
    coordinates: [number, number] | [number, number][];
  };
  properties: TraversePointProperties;
}

export interface TraverseGeoJson {
  type: "FeatureCollection";
  features: TraverseGeoJsonFeature[];
}

export interface TraversePointInfo {
  sol: number;
  source_id: string;
  provenance: "measured";
  coordinates: [number, number];
  note?: string;
  site_drive?: string;
  elevation_m?: number;
}

export interface TraverseLayerOptions {
  onSelectPoint?: (info: TraversePointInfo | null) => void;
  initialVisible?: boolean;
  initialOpacity?: number;
}

export interface TraverseLayerController {
  layer: VectorLayer<VectorSource>;
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  setOpacity(opacity: number): void;
  getOpacity(): number;
  getPointFeatures(): Feature<Point>[];
  getHoverLabel(coord: [number, number], toleranceM?: number): string | null;
  getPointInfoAt(coord: [number, number], toleranceM?: number): TraversePointInfo | null;
  selectPointAt(coord: [number, number], toleranceM?: number): TraversePointInfo | null;
  destroy(): void;
}

/**
 * Creates the style for the traverse line:
 * thin #E8EDF2 60 % dashed (04 §C.5).
 */
function createLineStyle(): Style {
  return new Style({
    stroke: new Stroke({
      color: COLOR_TRAVERSE_STROKE,
      width: 1.5,
      lineDash: [6, 6],
    }),
  });
}

/**
 * Creates the style for a traverse point feature with optional sol label.
 */
function createPointStyle(sol?: number, showLabel = false): Style {
  return new Style({
    image: new CircleStyle({
      radius: 4,
      fill: new Fill({ color: COLOR_POINT_FILL }),
      stroke: new Stroke({ color: COLOR_VOID, width: 1 }),
    }),
    text: showLabel && sol !== undefined
      ? new Text({
          text: `Sol ${sol}`,
          font: '11px "IBM Plex Mono", ui-monospace, monospace',
          fill: new Fill({ color: COLOR_TEXT }),
          stroke: new Stroke({ color: COLOR_VOID, width: 3 }),
          offsetY: -12,
        })
      : undefined,
  });
}

/**
 * Creates the Curiosity traverse layer and its controller (T07.10).
 *
 * @param geojson GeoJSON feature collection containing Point and LineString features in projected metres.
 * @param options Optional configuration including point selection callback.
 */
export function createTraverseLayer(
  geojson: TraverseGeoJson,
  options: TraverseLayerOptions = {}
): TraverseLayerController {
  const source = new VectorSource();
  const pointFeatures: Feature<Point>[] = [];

  for (const featureData of geojson.features) {
    if (featureData.geometry.type === "LineString") {
      const coords = featureData.geometry.coordinates as [number, number][];
      const lineGeom = new LineString(coords);
      const feature = new Feature({
        geometry: lineGeom,
        ...featureData.properties,
      });
      feature.setStyle(createLineStyle());
      source.addFeature(feature);
    } else if (featureData.geometry.type === "Point") {
      const coords = featureData.geometry.coordinates as [number, number];
      const pointGeom = new Point(coords);
      const feature = new Feature({
        geometry: pointGeom,
        ...featureData.properties,
      });
      const sol = typeof featureData.properties?.sol === "number" ? featureData.properties.sol : undefined;
      feature.setStyle(createPointStyle(sol, true));
      source.addFeature(feature);
      pointFeatures.push(feature);
    }
  }

  const layer = new VectorLayer({
    source,
    zIndex: TRAVERSE_Z_INDEX,
    visible: options.initialVisible ?? true,
    opacity: options.initialOpacity ?? 1.0,
  });

  function findNearestPoint(coord: [number, number], toleranceM = 25): {
    feature: Feature<Point>;
    distance: number;
  } | null {
    let best: { feature: Feature<Point>; distance: number } | null = null;
    for (const pf of pointFeatures) {
      const pt = pf.getGeometry()?.getCoordinates();
      if (!pt) continue;
      const dx = pt[0] - coord[0];
      const dy = pt[1] - coord[1];
      const dist = Math.hypot(dx, dy);
      if (dist <= toleranceM) {
        if (!best || dist < best.distance) {
          best = { feature: pf, distance: dist };
        }
      }
    }
    return best;
  }

  function getPointInfo(feature: Feature<Point>): TraversePointInfo {
    const coords = (feature.getGeometry()?.getCoordinates() ?? [0, 0]) as [number, number];
    const sol = Number(feature.get("sol") ?? 0);
    const sourceId = String(feature.get("source_id") ?? "usgs-gale-dem-1m-v3");
    const note = feature.get("note") ? String(feature.get("note")) : undefined;
    const siteDrive = feature.get("site_drive") ? String(feature.get("site_drive")) : undefined;
    const elevationM = typeof feature.get("elevation_m") === "number" ? (feature.get("elevation_m") as number) : undefined;

    return {
      sol,
      source_id: sourceId,
      // 01 FR-17 & 05 §C: historical Curiosity traverse observations carry provenance 'measured'
      provenance: "measured",
      coordinates: coords,
      note,
      site_drive: siteDrive,
      elevation_m: elevationM,
    };
  }

  return {
    layer,

    setVisible(visible: boolean): void {
      layer.setVisible(visible);
    },

    isVisible(): boolean {
      return layer.getVisible();
    },

    setOpacity(opacity: number): void {
      layer.setOpacity(opacity);
    },

    getOpacity(): number {
      return layer.getOpacity();
    },

    getPointFeatures(): Feature<Point>[] {
      return pointFeatures;
    },

    getHoverLabel(coord: [number, number], toleranceM = 25): string | null {
      const match = findNearestPoint(coord, toleranceM);
      if (!match) return null;
      const sol = match.feature.get("sol");
      return sol !== undefined ? `Sol ${sol}` : null;
    },

    getPointInfoAt(coord: [number, number], toleranceM = 25): TraversePointInfo | null {
      const match = findNearestPoint(coord, toleranceM);
      if (!match) return null;
      return getPointInfo(match.feature);
    },

    selectPointAt(coord: [number, number], toleranceM = 25): TraversePointInfo | null {
      const match = findNearestPoint(coord, toleranceM);
      const info = match ? getPointInfo(match.feature) : null;
      if (options.onSelectPoint) {
        options.onSelectPoint(info);
      }
      return info;
    },

    destroy(): void {
      source.clear();
    },
  };
}
