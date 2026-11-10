/**
 * Ops map vector layers: crew, vehicles, coverage, haven bands and scientific layer toggles (04 §E.4, 02 §C.1, FR-30, FR-39, FR-42).
 * Implemented by T25.02.
 *
 * Positions are in local Mars CRS working-projection metres only (+proj=eqc).
 * Never uses EPSG:3857, WGS84, or ol/sphere (02 §C.4.2).
 */
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import LineString from "ol/geom/LineString.js";
import Polygon from "ol/geom/Polygon.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import Text from "ol/style/Text.js";
import type { Crew, Snapshot, Vehicle } from "@marswalk/protocol";

// 04 §C.1 colour tokens
const COLOR_ACCENT = "#4CC9F0";
const COLOR_VOID = "#0B0D10";
const COLOR_TEXT = "#E8EDF2";
const COLOR_UNLINKED = "#6B7280";
const COLOR_UNLINKED_TEXT = "#9CA3AF";
const COLOR_HAVEN = "#00F0FF";
const COLOR_COMM = "rgba(76, 201, 240, 0.15)";
const COLOR_COMM_STROKE = "rgba(76, 201, 240, 0.6)";

export type ScientificLayerId = "slope" | "thermal_inertia" | "comm_shadow";

export interface OpsLayers {
  crewLayer: VectorLayer<VectorSource>;
  vehicleLayer: VectorLayer<VectorSource>;
  coverageLayer: VectorLayer<VectorSource>;
  havenBandsLayer: VectorLayer<VectorSource>;

  update(snapshot: Snapshot | null): void;
  setSlopeVisible(visible: boolean): void;
  setThermalInertiaVisible(visible: boolean): void;
  setCommShadowVisible(visible: boolean): void;
  getVisibleScientificLayers(): ScientificLayerId[];
  destroy(): void;
}

/**
 * Creates concentric circular polygon rings in projected metres.
 */
function createCirclePolygon(centerX: number, centerY: number, radiusM: number, numPoints = 64): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;
    coords.push([centerX + radiusM * Math.cos(angle), centerY + radiusM * Math.sin(angle)]);
  }
  return coords;
}

