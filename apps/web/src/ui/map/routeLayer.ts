/**
 * Route polyline rendering layer with slope, constraint and hazard styling (04 §C.1, 04 §C.5, FR-07, FR-10).
 * Implemented by T09.01.
 *
 * Uses only projected metres in local Mars CRS (02 §C.4.2; never ol/sphere, EPSG:3857 or WGS84).
 */
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import type { PlanHoverPosition, PlanState, PlanStore } from "../../state/planStore";
import { LAYER_Z_INDEX } from "../context";
import type { Leg, PlanResult, Warning } from "@marswalk/protocol";

// Design tokens from 04 §C.1 and tokens.css
const COLOR_ROUTE = "#4CC9F0";
const COLOR_VOID = "#0B0D10";
const COLOR_UNKNOWN = "#B8A9FF";
const COLOR_CAUTION = "#FFB020";
const COLOR_BLOCKED = "#FF4D4D";

export type RouteVectorLayer = VectorLayer<VectorSource> & {
  setHover(hover: PlanHoverPosition | null): void;
  destroy(): void;
};

/**
 * Slice a projected-metre polyline between along-track distances from_m and to_m.
 */
function extractSubPolyline(
  coords: [number, number][],
  from_m: number,
  to_m: number
): [number, number][] {
  if (coords.length < 2 || from_m >= to_m) return [];

  const result: [number, number][] = [];
  let cumDist = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const segLen = Math.hypot(dx, dy);
    const nextDist = cumDist + segLen;

    if (nextDist >= from_m && cumDist <= to_m) {
      // Segment overlaps [from_m, to_m]
      if (result.length === 0) {
        // First point
        const t = segLen > 0 ? Math.max(0, from_m - cumDist) / segLen : 0;
        result.push([p1[0] + t * dx, p1[1] + t * dy]);
      }
      if (nextDist <= to_m) {
        result.push([p2[0], p2[1]]);
      } else {
        // Last point
        const t = segLen > 0 ? (to_m - cumDist) / segLen : 0;
        result.push([p1[0] + t * dx, p1[1] + t * dy]);
        break;
      }
    }

    cumDist = nextDist;
    if (cumDist > to_m) break;
  }

  return result;
}

/**
 * Create and bind the OpenLayers route vector layer for displaying computed plan legs.
 */
export function createRouteLayer(planStore: PlanStore): RouteVectorLayer {
  const source = new VectorSource();
  let currentHover: PlanHoverPosition | null = null;

  // Layer style function applying 04 §C.1 and 04 §C.5 rules
  function styleFunction(feature: Feature): Style | Style[] {
    const type = feature.get("type");

    if (type === "ok_leg") {
      const legIndex = feature.get("legIndex");
      const isHovered = currentHover?.leg_index === legIndex;

      const innerWidth = isHovered ? 6 : 4;
      const casingWidth = innerWidth + 4; // 2 px casing on each side (04 §C.1)

      return [
        new Style({
          stroke: new Stroke({
            color: COLOR_VOID,
            width: casingWidth,
            lineCap: "round",
            lineJoin: "round",
          }),
          zIndex: 1,
        }),
        new Style({
          stroke: new Stroke({
            color: COLOR_ROUTE,
            width: innerWidth,
            lineCap: "round",
            lineJoin: "round",
          }),
          zIndex: 2,
        }),
      ];
    }

    if (type === "no_route_leg") {
      return new Style({
        stroke: new Stroke({
          color: COLOR_UNKNOWN,
          width: 3,
          lineDash: [8, 8],
          lineCap: "round",
        }),
        zIndex: 3,
      });
    }

    if (type === "hazard_segment") {
      const severity = feature.get("severity");
      const color = severity === "blocked" ? COLOR_BLOCKED : COLOR_CAUTION;
      return new Style({
        stroke: new Stroke({
          color,
          width: 6,
          lineDash: [4, 4],
          lineCap: "butt",
        }),
        zIndex: 4,
      });
    }

    return [];
  }

  const layer = new VectorLayer({
    source,
    style: styleFunction as any,
  }) as RouteVectorLayer;

  layer.setZIndex(LAYER_Z_INDEX.ROUTE);

  function updateFeatures(state: PlanState): void {
    source.clear();

    if (!state.result || state.status === "Empty" || state.status === "Error") {
      return;
    }

    const { legs, warnings } = state.result;

    legs.forEach((leg: Leg, i: number) => {
      if (leg.status === "OK") {
        if (leg.geometry && leg.geometry.length >= 2) {
          const feature = new Feature({
            geometry: new LineString(leg.geometry),
            type: "ok_leg",
            legIndex: i,
            from: leg.from,
            to: leg.to,
            distance_m: leg.distance_m,
          });
          source.addFeature(feature);
        }
      } else if (leg.status === "NO_ROUTE") {
        const startWp = state.waypoints.find((w) => w.id === leg.from);
        if (startWp && leg.nearest_reachable) {
          const coords: [number, number][] = [
            [startWp.x_m, startWp.y_m],
            [leg.nearest_reachable.x_m, leg.nearest_reachable.y_m],
          ];
          const feature = new Feature({
            geometry: new LineString(coords),
            type: "no_route_leg",
            legIndex: i,
            from: leg.from,
            to: leg.to,
            reason: leg.reason,
          });
          source.addFeature(feature);
        }
      }
    });

    // Located warning hazard overlays (05 Warning leg, from_m, to_m)
    if (Array.isArray(warnings)) {
      warnings.forEach((warning: Warning) => {
        if (
          warning.leg !== null &&
          warning.leg !== undefined &&
          warning.from_m !== null &&
          warning.to_m !== null &&
          warning.from_m !== undefined &&
          warning.to_m !== undefined
        ) {
          const leg = legs[warning.leg];
          if (leg && leg.status === "OK" && leg.geometry) {
            const subCoords = extractSubPolyline(
              leg.geometry,
              warning.from_m,
              warning.to_m
            );
            if (subCoords.length >= 2) {
              const hazardFeature = new Feature({
                geometry: new LineString(subCoords),
                type: "hazard_segment",
                legIndex: warning.leg,
                severity: warning.severity,
                code: warning.code,
              });
              source.addFeature(hazardFeature);
            }
          }
        }
      });
    }
  }

  const unsubscribe = planStore.subscribe((state) => {
    updateFeatures(state);
  });

  // Initial render
  updateFeatures(planStore.get());

  layer.setHover = (hover: PlanHoverPosition | null) => {
    currentHover = hover;
    layer.changed();
  };

  layer.destroy = () => {
    unsubscribe();
    source.clear();
  };

  return layer;
}
