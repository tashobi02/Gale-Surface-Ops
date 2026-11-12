/**
 * Waypoint markers and the one placement function (T08.06; 01 FR-06; 03 SCR-02, §C.3, §D; 04 §C.3, §C.5; FD-001, FD-112).
 *
 * Markers: the start is a square with its label; each stop is a 28 px numbered circle (the number follows the order, so a reorder
 * renumbers) in the `route` colour with a `void` number (`accent` is transparent in OPS, 04 §C.5). Hover adds a 2 px ring; the selected
 * stop gets a `--selection-width` outline in the `route` colour plus a small marker above it (selection is never colour alone);
 * a stop whose incoming leg has no route is a `warning`-outlined octagon (⬣). Colours and sizes are read from the design tokens.
 * Keyboard focus is carried by the stops list and the keyboard-move controls (a canvas marker cannot take focus). The layer is
 * kept in sync with the plan store; `setPreview` moves a marker during a drag without touching the store.
 *
 * `createPlacement` is the single placement function every path calls (map click, crosshair Enter, drag drop, long-press, POI,
 * keyboard move): it asks SAMPLE_POINT with the 50 m snap radius and the scenario's hard slope limit (FD-112), then
 * - outside the AOI: "Outside mapped area", nothing added (03 §D);
 * - passable: the stop is added (or moved) and selected;
 * - impassable with a snap within 50 m: "Not walkable here (slope 22.5° > 15.0° limit)" with the snapped position offered, two
 *   buttons: use it (the stop keeps `snapped_from`) or place elsewhere; without a snap, refused with the reason in words;
 * - a worker failure: nothing added, "Could not check this point. Try again.".
 * Slope and limit in the message are labelled values (`derived` from the slope layer's sources, `assumed` from the scenario). A newer
 * placement replaces a pending offer, and the older offer's buttons then do nothing. The notice is passed to `notify` (SCR-02 shows it
 * through the shared Notice, FD-115). Projected metres only; never EPSG:3857 or `ol/sphere` (02 §C.4).
 */
import { createElement as h, Fragment, type ReactNode } from "react";
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import RegularShape from "ol/style/RegularShape.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import Text from "ol/style/Text.js";
import type { NoRouteLeg, POIFeature, SampleResult, Waypoint } from "@marswalk/protocol";
import { MAX_STOPS, SNAP_RADIUS_M } from "@marswalk/compute";
import type { PlanState, PlanStore } from "../../state/planStore";
import { LAYER_Z_INDEX, type LoadedSite, type WorkerClient } from "../context";
import { formatNumber } from "../components/format";
import { provAttrs, type Sourced } from "../components/provenance";
import type { NoticeAction } from "../components/Notice";
import { colourToken, pxToken, readCssToken, requireToken } from "./mapTokens";
import "./waypointLayer.css";

// --- the placement function ---------------------------------------------------------------------------------------------

/** Where to place a stop: projected metres, and the POI it stands for (FD-001). */
export interface PlaceRequest {
  x_m: number;
  y_m: number;
  poi_id?: string;
  /** At most 40 characters (05 Waypoint). */
  label?: string;
}

export type PlaceOutcome = "placed" | "outside" | "offered" | "refused" | "unreadable";

export interface PlacementNotice {
  message: ReactNode;
  status: "caution" | "warning";
  actions?: NoticeAction[];
}

export interface Placement {
  /** Validate and add a stop (SAMPLE_POINT first). Never rejects. */
  place(request: PlaceRequest): Promise<PlaceOutcome>;
  /** Validate and move waypoint `id` to a point, like a drop. Never rejects. */
  move(id: string, x_m: number, y_m: number): Promise<PlaceOutcome>;
  /** The waypoint within `toleranceM` of `coord` (closest first), or null. */
  waypointNear(coord: [number, number], toleranceM: number): Waypoint | null;
  /** Drop any pending offer and clear the notice. */
  clear(): void;
}