export function createOpsLayers(): OpsLayers {
  const crewSource = new VectorSource();
  const vehicleSource = new VectorSource();
  const coverageSource = new VectorSource();
  const havenBandsSource = new VectorSource();

  // Active scientific overlays FIFO queue (max 2 rule from 04 §E.5)
  let activeScientificLayers: ScientificLayerId[] = [];

  // 1. Crew styling
  function crewStyle(feature: Feature): Style | Style[] {
    const type = feature.get("type");
    if (type === "crew_marker") {
      const isLinked = feature.get("linked") !== false;
      const crewId = (feature.get("crew_id") as string) || "EV";
      const strokeColor = isLinked ? COLOR_ACCENT : COLOR_UNLINKED;
      const textColor = isLinked ? COLOR_TEXT : COLOR_UNLINKED_TEXT;

      return [
        new Style({
          image: new CircleStyle({
            radius: 8,
            fill: new Fill({ color: COLOR_VOID }),
            stroke: new Stroke({
              color: strokeColor,
              width: 2,
              lineDash: isLinked ? undefined : [4, 4],
            }),
          }),
          text: new Text({
            text: crewId,
            font: "bold 11px monospace",
            fill: new Fill({ color: textColor }),
            offsetY: -14,
          }),
          zIndex: 10,
        }),
      ];
    }

    if (type === "crew_trail") {
      const isLinked = feature.get("linked") !== false;
      return new Style({
        stroke: new Stroke({
          color: isLinked ? COLOR_ACCENT : COLOR_UNLINKED,
          width: 2,
          lineDash: isLinked ? undefined : [4, 4],
        }),
        zIndex: 5,
      });
    }

    return [];
  }

  // 2. Vehicle styling
  function vehicleStyle(feature: Feature): Style | Style[] {
    const type = feature.get("type");
    if (type === "vehicle_marker") {
      const vehicleId = (feature.get("vehicle_id") as string) || "V";
      return [
        new Style({
          image: new CircleStyle({
            radius: 9,
            fill: new Fill({ color: COLOR_VOID }),
            stroke: new Stroke({ color: COLOR_TEXT, width: 2 }),
          }),
          text: new Text({
            text: `[ ${vehicleId} ]`,
            font: "bold 11px monospace",
            fill: new Fill({ color: COLOR_TEXT }),
            offsetY: -15,
          }),
          zIndex: 10,
        }),
      ];
    }

    if (type === "vehicle_path") {
      return new Style({
        stroke: new Stroke({
          color: COLOR_TEXT,
          width: 2,
          lineDash: [6, 6],
        }),
        zIndex: 4,
      });
    }

    return [];
  }

  // 3. Haven bands styling
  function havenBandsStyle(feature: Feature): Style | Style[] {
    const minutes = feature.get("minutes") as number;
    return new Style({
      stroke: new Stroke({
        color: COLOR_HAVEN,
        width: 1.5,
        lineDash: [4, 4],
      }),
      text: new Text({
        text: `${minutes}m isochrone`,
        font: "9px monospace",
        fill: new Fill({ color: COLOR_HAVEN }),
        placement: "line",
      }),
      zIndex: 2,
    });
  }

  // 4. Comm coverage styling
  function coverageStyle(): Style | Style[] {
    return new Style({
      fill: new Fill({ color: COLOR_COMM }),
      stroke: new Stroke({ color: COLOR_COMM_STROKE, width: 1.5, lineDash: [8, 4] }),
      zIndex: 1,
    });
  }

  const crewLayer = new VectorLayer({
    source: crewSource,
    style: crewStyle as any,
  });

  const vehicleLayer = new VectorLayer({
    source: vehicleSource,
    style: vehicleStyle as any,
  });

  const havenBandsLayer = new VectorLayer({
    source: havenBandsSource,
    style: havenBandsStyle as any,
  });

  const coverageLayer = new VectorLayer({
    source: coverageSource,
    style: coverageStyle as any,
  });

  // Crew trail history (breadcrumbs of previous positions in projected metres)
  const crewTrails = new Map<string, [number, number][]>();

  function update(snapshot: Snapshot | null): void {
    crewSource.clear();
    vehicleSource.clear();
    havenBandsSource.clear();
    coverageSource.clear();

    if (!snapshot) {
      crewTrails.clear();
      return;
    }

    // Render crew
    if (Array.isArray(snapshot.crew)) {
      snapshot.crew.forEach((c: Crew) => {
        // Point marker
        const marker = new Feature({
          geometry: new Point([c.x_m, c.y_m]),
          type: "crew_marker",
          crew_id: c.crew_id,
          activity: c.activity,
          linked: c.linked,
          stale: c.stale,
          o2_frac: c.o2_frac,
          haven: c.haven,
          link_path: c.link_path,
        });
        crewSource.addFeature(marker);

        // Track breadcrumbs for crew trail
        const trail = crewTrails.get(c.crew_id) || [];
        const last = trail[trail.length - 1];
        if (!last || last[0] !== c.x_m || last[1] !== c.y_m) {
          trail.push([c.x_m, c.y_m]);
          crewTrails.set(c.crew_id, trail);
        }

        // Draw trail if at least 2 points
        if (trail.length >= 2) {
          const trailFeature = new Feature({
            geometry: new LineString(trail),
            type: "crew_trail",
            crew_id: c.crew_id,
            linked: c.linked,
          });
          crewSource.addFeature(trailFeature);
        }
      });
    }

    // Render vehicles
    if (Array.isArray(snapshot.vehicles)) {
      snapshot.vehicles.forEach((v: Vehicle) => {
        const marker = new Feature({
          geometry: new Point([v.x_m, v.y_m]),
          type: "vehicle_marker",
          vehicle_id: v.vehicle_id,
          kind: v.kind,
          state: v.state,
          task: v.task,
        });
        vehicleSource.addFeature(marker);

        if (Array.isArray(v.path) && v.path.length >= 2) {
          const path = new Feature({
            geometry: new LineString(v.path),
            type: "vehicle_path",
            vehicle_id: v.vehicle_id,
          });
          vehicleSource.addFeature(path);
        }
      });
    }

    // Render haven bands (isochrones at 5, 10, 15 min walk ~330, 660, 990 m around hab [0, 0])
    const walkSpeedMpS = 1.1; // ~1.1 m/s nominal Mars walk speed
    const havenIntervalsMin = [5, 10, 15];

    havenIntervalsMin.forEach((min) => {
      const radiusM = min * 60 * walkSpeedMpS;
      const ringCoords = createCirclePolygon(0, 0, radiusM);
      const ringFeature = new Feature({
        geometry: new Polygon([ringCoords]),
        type: "haven_band",
        minutes: min,
      });
      havenBandsSource.addFeature(ringFeature);
    });

    // Render comm_hab coverage polygon (~1200 m nominal direct line-of-sight radius)
    const commCoords = createCirclePolygon(0, 0, 1200);
    const commFeature = new Feature({
      geometry: new Polygon([commCoords]),
      type: "comm_coverage",
    });
    coverageSource.addFeature(commFeature);
  }

  function toggleScientificLayer(id: ScientificLayerId, visible: boolean): void {
    if (visible) {
      if (!activeScientificLayers.includes(id)) {
        if (activeScientificLayers.length >= 2) {
          // Eject oldest
          activeScientificLayers.shift();
        }
        activeScientificLayers.push(id);
      }
    } else {
      activeScientificLayers = activeScientificLayers.filter((l) => l !== id);
    }
  }

  return {
    crewLayer,
    vehicleLayer,
    coverageLayer,
    havenBandsLayer,
    update,
    setSlopeVisible: (visible: boolean) => toggleScientificLayer("slope", visible),
    setThermalInertiaVisible: (visible: boolean) => toggleScientificLayer("thermal_inertia", visible),
    setCommShadowVisible: (visible: boolean) => toggleScientificLayer("comm_shadow", visible),
    getVisibleScientificLayers: () => [...activeScientificLayers],
    destroy: () => {
      crewSource.clear();
      vehicleSource.clear();
      coverageSource.clear();
      havenBandsSource.clear();
      activeScientificLayers = [];
    },
  };
}
