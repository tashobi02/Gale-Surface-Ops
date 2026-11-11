/**
 * Route layer: planned legs as cased `route` lines, NO_ROUTE legs dashed to the nearest reachable point, and a hazard
 * overlay along located warnings (docs/specs/01 FR-07, FR-10; 04 §C.1 Map overlays, §C.5 Map annotations).
 * Implemented by T09.01 (Saba Atharique, #178; reworked in the review by Claude Code).
 *
 * Working-projection metres only (IAU_2015:49900): no EPSG:3857, no `ol/sphere` (02 §C.1). Colours are read from the
 * design tokens when a style is drawn (./tokenColors), never copied as hex. The layer reads the C11 plan store and
 * is added to the map by its owner (T07.08) through the C10 map handle at `LAYER_Z_INDEX.ROUTE` (FR-02).
 *
 * Shape cues: a hazard stretch is told apart by its dash pattern as well as its colour (04 §A.3 #2): caution is a long
 * dash, blocked a dash-dot, unknown dotted.
 * TODO(decision): the map hatch of the hazard overlay (04 §C.5 "hatch"); dash patterns stand in until the design
 * review picks the pattern fills.
 */
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Stroke from "ol/style/Stroke.js";
import Style, { type StyleFunction } from "ol/style/Style.js";
import type { FeatureLike } from "ol/Feature.js";
import type { Warning } from "@marswalk/protocol";
import type { PlanHoverPosition, PlanState, PlanStore } from "../../state/planStore";
import { LAYER_Z_INDEX } from "../context";
import { sliceAlongTrack } from "./routeGeometry";
import { tokenColor } from "./tokenColors";

/** 04 §C.1 route: 4 px line with a 2 px casing each side; 04 §C.5 hover: 6 px. */
const ROUTE_WIDTH_PX = 4;
const ROUTE_HOVER_WIDTH_PX = 6;
const CASING_PX = 2;
const NO_ROUTE_WIDTH_PX = 3;
const HAZARD_WIDTH_PX = 6;

/** Dash patterns (px on, px off): the shape cue of each hazard severity and of a NO_ROUTE leg. */
const NO_ROUTE_DASH = [8, 8];
const HAZARD_DASH: Record<Warning["severity"], number[]> = {
  caution: [10, 6],
  blocked: [10, 4, 2, 4],
  unknown: [1, 6],
};

export type RouteVectorLayer = VectorLayer<VectorSource> & {
  /** Widens the leg at `hover.leg_index` (04 §C.5); null clears it. For the profile link (T09.05). */
  setHover(hover: PlanHoverPosition | null): void;
  /** Unsubscribes from the plan store and empties the layer. */
  destroy(): void;
};

type FeatureType = "ok_leg" | "no_route_leg" | "hazard_segment";

/** Map token and cap for a hazard severity; any value outside the 05 enum reads as `unknown`. */
function hazardStyle(severity: unknown): { token: "caution" | "warning" | "unknown"; dash: number[] } {
  if (severity === "caution") return { token: "caution", dash: HAZARD_DASH.caution };
  if (severity === "blocked") return { token: "warning", dash: HAZARD_DASH.blocked };
  return { token: "unknown", dash: HAZARD_DASH.unknown };
}

/** Create the route layer for the plan store (C11). */
export function createRouteLayer(planStore: PlanStore): RouteVectorLayer {
  const source = new VectorSource();
  let hover: PlanHoverPosition | null = null;
  let lastResult: PlanState["result"] | undefined;
  let lastWaypoints: PlanState["waypoints"] | undefined;
  let lastStatus: PlanState["status"] | undefined;

  const style: StyleFunction = (feature: FeatureLike) => {
    const type = feature.get("type") as FeatureType | undefined;
    if (type === "ok_leg") {
      const hovered = hover?.leg_index !== undefined && hover.leg_index === feature.get("legIndex");
      const inner = hovered ? ROUTE_HOVER_WIDTH_PX : ROUTE_WIDTH_PX;
      const base = { lineCap: "round", lineJoin: "round" } as const;
      return [
        new Style({ stroke: new Stroke({ color: tokenColor("void"), width: inner + 2 * CASING_PX, ...base }), zIndex: 1 }),
        new Style({ stroke: new Stroke({ color: tokenColor("route"), width: inner, ...base }), zIndex: 2 }),
      ];
    }
    if (type === "no_route_leg") {
      return new Style({
        stroke: new Stroke({ color: tokenColor("unknown"), width: NO_ROUTE_WIDTH_PX, lineDash: NO_ROUTE_DASH, lineCap: "round" }),
        zIndex: 3,
      });
    }
    if (type === "hazard_segment") {
      const { token, dash } = hazardStyle(feature.get("severity"));
      return new Style({
        stroke: new Stroke({ color: tokenColor(token), width: HAZARD_WIDTH_PX, lineDash: dash, lineCap: token === "unknown" ? "round" : "butt" }),
        zIndex: 4,
      });
    }
    return undefined;
  };

  const layer = new VectorLayer({ source, style }) as RouteVectorLayer;
  layer.setZIndex(LAYER_Z_INDEX.ROUTE);

  function rebuild(state: PlanState): void {
    source.clear();
    if (!state.result || state.status === "Empty" || state.status === "Error") return;
    const { legs, warnings } = state.result;

    legs.forEach((leg, legIndex) => {
      if (leg.status === "OK") {
        if (leg.geometry.length < 2) return;
        source.addFeature(
          new Feature({ geometry: new LineString(leg.geometry), type: "ok_leg", legIndex, from: leg.from, to: leg.to, distance_m: leg.distance_m }),
        );
        return;
      }
      const start = state.waypoints.find((w) => w.id === leg.from);
      if (!start || !leg.nearest_reachable) return;
      source.addFeature(
        new Feature({
          geometry: new LineString([
            [start.x_m, start.y_m],
            [leg.nearest_reachable.x_m, leg.nearest_reachable.y_m],
          ]),
          type: "no_route_leg",
          legIndex,
          from: leg.from,
          to: leg.to,
          reason: leg.reason,
        }),
      );
    });

    // Located warnings (05 Warning leg, from_m, to_m) become an overlay on that stretch of an OK leg.
    for (const w of warnings) {
      if (w.leg === null || w.from_m === null || w.to_m === null) continue;
      const leg = legs[w.leg];
      if (!leg || leg.status !== "OK") continue;
      const stretch = sliceAlongTrack(leg.geometry, w.from_m, w.to_m);
      if (stretch.length < 2) continue;
      source.addFeature(
        new Feature({ geometry: new LineString(stretch), type: "hazard_segment", legIndex: w.leg, severity: w.severity, code: w.code }),
      );
    }
  }

  function onState(state: PlanState): void {
    // The store notifies on every change including hover; rebuild only when the route inputs changed.
    if (state.result !== lastResult || state.waypoints !== lastWaypoints || state.status !== lastStatus) {
      lastResult = state.result;
      lastWaypoints = state.waypoints;
      lastStatus = state.status;
      rebuild(state);
    }
    hover = state.hover;
    layer.changed();
  }

  const unsubscribe = planStore.subscribe(onState);
  onState(planStore.get());

  layer.setHover = (next) => {
    hover = next;
    layer.changed();
  };
  layer.destroy = () => {
    unsubscribe();
    source.clear();
  };
  return layer;
}