export interface PlacementDeps {
  planStore: PlanStore;
  workerClient: Pick<WorkerClient, "samplePoint">;
  site: LoadedSite;
  /** Receives the notice to show, or null to clear it. */
  notify: (notice: PlacementNotice | null) => void;
}

/** The placement request for a POI pin: its own position, id and name (01 FR-06 "POI 'Add as stop'"). */
export function poiPlaceRequest(poi: POIFeature): PlaceRequest | null {
  const at = poi.geometry?.coordinates;
  if (!Array.isArray(at) || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) return null;
  return { x_m: at[0]!, y_m: at[1]!, poi_id: poi.properties.poi_id, label: poi.properties.name.slice(0, 40) };
}

const REASON_WORDS = { HARD_HAZARD: "hard hazard", NO_DATA: "no data" } as const;

export function createPlacement(deps: PlacementDeps): Placement {
  const { planStore, workerClient, site, notify } = deps;
  const instance = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 8);
  let seq = 0;
  let requests = 0;

  const slopeLayer = site.layers.get("slope");
  const slopeSource: Sourced = slopeLayer
    ? { prov: "derived", src: slopeLayer.source_ids.join(", ") }
    : { prov: "derived", src: "unavailable:layer.slope", unavailable: true };
  const labelled = (key: string, text: string, sourced: Sourced): ReactNode => h("span", { key, ...provAttrs(sourced) }, text);

  function reasonMessage(result: SampleResult, limitDeg: number): ReactNode {
    if (result.reason === "SLOPE_OVER_LIMIT" && typeof result.slope_p90_deg === "number") {
      return h(
        Fragment,
        null,
        "Not walkable here (slope ",
        labelled("s", `${formatNumber(result.slope_p90_deg, "°")}°`, slopeSource),
        " > ",
        labelled("l", `${formatNumber(limitDeg, "°")}°`, { prov: "assumed", src: "scenario.hard_slope_limit_deg" }),
        " limit)",
      );
    }
    const words = result.reason === "HARD_HAZARD" || result.reason === "NO_DATA" ? REASON_WORDS[result.reason] : "slope over the limit";
    return `Not walkable here (${words})`;
  }

  function stopCount(): number {
    return planStore.get().waypoints.filter((w) => w.role === "stop").length;
  }

  /** Sample a point; null when the worker failed. */
  async function sample(x_m: number, y_m: number): Promise<{ result: SampleResult; limit: number } | null> {
    requests += 1;
    const limit = planStore.get().scenario.hard_slope_limit_deg;
    try {
      const result = await workerClient.samplePoint({ request_id: `place-${instance}-${requests}`, x_m, y_m, snap_radius_m: SNAP_RADIUS_M, hard_slope_limit_deg: limit });
      return { result, limit };
    } catch {
      return null;
    }
  }

  /** The common flow: sample, then `commit(x, y, snappedFrom?)` for a passable point or an accepted snap. */
  async function validate(x_m: number, y_m: number, commit: (x: number, y: number, snappedFrom?: { x_m: number; y_m: number }) => void): Promise<PlaceOutcome> {
    seq += 1;
    const mine = seq;
    const sampled = await sample(x_m, y_m);
    if (mine !== seq) return "refused"; // a newer placement took over; it owns the notice
    if (!sampled) {
      notify({ message: "Could not check this point. Try again.", status: "caution" });
      return "unreadable";
    }
    const { result, limit } = sampled;
    if (!result.inside_aoi) {
      notify({ message: "Outside mapped area", status: "caution" });
      return "outside";
    }
    if (result.passable) {
      commit(x_m, y_m);
      notify(null);
      return "placed";
    }
    const snap = result.snap;
    if (snap && snap.distance_m <= SNAP_RADIUS_M) {
      const message = h(
        Fragment,
        null,
        reasonMessage(result, limit),
        ". Snapped position offered ",
        labelled("d", `${formatNumber(snap.distance_m, "m")} m`, slopeSource),
        " away.",
      );
      notify({
        message,
        status: "warning",
        actions: [
          {
            action: "accept-snap",
            label: "Use snapped position",
            onClick: () => {
              if (mine !== seq) return;
              commit(snap.x_m, snap.y_m, { x_m, y_m });
              notify(null);
            },
          },
          {
            action: "decline-snap",
            label: "Place elsewhere",
            onClick: () => {
              if (mine === seq) notify(null);
            },
          },
        ],
      });
      return "offered";
    }
    notify({ message: reasonMessage(result, limit), status: "warning" });
    return "refused";
  }

  return {
    async place(request) {
      if (stopCount() >= MAX_STOPS) {
        seq += 1;
        notify({ message: h(Fragment, null, "Stop limit reached (", labelled("n", String(MAX_STOPS), { prov: "assumed", src: "spec:02-E.3" }), " stops): delete one to add another."), status: "caution" });
        return "refused";
      }
      return validate(request.x_m, request.y_m, (x, y, snappedFrom) => {
        const wp: Waypoint = {
          id: "",
          role: "stop",
          x_m: x,
          y_m: y,
          ...(request.poi_id ? { poi_id: request.poi_id } : {}),
          ...(request.label ? { label: request.label.slice(0, 40) } : {}),
          ...(snappedFrom ? { snapped_from: snappedFrom } : {}),
        };
        const before = planStore.get().waypoints.length;
        planStore.addWaypoint(wp);
        const after = planStore.get().waypoints;
        if (after.length > before) planStore.selectWaypoint(after[after.length - 1]!.id);
      });
    },

    async move(id, x_m, y_m) {
      if (!planStore.get().waypoints.some((w) => w.id === id)) return "refused";
      return validate(x_m, y_m, (x, y, snappedFrom) => {
        if (snappedFrom) {
          planStore.setWaypoints(planStore.get().waypoints.map((w) => (w.id === id ? { ...w, x_m: x, y_m: y, snapped_from: snappedFrom } : w)));
        } else {
          planStore.moveWaypoint(id, x, y);
        }
        planStore.selectWaypoint(id);
      });
    },

    waypointNear(coord, toleranceM) {
      let best: Waypoint | null = null;
      let bestDistance = Infinity;
      for (const w of planStore.get().waypoints) {
        const d = Math.hypot(w.x_m - coord[0], w.y_m - coord[1]);
        if (d <= toleranceM && d < bestDistance) {
          best = w;
          bestDistance = d;
        }
      }
      return best;
    },

    clear() {
      seq += 1;
      notify(null);
    },
  };
}

