/**
 * Shared OpenLayers map: view, metric scale bar, north arrow, coordinate readout, C10 v2 MapHandle
 * (T07.06; FR-01, FR-15, 02 §C.1, 02 §C.4, 03 SCR-02, 04 §C.2, §E, §F; mockup DV-14).
 *
 * - The map is built on `registerMarsProjection` (projection.ts): local `+proj=eqc` in projected metres, bounded by
 *   `aoi.extent_m`. Nothing here registers a projection, inverts eqc by hand, or touches EPSG:3857, EPSG:4326 or
 *   `ol/sphere`; the scale bar measures in projected metres through the projection's identity point resolution
 *   (02 §C.4.2). Rotation is off, so the north arrow is fixed (top right).
 * - The map owns its OpenLayers viewport only: the host element is not restyled (no forced `position`, no
 *   `tabindex`). `getTargetElement()` is that viewport with `tabindex="0"`, which is what the keyboard layer
 *   (keyboard.ts, 04 §E) needs to pan and zoom only while the map has focus. North arrow, readout, scale bar and
 *   attribution are OpenLayers controls inside the viewport, so `destroy()` removes them with it.
 * - The coordinate readout shows "—" until a position is measured, then planetocentric latitude, east-positive
 *   longitude (5 decimals) and projected x/y metres, labelled `derived` with a manifest DataSource id (FR-15).
 * - Motion: `panBy`, `zoomBy` and fits are instant under `prefers-reduced-motion` or `{ animate: false }` (04 §E).
 * - `attachKeyboardControls` is mounted here (T13.06): pass `keyboard: { planContext }` for the planner's Delete, B
 *   and ? shortcuts, or `keyboard: false` where the page mounts them itself.
 */
import OlMap from "ol/Map.js";
import OlView from "ol/View.js";
import Attribution from "ol/control/Attribution.js";
import Control from "ol/control/Control.js";
import ScaleLine from "ol/control/ScaleLine.js";
import { unByKey } from "ol/Observable.js";
import type { EventsKey } from "ol/events.js";
import type { Extent } from "ol/extent.js";
import type { LoadedSite, MapHandle, MapView } from "../context";
import { UNAVAILABLE, provAttrs, unavailableOf } from "../components/provenance";
import { attachKeyboardControls, prefersReducedMotion, type KeyboardControlsOptions } from "./keyboard";
import { projectedToLatLonE, registerMarsProjection } from "./projection";

export interface CreateMapOptions {
  /** The host element, or its id. A missing id throws. */
  target: HTMLElement | string;
  site: LoadedSite;
  /**
   * The DataSource the coordinate readout cites. Default: the first source of the basemap layer (the layer that is
   * not optional), else of the first layer. TODO(decision): which DataSource a projection-derived readout cites.
   */
  readoutSourceId?: string;
  /** Keyboard layer (04 §E): options for `attachKeyboardControls`, or `false` to mount none. Default: map keys only. */
  keyboard?: false | Pick<KeyboardControlsOptions, "planContext" | "panStepPx" | "target">;
}

/** Duration of an animated pan, zoom or fit (04 §C.6 `--motion-fast`). */
const MOTION_MS = 150;
/** Padding around a fitted extent, pixels. */
const FIT_PADDING_PX = 24;

type Animate = { animate?: boolean } | undefined;

/** Source the readout cites: the option, else the basemap layer's first source, else the first layer's. */
function resolveReadoutSource(site: LoadedSite, requested: string | undefined): string {
  if (requested !== undefined) {
    if (!site.sources.has(requested)) {
      throw new Error(`createMap: readoutSourceId ${JSON.stringify(requested)} is not a source of site ${site.site.site_id}`);
    }
    return requested;
  }
  const layers = [...site.layers.values()];
  const basemap = layers.find((layer) => !layer.optional);
  for (const layer of basemap ? [basemap, ...layers] : layers) {
    const id = layer.source_ids.find((sourceId) => site.sources.has(sourceId));
    if (id !== undefined) return id;
  }
  const first = site.sources.keys().next();
  if (first.done) throw new Error(`createMap: site ${site.site.site_id} lists no DataSource to cite`);
  return first.value;
}

