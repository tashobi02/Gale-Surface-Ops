/**
 * T07.06 — Shared OpenLayers map: view, metric scale bar, north arrow, coordinate readout.
 * (FR-01, 02 §C.1, 02 §C.4, 04 §B, 04 §E; mockup DV-14)
 *
 * - OpenLayers map in the Mars projection (IAU_2015:49900, local eqc, projected metres).
 * - Scale bar in projected metres; never uses ol/sphere, EPSG:3857, or Earth-radius helpers (02 §C.4.2).
 * - North arrow (top right) and coordinate readout (bottom right):
 *     lat/lon to 5 decimals + local x/y metres from AOI origin (02 §C.1).
 * - Returns the C10 MapHandle with layer-order slots and a fit-to-AOI action.
 * - Respects prefers-reduced-motion: instant jumps, no animated fly-to (04 §E).
 *
 * CRS GUARD: no EPSG:3857, no EPSG:4326, no ol/sphere imports here (02 §C.4).
 */

import OlMap from "ol/Map.js";
import OlView from "ol/View.js";
import { get as getProjection } from "ol/proj.js";
import ScaleLine from "ol/control/ScaleLine.js";
import proj4 from "proj4";
import { register } from "ol/proj/proj4.js";
import { addProjection, Projection } from "ol/proj.js";
import type { Site } from "@marswalk/protocol";
import type { FitOptions } from "ol/View.js";

/** C10 MapHandle: generic handle to the shared OL map (02 §C.1, TASK-07). */
export interface MapHandle {
  getMap<T = unknown>(): T;
  fitExtent(extent: [number, number, number, number]): void;
  setCenter(coord: [number, number]): void;
  getCenter(): [number, number];
  setZoom(zoom: number): void;
  getZoom(): number | undefined;
  destroy(): void;
}

/** Mars sphere radius from IAU_2015:49900 (02 §C.1). Never Earth's radius. */
const MARS_R_M = 3_396_190;

/**
 * Registers site.crs.proj4 with proj4 and OpenLayers if not already registered.
 * Code is always MARS_LOCAL:<site_id> — never an EPSG earth code (02 §C.4.1).
 */
function ensureMarsProjection(site: Site): void {
  const code = `MARS_LOCAL:${site.site_id}`;
  if (getProjection(code)) return; // already registered
  proj4.defs(code, site.crs.proj4);
  register(proj4);
  const proj = new Projection({
    code,
    extent: site.aoi.extent_m,
    units: "m",
    metersPerUnit: 1,
    worldExtent: site.aoi.extent_m,
    // Identity: 1 projected metre = 1 ground metre; avoids Earth-sphere conversions (02 §C.4.2).
    getPointResolution: (res: number): number => res,
  });
  addProjection(proj);
}

/** Inverse-eqc: projected metres → geodetic degrees for readout (02 §C.1). */
function projectedToGeo(
  x_m: number,
  y_m: number,
  lat_ts_deg: number,
  lon_0_deg: number,
): { lat: number; lon: number } {
  // eqc: lon = lon_0 + x / (R * cos(lat_ts)); lat = lat_0 + y / R
  const lat_ts_rad = (lat_ts_deg * Math.PI) / 180;
  const lat = lat_ts_deg + (y_m / MARS_R_M) * (180 / Math.PI);
  const lon = lon_0_deg + (x_m / (MARS_R_M * Math.cos(lat_ts_rad))) * (180 / Math.PI);
  return { lat, lon };
}

/** Parse lat_ts and lon_0 from the proj4 string. */
function parseProjParams(proj4str: string): { lat_ts: number; lon_0: number } {
  const latTs = /\+lat_ts=([-\d.]+)/.exec(proj4str);
  const lon0 = /\+lon_0=([-\d.]+)/.exec(proj4str);
  return {
    lat_ts: latTs ? parseFloat(latTs[1]) : 0,
    lon_0: lon0 ? parseFloat(lon0[1]) : 0,
  };
}

