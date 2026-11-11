/**
 * POI layer and selection (T07.11; FR-04, 03 SCR-06, 04 §A.3 #9, §C.3, §C.5, §F).
 *
 * - One 24 px marker per POI of the boot lookup map (`site.pois`), in working-projection metres at the C10 POI slot.
 *   States (04 §C.5): default white pin (`--text-1`) with a `--void` outline; hover shows the name; selected is a
 *   `--route` pin with a thicker `--text-1` ring and its name (selection is never by colour alone); keyboard focus adds
 *   the white 2 px ring with a 2 px `--void` gap. Colours, font and size are design tokens read at run time
 *   (mapTokens.ts); a missing token throws. A POI with bad coordinates is skipped and listed.
 * - Selection is its own: `selectPoi(id)` records the selected POI and calls `onSelectPoi(poi_id | null)`; it never
 *   touches the plan store's waypoint selection (a POI id is not a waypoint id). TODO(decision): C11 has no POI
 *   selection yet (planStore.ts header; consumers T10.01 opens SCR-06 from it, T13.06): the caller wires
 *   `onSelectPoi` to wherever that lands. Selecting an id that is not a POI of the site does nothing.
 * - Keyboard path: a canvas marker cannot take focus, so the layer also builds `listElement`, a list with one real
 *   button per POI (Tab reaches it, Enter and Space select). It is visually hidden until a button has focus, then
 *   shows as a panel; focusing a button shows that POI's name and focus ring on the map. `attach(handle)` mounts the
 *   list in the map's focusable element and wires pointer hover and click.
 * - Show/hide for the SCR-03 POI row: `setVisible`, `isVisible`.
 *
 * CRS: projected metres only; never EPSG:3857, WGS84 or `ol/sphere` (02 §C.4.2).
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
import { LAYER_Z_INDEX, type LoadedSite, type MapHandle } from "../context";
import { colourToken, pxToken, readCssToken, requireToken, type TokenReader } from "./mapTokens";

export type { POIFeature };

export interface PoiLayerOptions {
  /** Called with the selected `poi_id`, or null when the selection is cleared (C11 POI selection: TODO(decision)). */
  onSelectPoi?: (poiId: string | null) => void;
  initialVisible?: boolean;
  readToken?: TokenReader;
}

export interface PoiSkip {
  poi_id: string;
  reason: string;
}

/** The pointer events of the map handle's OpenLayers map that the layer listens to (C10: `getMap` is untyped). */
interface PointerSource {
  on(type: "pointermove" | "singleclick", listener: (event: { coordinate: number[] }) => void): unknown;
  un(type: "pointermove" | "singleclick", listener: (event: { coordinate: number[] }) => void): void;
}

export interface PoiLayerController {
  layer: VectorLayer<VectorSource>;
  /** One button per POI: the keyboard path (see the header). Mount it with `attach`, or place it yourself. */
  listElement: HTMLElement;
  skipped(): readonly PoiSkip[];
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  /** Select a POI (or clear with null). Returns false, doing nothing, for an id that is not a POI of the site. */
  selectPoi(poiId: string | null): boolean;
  getSelectedPoiId(): string | null;
  /** Show the POI's name on the map as if hovered; null clears. */
  setHover(poiId: string | null): void;
  getHoverLabel(coord: [number, number], toleranceM?: number): string | null;
  getPoiAt(coord: [number, number], toleranceM?: number): POIFeature | null;
  /** Mount the keyboard list in the map's focusable element and wire pointer hover and click; returns the detach. */
  attach(handle: Pick<MapHandle, "getMap" | "getResolution" | "getTargetElement">): () => void;
  destroy(): void;
}

