/**
 * POI layer and selection (01 FR-04, 03 SCR-06, 04 §C.3, 04 §C.5).
 * Implemented by T07.11.
 *
 * - Renders 24 px POI markers in local Mars working-projection metres (+proj=eqc).
 * - Marker states (04 §C.5):
 *     default: white pin (#E8EDF2) with bg (#0B0D10) outline.
 *     hover: name label shown.
 *     selected: accent pin (#4CC9F0) with bg outline; opens SCR-06 in right drawer.
 * - Offers selectPoi() for keyboard controls (T13.06).
 * - Exposes show/hide API for SCR-03.
 *
 * CRS GUARD: Working-projection metres only.
 * Never uses EPSG:3857, WGS84, or ol/sphere (02 §C.4.2).
 */

import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import Text from "ol/style/Text.js";
import type { POIFeature } from "@marswalk/protocol";

export type { POIFeature };

/** C10 layer stack slot for POIs (FR-02 fixed order: top layer). */
export const POI_Z_INDEX = 60;

// Visual tokens from 04 §C.1, 04 §C.5 and tokens.css
const COLOR_WHITE_PIN = "#E8EDF2";
const COLOR_ACCENT_PIN = "#4CC9F0";
const COLOR_VOID = "#0B0D10";
const COLOR_TEXT = "#E8EDF2";

export interface PoiLayerOptions {
  onSelectPoi?: (poiId: string | null) => void;
  planStore?: {
    selectWaypoint?: (id: string | null) => void;
    [key: string]: unknown;
  };
  initialVisible?: boolean;
}

export interface PoiLayerController {
  layer: VectorLayer<VectorSource>;
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  selectPoi(poiId: string | null): void;
  getSelectedPoiId(): string | null;
  getHoverLabel(coord: [number, number], toleranceM?: number): string | null;
  getPoiAt(coord: [number, number], toleranceM?: number): POIFeature | null;
  destroy(): void;
}

/**
 * 24 px POI pin marker style per 04 §C.3 & §C.5.
 * Default: 24 px diameter (radius 12), white with bg outline.
 * Selected: accent color with bg outline.
 */
function createPoiStyle(name: string, isSelected: boolean, showLabel = false): Style {
  return new Style({
    image: new CircleStyle({
      radius: 12, // 24 px marker diameter (04 §C.3)
      fill: new Fill({ color: isSelected ? COLOR_ACCENT_PIN : COLOR_WHITE_PIN }),
      stroke: new Stroke({ color: COLOR_VOID, width: 2 }),
    }),
    text: showLabel
      ? new Text({
          text: name,
          font: '12px "IBM Plex Mono", ui-monospace, monospace',
          fill: new Fill({ color: COLOR_TEXT }),
          stroke: new Stroke({ color: COLOR_VOID, width: 3 }),
          offsetY: -18,
        })
      : undefined,
  });
}

/**
 * Creates the POI vector layer and its controller (T07.11).
 *
 * @param pois Array or Map of POIFeature objects from the site manifest / boot lookup.
 * @param options Configuration for selection callbacks and plan store binding.
 */
export function createPoiLayer(
  pois: POIFeature[] | Map<string, POIFeature>,
  options: PoiLayerOptions = {}
): PoiLayerController {
  const source = new VectorSource();
  const poiFeatures = new Map<string, { feature: Feature<Point>; data: POIFeature }>();
  let selectedPoiId: string | null = null;

  const poiList = pois instanceof Map ? Array.from(pois.values()) : pois;

  for (const poi of poiList) {
    const coords = poi.geometry.coordinates as [number, number];
    const geom = new Point(coords);
    const feature = new Feature({
      geometry: geom,
      ...poi.properties,
    });

    feature.setStyle(createPoiStyle(poi.properties.name, false, true));
    source.addFeature(feature);
    poiFeatures.set(poi.properties.poi_id, { feature, data: poi });
  }

  const layer = new VectorLayer({
    source,
    zIndex: POI_Z_INDEX,
    visible: options.initialVisible ?? true,
  });

  function updateStyles(): void {
    for (const [id, { feature, data }] of poiFeatures.entries()) {
      const isSelected = id === selectedPoiId;
      feature.setStyle(createPoiStyle(data.properties.name, isSelected, true));
    }
  }

  function findNearestPoi(
    coord: [number, number],
    toleranceM = 25
  ): { poi: POIFeature; distance: number } | null {
    let best: { poi: POIFeature; distance: number } | null = null;
    for (const { data } of poiFeatures.values()) {
      const pt = data.geometry.coordinates as [number, number];
      const dx = pt[0] - coord[0];
      const dy = pt[1] - coord[1];
      const dist = Math.hypot(dx, dy);
      if (dist <= toleranceM) {
        if (!best || dist < best.distance) {
          best = { poi: data, distance: dist };
        }
      }
    }
    return best;
  }

  function selectPoi(poiId: string | null): void {
    selectedPoiId = poiId;
    updateStyles();

    // Notify caller callback (03 SCR-06 opens right drawer)
    if (options.onSelectPoi) {
      options.onSelectPoi(poiId);
    }

    // Record in plan-store selection if available (C11)
    if (options.planStore && typeof options.planStore.selectWaypoint === "function") {
      options.planStore.selectWaypoint(poiId);
    }
  }

  return {
    layer,

    setVisible(visible: boolean): void {
      layer.setVisible(visible);
    },

    isVisible(): boolean {
      return layer.getVisible();
    },

    selectPoi,

    getSelectedPoiId(): string | null {
      return selectedPoiId;
    },

    getHoverLabel(coord: [number, number], toleranceM = 25): string | null {
      const match = findNearestPoi(coord, toleranceM);
      return match ? match.poi.properties.name : null;
    },

    getPoiAt(coord: [number, number], toleranceM = 25): POIFeature | null {
      const match = findNearestPoi(coord, toleranceM);
      return match ? match.poi : null;
    },

    destroy(): void {
      source.clear();
      poiFeatures.clear();
    },
  };
}