function resolveHost(target: HTMLElement | string): HTMLElement {
  if (typeof target !== "string") return target;
  const el = document.getElementById(target);
  if (!el) throw new Error(`createMap: no element with id ${JSON.stringify(target)}`);
  return el;
}

/** Fixed-decimal with a true minus sign (02 §C.1 shows `−4.71234°`). */
const signed = (value: number, digits: number): string => `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;

/** Chrome over imagery: raised dark panel, `--text-1` ink, 12 px minimum (04 §C.2), mono for numbers. */
const CHROME = [
  "position:absolute",
  "pointer-events:none",
  "padding:2px 8px",
  "background:var(--panel)",
  "color:var(--text-1)",
  "font-family:var(--font-mono)",
  "font-size:var(--text-micro)",
  "line-height:var(--line-height-ui)",
  "white-space:nowrap",
].join(";");

function chromeElement(testId: string, css: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-testid", testId);
  el.style.cssText = `${CHROME};${css}`;
  return el;
}

/**
 * Creates the shared OpenLayers map on the site's Mars projection and returns the C10 v2 handle.
 * Throws when the target id is unknown or `readoutSourceId` is not a source of the site.
 */
export function createMap(options: CreateMapOptions): MapHandle {
  const { site: loaded } = options;
  const site = loaded.site;
  const host = resolveHost(options.target);
  const readoutSource = resolveReadoutSource(loaded, options.readoutSourceId);

  const projection = registerMarsProjection(site);
  const extent = site.aoi.extent_m as Extent;
  const aoiCentre: [number, number] = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];

  const view = new OlView({
    projection,
    extent,
    // The centre stays in the AOI; the resolution is free so the AOI can be fitted with padding.
    constrainOnlyCenter: true,
    center: aoiCentre,
    zoom: 0,
    enableRotation: false,
  });

  // Scale bar in projected metres: ScaleLine asks the projection for its point resolution (identity).
  const scaleLine = new ScaleLine({ units: "metric" });
  // Attributions come from the layers' sources (NFR-07); the layer modules set them from DataSource credits.
  const attribution = new Attribution({ collapsible: false });

  const northArrow = chromeElement("north-arrow", "top:8px;right:8px;text-align:center");
  northArrow.setAttribute("role", "img");
  northArrow.setAttribute("aria-label", "North is up");
  northArrow.textContent = "↑ N";

  const readout = chromeElement("coord-readout", "bottom:8px;right:8px");
  const showReadout = (text: string, prov: ReturnType<typeof provAttrs>): void => {
    readout.textContent = text;
    readout.removeAttribute("data-unavailable");
    for (const [key, value] of Object.entries(prov)) readout.setAttribute(key, value);
  };
  const clearReadout = (): void => showReadout(UNAVAILABLE, provAttrs(unavailableOf("derived", "map.pointer")));
  clearReadout();

  const map = new OlMap({
    target: host,
    view,
    controls: [scaleLine, attribution, new Control({ element: northArrow }), new Control({ element: readout })],
    layers: [],
  });

  const viewport = map.getViewport();
  if (!viewport) throw new Error("createMap: OpenLayers created no viewport");
  // OpenLayers builds the scale bar and attribution elements itself; they are styled once they are in the viewport.
  const scaleEl = viewport.querySelector<HTMLElement>(".ol-scale-line");
  if (scaleEl) {
    scaleEl.style.cssText = `${CHROME};left:8px;bottom:8px`;
    scaleEl.setAttribute("data-testid", "scale-bar");
    scaleEl.setAttribute("data-provenance", "derived");
    scaleEl.setAttribute("data-source", readoutSource);
  }
  const attributionEl = viewport.querySelector<HTMLElement>(".ol-attribution");
  if (attributionEl) {
    attributionEl.style.cssText = `${CHROME};left:8px;bottom:36px;white-space:normal;max-width:60%`;
    attributionEl.setAttribute("data-testid", "attribution");
  }
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "group");
  viewport.setAttribute("aria-label", `Map of ${site.name}. Arrow keys pan; plus and minus zoom.`);

  const keys: EventsKey[] = [];
  const cleanups: (() => void)[] = [];
  let destroyed = false;

  const hasSize = (): boolean => {
    const size = map.getSize();
    return size !== undefined && size[0] > 0 && size[1] > 0;
  };
  const instant = (opts: Animate): boolean => opts?.animate === false || prefersReducedMotion();

  const fit = (target: Extent, opts?: Animate): void => {
    view.fit(target, {
      size: map.getSize(),
      padding: [FIT_PADDING_PX, FIT_PADDING_PX, FIT_PADDING_PX, FIT_PADDING_PX],
      duration: instant(opts) ? 0 : MOTION_MS,
    });
  };

  // Fit the AOI on open. A host with no layout yet (React mounts before layout) is fitted once it has a size.
  if (hasSize()) {
    fit(extent, { animate: false });
  } else {
    const key = map.on("change:size", () => {
      if (!hasSize()) return;
      unByKey(key);
      fit(extent, { animate: false });
    });
    keys.push(key);
  }

  keys.push(
    map.on("pointermove", (event) => {
      const [x, y] = event.coordinate;
      const { lat, lon_e } = projectedToLatLonE(site, x, y);
      showReadout(
        `${signed(lat, 5)}°, ${lon_e.toFixed(5)}°E  x ${Math.round(x)} m  y ${Math.round(y)} m`,
        provAttrs({ prov: "derived", src: readoutSource }),
      );
    }),
  );
  viewport.addEventListener("pointerleave", clearReadout);
  cleanups.push(() => viewport.removeEventListener("pointerleave", clearReadout));

  const handle: MapHandle = {
    getMap<T = unknown>(): T {
      return map as unknown as T;
    },

    getTargetElement(): HTMLElement {
      return viewport;
    },

    fitExtent(target: [number, number, number, number]): void {
      fit(target);
    },

    setCenter(coord: [number, number]): void {
      view.setCenter(coord);
    },

    getCenter(): [number, number] {
      return (view.getCenter() ?? aoiCentre) as [number, number];
    },

    setZoom(zoom: number): void {
      view.setZoom(zoom);
    },

    getZoom(): number | undefined {
      return view.getZoom();
    },

    getResolution(): number | undefined {
      return view.getResolution();
    },

    panBy(dx_px: number, dy_px: number, opts?: { animate?: boolean }): void {
      const resolution = view.getResolution();
      const centre = view.getCenter();
      if (resolution === undefined || !centre) return;
      // Screen y points down, projected y points north: a negative dy shows more north.
      const next: [number, number] = [centre[0] + dx_px * resolution, centre[1] - dy_px * resolution];
      if (instant(opts)) {
        view.setCenter(next);
      } else {
        view.animate({ center: next, duration: MOTION_MS });
      }
    },

    zoomBy(delta: number, opts?: { animate?: boolean }): void {
      const zoom = view.getZoom();
      if (zoom === undefined) return;
      if (instant(opts)) {
        view.setZoom(zoom + delta);
      } else {
        view.animate({ zoom: zoom + delta, duration: MOTION_MS });
      }
    },

    onViewChange(listener: (v: MapView) => void): () => void {
      const emit = (): void => {
        const centre = view.getCenter();
        const resolution = view.getResolution();
        if (!centre || resolution === undefined || !(resolution > 0)) return;
        listener({ center_x_m: centre[0], center_y_m: centre[1], resolution_m_per_px: resolution });
      };
      const subscribed = [view.on("change:center", emit), view.on("change:resolution", emit)];
      let active = true;
      const unsubscribe = (): void => {
        if (!active) return;
        active = false;
        unByKey(subscribed);
        cleanups.splice(cleanups.indexOf(unsubscribe), 1);
      };
      cleanups.push(unsubscribe);
      return unsubscribe;
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for (const cleanup of [...cleanups]) cleanup();
      unByKey(keys);
      // Removes the viewport, and with it every control element, from the host; then drops the map's own listeners.
      map.setTarget(undefined);
      map.dispose();
    },
  };

  if (options.keyboard !== false) {
    cleanups.push(attachKeyboardControls({ mapHandle: handle, ...options.keyboard }));
  }

  return handle;
}