/** 04 §C.3: POI markers are 24 px. */
const MARKER_DIAMETER_PX = 24;
const MARKER_RADIUS_PX = MARKER_DIAMETER_PX / 2;
const OUTLINE_PX = 2;
/** The selected ring is one pixel thicker than the outline. */
const SELECTED_OUTLINE_PX = OUTLINE_PX + 1;
/** Focus ring (04 §C.1 `focus`): white 2 px with a 2 px `--void` gap. */
const FOCUS_RING_PX = 2;
const FOCUS_GAP_PX = 2;
const LABEL_OFFSET_Y_PX = -(MARKER_RADIUS_PX + 6);
/** How close, in metres, a position must be to a marker when the caller gives no tolerance. */
const DEFAULT_HIT_TOLERANCE_M = 25;

const isXY = (v: unknown): v is [number, number] => Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);

const HIDDEN_LIST = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0";
const SHOWN_LIST = [
  "position:absolute",
  "top:8px",
  "left:8px",
  "z-index:10",
  "margin:0",
  "padding:8px",
  "list-style:none",
  "background:var(--panel)",
  "border:1px solid var(--edge)",
  "color:var(--text-1)",
  "font-family:var(--font-mono)",
  "font-size:var(--text-micro)",
].join(";");

/**
 * Creates the POI vector layer and its controller. Throws when a design token is missing.
 */