// --- the markers --------------------------------------------------------------------------------------------------------

export interface WaypointPreview {
  id: string;
  /** Working-projection metres. */
  coord: [number, number];
}

export interface WaypointLayerController {
  layer: VectorLayer<VectorSource>;
  /** Show waypoint `id` at `coord` without touching the store (a drag in progress); null restores the store's position. */
  setPreview(preview: WaypointPreview | null): void;
  destroy(): void;
}

/** 04 §C.3: stop markers are 28 px. */
const STOP_DIAMETER_PX = 28;
const STOP_RADIUS_PX = STOP_DIAMETER_PX / 2;
const START_RADIUS_PX = 12;
const HOVER_RING_PX = 2;

/** Creates the waypoint layer on the plan store. Throws, naming it, when a design token is missing. */
export function createWaypointLayer(planStore: PlanStore): WaypointLayerController {
  const read = readCssToken;
  const route = colourToken(read, "--route");
  const voidColour = colourToken(read, "--void");
  const ink = colourToken(read, "--text-1");
  const warning = colourToken(read, "--warning");
  const selectionWidth = pxToken(read, "--selection-width");
  const font = `${pxToken(read, "--text-micro")}px ${requireToken(read, "--font-mono")}`;
  const numberFont = `700 ${pxToken(read, "--text-ui")}px ${requireToken(read, "--font-mono")}`;

  const source = new VectorSource();
  const features = new Map<string, Feature<Point>>();
  let preview: WaypointPreview | null = null;

  const noRoute = (state: PlanState, id: string): boolean =>
    (state.result?.legs ?? []).some((l): l is NoRouteLeg => l.status === "NO_ROUTE" && l.to === id);

  function coordOf(w: Waypoint): [number, number] {
    return preview && preview.id === w.id ? preview.coord : [w.x_m, w.y_m];
  }

  function sync(): void {
    const state = planStore.get();
    const ids = new Set(state.waypoints.map((w) => w.id));
    for (const [id, f] of features) {
      if (!ids.has(id)) {
        source.removeFeature(f);
        features.delete(id);
      }
    }
    for (const w of state.waypoints) {
      const at = coordOf(w);
      const existing = features.get(w.id);
      if (existing) {
        const g = existing.getGeometry()!;
        const now = g.getCoordinates();
        if (now[0] !== at[0] || now[1] !== at[1]) g.setCoordinates(at);
      } else {
        const f = new Feature({ geometry: new Point(at), waypoint_id: w.id });
        features.set(w.id, f);
        source.addFeature(f);
      }
    }
  }

  const text = (value: string, offsetY: number, fontSpec: string, fill: string): Text =>
    new Text({ text: value, font: fontSpec, fill: new Fill({ color: fill }), stroke: new Stroke({ color: voidColour, width: 3 }), offsetY });

  const octagon = (radius: number, stroke: Stroke, fill?: Fill): RegularShape =>
    new RegularShape({ points: 8, radius, angle: Math.PI / 8, stroke, ...(fill ? { fill } : {}) });

  const layer = new VectorLayer({
    source,
    zIndex: LAYER_Z_INDEX.WAYPOINTS,
    style: (feature) => {
      const state = planStore.get();
      const id = feature.get("waypoint_id") as string;
      const wp = state.waypoints.find((w) => w.id === id);
      if (!wp) return [];
      const selected = state.selected_waypoint_id === id;
      const hovered = state.hover?.waypoint_id === id;

      if (wp.role === "start") {
        const body = new Style({
          image: new RegularShape({ points: 4, radius: START_RADIUS_PX, angle: Math.PI / 4, fill: new Fill({ color: ink }), stroke: new Stroke({ color: voidColour, width: 2 }) }),
          text: text(wp.label ?? "Start", START_RADIUS_PX + 12, font, ink),
        });
        return selected ? [body, selectionRing(START_RADIUS_PX + 4)] : [body];
      }

      const number = String(state.waypoints.filter((w) => w.role === "stop").findIndex((w) => w.id === id) + 1);
      const blocked = noRoute(state, id);
      const body = new Style({
        image: blocked
          ? octagon(STOP_RADIUS_PX + 1, new Stroke({ color: warning, width: 3 }), new Fill({ color: route }))
          : new CircleStyle({ radius: STOP_RADIUS_PX, fill: new Fill({ color: route }), stroke: new Stroke({ color: voidColour, width: 2 }) }),
        text: text(number, 0, numberFont, voidColour),
      });
      const out = [body];
      if (hovered) out.push(new Style({ image: new CircleStyle({ radius: STOP_RADIUS_PX + HOVER_RING_PX, stroke: new Stroke({ color: ink, width: HOVER_RING_PX }) }) }));
      if (selected) {
        out.push(selectionRing(STOP_RADIUS_PX + selectionWidth));
        // The marker that keeps selection from being colour alone: a small triangle above the circle.
        out.push(new Style({ image: new RegularShape({ points: 3, radius: 6, angle: Math.PI, displacement: [0, STOP_RADIUS_PX + selectionWidth + 8], fill: new Fill({ color: route }), stroke: new Stroke({ color: voidColour, width: 1 }) }) }));
      }
      return out;
    },
  });

  function selectionRing(radius: number): Style {
    return new Style({ image: new CircleStyle({ radius, stroke: new Stroke({ color: route, width: selectionWidth }) }) });
  }

  sync();
  const unsubscribe = planStore.subscribe(() => {
    sync();
    layer.changed();
  });

  return {
    layer,
    setPreview(next) {
      preview = next;
      sync();
      layer.changed();
    },
    destroy() {
      unsubscribe();
      source.clear();
      features.clear();
      layer.dispose();
    },
  };
}