/** Reduced-motion preference (04 §E). */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Fit options: no animation when reduced motion is preferred (04 §E). */
function fitOpts(): Parameters<OlView["fit"]>[1] {
  return {
    duration: prefersReducedMotion() ? 0 : 300,
    padding: [24, 24, 24, 24],
  };
}

/**
 * Creates the shared OpenLayers map on the Mars projection.
 *
 * @param site Loaded site manifest (provides CRS, AOI extent, and proj4 string).
 * @param target DOM element or element id to mount the map into.
 * @returns C10 MapHandle with getMap, fitExtent, setCenter, getCenter, setZoom, getZoom, destroy.
 */
export function createMap(site: Site, target: HTMLElement | string): MapHandle {
  ensureMarsProjection(site);

  const projCode = `MARS_LOCAL:${site.site_id}`;
  const extent = site.aoi.extent_m as [number, number, number, number];
  const { lat_ts, lon_0 } = parseProjParams(site.crs.proj4);

  const view = new OlView({
    projection: projCode,
    extent,
    constrainOnlyCenter: false,
  });

  // Scale bar in projected metres — ol/sphere is never imported (02 §C.4.2).
  const scaleLine = new ScaleLine({ units: "metric" });

  const map = new OlMap({
    target,
    view,
    controls: [scaleLine],
    layers: [],
  });

  // Fit to AOI on open.
  view.fit(extent, fitOpts());

  // ----- North arrow -----
  const container = typeof target === "string"
    ? (document.getElementById(target) ?? document.createElement("div"))
    : target;

  const northArrow = document.createElement("div");
  northArrow.setAttribute("data-testid", "north-arrow");
  northArrow.setAttribute("aria-label", "North arrow");
  northArrow.setAttribute("role", "img");
  northArrow.style.cssText = [
    "position:absolute",
    "top:12px",
    "right:12px",
    "width:28px",
    "height:28px",
    "pointer-events:none",
    "z-index:200",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font-size:20px",
    "line-height:1",
    "color:var(--color-fg,#e8edf2)",
  ].join(";");
  northArrow.textContent = "⬆";
  northArrow.title = "North";
  container.style.position = "relative";
  container.appendChild(northArrow);

  // ----- Coordinate readout -----
  const readout = document.createElement("div");
  readout.setAttribute("data-testid", "coord-readout");
  readout.setAttribute("data-provenance", "derived");
  readout.setAttribute("data-source-id", "MARS_LOCAL:" + site.site_id);
  readout.style.cssText = [
    "position:absolute",
    "bottom:28px",
    "right:8px",
    "font-size:11px",
    "font-family:var(--font-mono,'ui-monospace',monospace)",
    "color:var(--color-fg,#e8edf2)",
    "background:rgba(10,14,20,0.72)",
    "padding:2px 6px",
    "border-radius:3px",
    "pointer-events:none",
    "z-index:200",
    "white-space:nowrap",
  ].join(";");
  readout.textContent = "—";
  container.appendChild(readout);

  // Update readout on pointer move.
  map.on("pointermove", (evt) => {
    const [x, y] = evt.coordinate as [number, number];
    const { lat, lon } = projectedToGeo(x, y, lat_ts, lon_0);
    readout.textContent =
      `${lat >= 0 ? "+" : ""}${lat.toFixed(5)}°, ${lon.toFixed(5)}°E  ` +
      `(${x >= 0 ? "+" : ""}${x.toFixed(0)} m, ${y >= 0 ? "+" : ""}${y.toFixed(0)} m)`;
  });

  // ----- MapHandle -----
  return {
    getMap<T = unknown>(): T {
      return map as T;
    },

    fitExtent(ext: [number, number, number, number]): void {
      view.fit(ext, fitOpts());
    },

    setCenter(coord: [number, number]): void {
      view.setCenter(coord);
    },

    getCenter(): [number, number] {
      return (view.getCenter() ?? [0, 0]) as [number, number];
    },

    setZoom(zoom: number): void {
      view.setZoom(zoom);
    },

    getZoom(): number | undefined {
      return view.getZoom();
    },

    destroy(): void {
      map.setTarget(undefined);
    },
  };
}

