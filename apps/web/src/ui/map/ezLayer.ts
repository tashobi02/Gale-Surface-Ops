/**
 * Exploration Zone layer: the POIs by stop type (T07.18; FR-45, 01 §A.4, 04 §A.3 #1 and #2, §C.1, §C.3).
 *
 * - One small marker per POI of the boot lookup map, drawn just under the POI pin at the C10 EZ slot, whose SHAPE and WORD say
 *   the POI's `stop_type`: science is a triangle labelled SCIENCE, resource a square labelled RESOURCE, engineering a hexagon
 *   labelled ENGINEERING. The legend (`legend()`, shown by SCR-03) lists the same three. Colour is neutral chrome (`--text-1`
 *   on a `--void` outline): status colours mean status only, and a stop type is not a status.
 * - A POI whose `stop_type` is not one of the three, or whose coordinates are not two finite numbers, is skipped and listed
 *   in `skipped()`; no type is guessed. Design tokens are read and checked once when the layer is created and a missing one
 *   throws naming it (FD-065).
 * - Projected metres only; never EPSG:3857, WGS84 or `ol/sphere` (02 §C.4.2).
 */
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Fill from "ol/style/Fill.js";
import RegularShape from "ol/style/RegularShape.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import Text from "ol/style/Text.js";
import type { POI } from "@marswalk/protocol";
import { LAYER_Z_INDEX, type LoadedSite } from "../context";
import { colourToken, pxToken, readCssToken, requireToken, type TokenReader } from "./mapTokens";

export type EzStopType = POI["stop_type"];
export type EzShape = "triangle" | "square" | "hexagon";

export interface EzStopTypeInfo {
  word: string;
  shape: EzShape;
  /** Corners of the OpenLayers `RegularShape`, and its rotation in radians (a square is turned to stand on a side). */
  points: number;
  angle: number;
  /** Plain description for the legend's accessible name. */
  description: string;
}

/** The three stop types of 01 §A.4, each with its own shape and word. */
export const EZ_STOP_TYPES: Readonly<Record<EzStopType, EzStopTypeInfo>> = {
  science: { word: "SCIENCE", shape: "triangle", points: 3, angle: 0, description: "science stop" },
  resource: { word: "RESOURCE", shape: "square", points: 4, angle: Math.PI / 4, description: "resource stop" },
  engineering: { word: "ENGINEERING", shape: "hexagon", points: 6, angle: 0, description: "engineering stop" },
};

export interface EzLegendEntry {
  stopType: EzStopType;
  word: string;
  shape: EzShape;
  description: string;
}

export interface EzSkip {
  poi_id: string;
  reason: string;
}

export interface EzLayerOptions {
  initialVisible?: boolean;
  readToken?: TokenReader;
}

export interface EzLayerController {
  layer: VectorLayer<VectorSource>;
  /** The three stop types with their shape and word, in the order science, resource, engineering. */
  legend(): EzLegendEntry[];
  skipped(): readonly EzSkip[];
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  destroy(): void;
}

/** Marker radius, px: smaller than the 24 px POI pin it annotates (04 §C.3). */
const MARKER_RADIUS_PX = 7;
const OUTLINE_PX = 2;
/** The marker sits below the pin; the word sits below the marker. */
const MARKER_OFFSET_Y_PX = 22;
const WORD_OFFSET_Y_PX = 38;

const isXY = (v: unknown): v is [number, number] => Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
const isStopType = (v: unknown): v is EzStopType => typeof v === "string" && Object.prototype.hasOwnProperty.call(EZ_STOP_TYPES, v);

/** Creates the EZ vector layer and its controller. Throws when a design token is missing. */
export function createEzLayer(site: LoadedSite, options: EzLayerOptions = {}): EzLayerController {
  const read = options.readToken ?? readCssToken;
  const ink = colourToken(read, "--text-1");
  const outline = colourToken(read, "--void");
  const font = `${pxToken(read, "--text-micro")}px ${requireToken(read, "--font-mono")}`;

  const styles = new Map<EzStopType, Style[]>();
  for (const [type, info] of Object.entries(EZ_STOP_TYPES) as [EzStopType, EzStopTypeInfo][]) {
    styles.set(type, [
      new Style({
        image: new RegularShape({
          points: info.points,
          radius: MARKER_RADIUS_PX,
          angle: info.angle,
          fill: new Fill({ color: ink }),
          stroke: new Stroke({ color: outline, width: OUTLINE_PX }),
          displacement: [0, -MARKER_OFFSET_Y_PX],
        }),
        text: new Text({
          text: info.word,
          font,
          fill: new Fill({ color: ink }),
          stroke: new Stroke({ color: outline, width: 3 }),
          offsetY: WORD_OFFSET_Y_PX,
        }),
      }),
    ]);
  }

  const source = new VectorSource();
  const skips: EzSkip[] = [];
  for (const [id, poi] of site.pois) {
    const coords = poi.geometry?.coordinates;
    if (!isXY(coords)) {
      skips.push({ poi_id: id, reason: "coordinates are not two finite numbers" });
      continue;
    }
    const type = poi.properties.stop_type;
    if (!isStopType(type)) {
      skips.push({ poi_id: id, reason: "stop_type is not science, resource or engineering" });
      continue;
    }
    source.addFeature(new Feature({ geometry: new Point([coords[0], coords[1]]), poi_id: id, stop_type: type }));
  }

  const layer = new VectorLayer({
    source,
    zIndex: LAYER_Z_INDEX.EZ,
    visible: options.initialVisible ?? true,
    style: (feature) => styles.get(feature.get("stop_type") as EzStopType),
  });

  let destroyed = false;
  return {
    layer,
    legend: () => (Object.keys(EZ_STOP_TYPES) as EzStopType[]).map((stopType) => ({ stopType, word: EZ_STOP_TYPES[stopType].word, shape: EZ_STOP_TYPES[stopType].shape, description: EZ_STOP_TYPES[stopType].description })),
    skipped: () => skips,
    setVisible: (visible) => layer.setVisible(visible),
    isVisible: () => layer.getVisible(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      source.clear();
      layer.dispose();
    },
  };
}