export function createPoiLayer(site: LoadedSite, options: PoiLayerOptions = {}): PoiLayerController {
  const read = options.readToken ?? readCssToken;
  const whitePin = colourToken(read, "--text-1");
  const voidColour = colourToken(read, "--void");
  const routeColour = colourToken(read, "--route");
  const labelFont = `${pxToken(read, "--text-micro")}px ${requireToken(read, "--font-mono")}`;

  const marker = (fill: string, ring: string, ringWidth: number): CircleStyle =>
    new CircleStyle({ radius: MARKER_RADIUS_PX, fill: new Fill({ color: fill }), stroke: new Stroke({ color: ring, width: ringWidth }) });
  const defaultMarker = marker(whitePin, voidColour, OUTLINE_PX);
  const selectedMarker = marker(routeColour, whitePin, SELECTED_OUTLINE_PX);
  const label = (name: string): Text =>
    new Text({ text: name, font: labelFont, fill: new Fill({ color: whitePin }), stroke: new Stroke({ color: voidColour, width: 3 }), offsetY: LABEL_OFFSET_Y_PX });
  const focusRings = [
    new Style({ image: new CircleStyle({ radius: MARKER_RADIUS_PX + FOCUS_GAP_PX / 2, stroke: new Stroke({ color: voidColour, width: FOCUS_GAP_PX }) }) }),
    new Style({ image: new CircleStyle({ radius: MARKER_RADIUS_PX + FOCUS_GAP_PX + FOCUS_RING_PX / 2, stroke: new Stroke({ color: whitePin, width: FOCUS_RING_PX }) }) }),
  ];

  const source = new VectorSource();
  const pois = new Map<string, POIFeature>();
  const features = new Map<string, Feature<Point>>();
  const skips: PoiSkip[] = [];
  let selected: string | null = null;
  let hovered: string | null = null;
  let focused: string | null = null;

  for (const [id, poi] of site.pois) {
    const coords = poi.geometry?.coordinates;
    if (!isXY(coords)) {
      skips.push({ poi_id: id, reason: "coordinates are not two finite numbers" });
      continue;
    }
    const feature = new Feature({ geometry: new Point([coords[0], coords[1]]), poi_id: id });
    source.addFeature(feature);
    pois.set(id, poi);
    features.set(id, feature);
  }

  const layer = new VectorLayer({
    source,
    zIndex: LAYER_Z_INDEX.POIS,
    visible: options.initialVisible ?? true,
    style: (feature) => {
      const id = feature.get("poi_id") as string;
      const isSelected = id === selected;
      const named = isSelected || id === hovered || id === focused;
      const base = new Style({
        image: isSelected ? selectedMarker : defaultMarker,
        text: named ? label(pois.get(id)!.properties.name) : undefined,
      });
      return id === focused ? [base, ...focusRings] : [base];
    },
  });

  function nearest(coord: [number, number], toleranceM: number): POIFeature | null {
    let best: POIFeature | null = null;
    let bestDistance = Infinity;
    for (const [id, poi] of pois) {
      const at = features.get(id)!.getGeometry()!.getCoordinates();
      const distance = Math.hypot(at[0] - coord[0], at[1] - coord[1]);
      if (distance <= toleranceM && distance < bestDistance) {
        best = poi;
        bestDistance = distance;
      }
    }
    return best;
  }

  // --- the keyboard list -------------------------------------------------------------------------------------
  const list = document.createElement("ul");
  list.setAttribute("aria-label", "Points of interest");
  list.style.cssText = HIDDEN_LIST;
  const buttons = new Map<string, HTMLButtonElement>();
  for (const [id, poi] of pois) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.poiId = id;
    button.textContent = poi.properties.name;
    button.setAttribute("aria-pressed", "false");
    button.style.cssText = [
      "min-height:var(--target-mouse)",
      "padding:4px 8px",
      "background:var(--raised)",
      "color:var(--text-1)",
      "border:2px solid var(--edge)",
      "font:inherit",
      "cursor:pointer",
    ].join(";");
    button.addEventListener("focus", () => {
      button.style.boxShadow = "var(--focus-ring)";
      setFocus(id);
    });
    button.addEventListener("blur", () => {
      button.style.boxShadow = "";
      setFocus(null);
    });
    button.addEventListener("click", () => {
      selectPoi(id);
    });
    item.appendChild(button);
    list.appendChild(item);
    buttons.set(id, button);
  }
  list.addEventListener("focusin", () => {
    list.style.cssText = SHOWN_LIST;
  });
  list.addEventListener("focusout", (event) => {
    const next = (event as FocusEvent).relatedTarget;
    if (!(next instanceof Node) || !list.contains(next)) list.style.cssText = HIDDEN_LIST;
  });

  function setFocus(id: string | null): void {
    if (id === focused) return;
    focused = id;
    layer.changed();
  }

  function selectPoi(id: string | null): boolean {
    if (id !== null && !pois.has(id)) return false;
    if (id === selected) return true;
    selected = id;
    for (const [poiId, button] of buttons) button.setAttribute("aria-pressed", String(poiId === id));
    layer.changed();
    options.onSelectPoi?.(id);
    return true;
  }

  const detachers = new Set<() => void>();
  let destroyed = false;

  return {
    layer,
    listElement: list,
    skipped: () => skips,
    setVisible: (visible) => layer.setVisible(visible),
    isVisible: () => layer.getVisible(),
    selectPoi,
    getSelectedPoiId: () => selected,

    setHover(id) {
      const next = id !== null && pois.has(id) ? id : null;
      if (next === hovered) return;
      hovered = next;
      layer.changed();
    },

    getHoverLabel(coord, toleranceM = DEFAULT_HIT_TOLERANCE_M) {
      return nearest(coord, toleranceM)?.properties.name ?? null;
    },

    getPoiAt: (coord, toleranceM = DEFAULT_HIT_TOLERANCE_M) => nearest(coord, toleranceM),

    attach(handle) {
      const map = handle.getMap<PointerSource>();
      const tolerance = (): number => MARKER_RADIUS_PX * (handle.getResolution() ?? 1);
      const onMove = (event: { coordinate: number[] }): void => {
        this.setHover(nearest([event.coordinate[0], event.coordinate[1]], tolerance())?.properties.poi_id ?? null);
      };
      const onClick = (event: { coordinate: number[] }): void => {
        const hit = nearest([event.coordinate[0], event.coordinate[1]], tolerance());
        if (hit) selectPoi(hit.properties.poi_id);
      };
      map.on("pointermove", onMove);
      map.on("singleclick", onClick);
      const host = handle.getTargetElement();
      host.appendChild(list);
      const detach = (): void => {
        map.un("pointermove", onMove);
        map.un("singleclick", onClick);
        if (list.parentElement === host) host.removeChild(list);
        detachers.delete(detach);
      };
      detachers.add(detach);
      return detach;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const detach of [...detachers]) detach();
      list.remove();
      source.clear();
      pois.clear();
      features.clear();
      layer.dispose();
    },
  };
}
