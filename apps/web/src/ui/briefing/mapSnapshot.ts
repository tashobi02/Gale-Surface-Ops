/** Local OpenLayers canvas composition (FR-14, T11.04). Projected metres only. */
import RegularShape from "ol/style/RegularShape.js";
import type VectorLayer from "ol/layer/Vector.js";
import type OlMap from "ol/Map.js";
import type { LoadedSite, MapHandle } from "../context";
import { thumbnailUrl } from "../screens/scr01MissionBriefing";
import type { PlanState, PlanStore } from "../../state/planStore";

export interface SnapshotOptions {
  extent?: [number, number, number, number];
  /** Rendering timeout, never simulation time. */
  timeoutMs?: number;
}

async function snapshotCanvas(handle: MapHandle, options: SnapshotOptions): Promise<HTMLCanvasElement> {
  if (!handle || typeof handle.getMap !== "function") throw new Error("Invalid MapHandle: no map available.");
  const map = handle.getMap<OlMap>();
  const center = handle.getCenter();
  const zoom = handle.getZoom();
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = () => { clearTimeout(timer); map.un("rendercomplete", finish); resolve(); };
      const timer = setTimeout(() => {
        map.un("rendercomplete", finish);
        reject(new Error("Map snapshot timed out waiting for local tiles."));
      }, options.timeoutMs ?? 10_000);
      map.once("rendercomplete", finish);
      try {
        if (options.extent) handle.fitExtent(options.extent, { animate: false });
        map.renderSync();
      } catch (error) {
        clearTimeout(timer); map.un("rendercomplete", finish); reject(error);
      }
    });
    const size = map.getSize();
    if (!size?.[0] || !size[1]) throw new Error("No rendered map size available.");
    const canvas = document.createElement("canvas");
    // Twice the CSS dimensions for a legible printed snapshot (FD-360).
    canvas.width = size[0] * 2; canvas.height = size[1] * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Map snapshot requires a canvas context.");
    let layers = 0;
    for (const layer of handle.getTargetElement().querySelectorAll<HTMLCanvasElement>(".ol-layer canvas")) {
      if (!layer.width || !layer.height) continue;
      const transform = layer.style.transform;
      const match = transform.match(/^matrix\(([^)]+)\)$/);
      const matrix = match ? match[1]!.split(",").map(Number) : [parseFloat(layer.style.width) / layer.width || 1, 0, 0, parseFloat(layer.style.height) / layer.height || 1, 0, 0];
      if (matrix.length !== 6 || matrix.some(n => !Number.isFinite(n))) throw new Error("Unsupported map canvas transform.");
      ctx.globalAlpha = Number(layer.parentElement?.style.opacity || layer.style.opacity || 1);
      ctx.setTransform(matrix[0]! * 2, matrix[1]! * 2, matrix[2]! * 2, matrix[3]! * 2, matrix[4]! * 2, matrix[5]! * 2);
      ctx.drawImage(layer, 0, 0);
      layers++;
    }
    if (!layers) throw new Error("No rendered map canvases available.");
    return canvas;
  } finally {
    if (zoom !== undefined) handle.setZoom(zoom);
    handle.setCenter(center);
  }
}

/**
 * The composed map as a canvas element (FD-363).
 *
 * The app's Content Security Policy is `default-src 'self'` (02 §F NFR-08), so a `data:` or `blob:` image source is
 * refused: the briefing map cannot be shown as an `<img src="data:image/png,...">`. A canvas element is not an image
 * source, so it is not restricted, and Chromium prints it like any other replaced element.
 */
export async function composeBriefingCanvas(handle: MapHandle, options: SnapshotOptions = {}): Promise<HTMLCanvasElement> {
  return snapshotCanvas(handle, options);
}

/** Preserve the C10 stub's Blob API for other export consumers. */
export async function createMapSnapshot(handle: MapHandle, options: SnapshotOptions = {}): Promise<Blob> {
  const canvas = await snapshotCanvas(handle, options);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Map PNG encoding failed.")), "image/png"));
}

export async function createMapSnapshotDataUrl(handle: MapHandle, options: SnapshotOptions = {}): Promise<string> {
  return (await snapshotCanvas(handle, options)).toDataURL("image/png");
}

/** Apply PRINT ink/paper to dedicated vector layers without changing screen styles or geometry. */
export function applyPrintPalette(layer: VectorLayer, palette: { ink: string; paper: string }): void {
  const style = layer.getStyleFunction();
  if (!style) return;
  layer.setStyle((feature, resolution) => {
    const supplied = style(feature, resolution);
    const styles = supplied ? Array.isArray(supplied) ? supplied : [supplied] : [];
    return styles.map((original, i) => {
      const copy = original.clone();
      copy.setRenderer(null);
      const stroke = copy.getStroke();
      if (stroke) stroke.setColor(i === 0 && styles[1]?.getStroke() ? palette.paper : palette.ink);
      copy.getFill()?.setColor(palette.paper);
      const image = copy.getImage();
      if (image instanceof RegularShape) {
        image.getFill()?.setColor(palette.paper);
        image.getStroke()?.setColor(palette.ink);
        // RegularShape caches stroke render options; refresh them after changing its cloned palette.
        image.setStroke(image.getStroke());
        image.setFill(image.getFill());
      }
      const text = copy.getText();
      text?.getFill()?.setColor(palette.ink);
      text?.getStroke()?.setColor(palette.paper);
      return copy;
    });
  });
}

/** A short-lived dedicated map: the workspace is unmounted on #/briefing (FD-360). */
export async function captureBriefingMap(target: HTMLCanvasElement, site: LoadedSite, planStore: PlanStore): Promise<void> {
  const [{ createMap }, { createRasterLayers }, { createRouteLayer }, { createWaypointLayer }] = await Promise.all([
    import("../map/createMap"), import("../map/rasterLayers"), import("../map/routeLayer"), import("../map/waypointLayer"),
  ]);
  // The dedicated map renders off-screen; the composed pixels are drawn onto the target canvas.
  // The staging element is attached to the document: OpenLayers only renders into a host that is in the layout.
  const stage = document.createElement("div");
  stage.className = "scr08-capture";
  stage.setAttribute("aria-hidden", "true");
  document.body.append(stage);
  const handle = createMap({ target: stage, site, keyboard: false });
  const destroy: (() => void)[] = [() => handle.destroy(), () => stage.remove()];
  try {
    const map = handle.getMap<OlMap>();
    map.setSize([430, 235]);
    const rasters = createRasterLayers(site, { scenario: planStore }); destroy.push(() => rasters.destroy());
    // Only the local optical basemap: scientific overlays would hide the printed route.
    for (const [id, layer] of rasters.layers) {
      const optical = site.layers.get(id)?.category === "optical";
      layer.setVisible(optical);
      if (optical) map.addLayer(layer.layer);
    }
    const tokens = getComputedStyle(document.documentElement);
    const palette = { ink: tokens.getPropertyValue("--print-text").trim(), paper: tokens.getPropertyValue("--surface-0").trim() };
    if (!palette.ink || !palette.paper) throw new Error("PRINT map tokens are unavailable.");
    const route = createRouteLayer(planStore); destroy.push(() => route.destroy()); applyPrintPalette(route, palette); map.addLayer(route);
    const stops = createWaypointLayer(planStore); destroy.push(() => stops.destroy()); applyPrintPalette(stops.layer, palette); map.addLayer(stops.layer);
    const points = planStore.get().waypoints.map(w => [w.x_m, w.y_m]);
    for (const leg of planStore.get().result?.legs ?? []) if (leg.status === "OK") points.push(...leg.geometry);
    if (!points.length) throw new Error("No route available for the map snapshot.");
    const extent: [number, number, number, number] = [Math.min(...points.map(p => p[0]!)), Math.min(...points.map(p => p[1]!)), Math.max(...points.map(p => p[0]!)), Math.max(...points.map(p => p[1]!))];
    const composed = await composeBriefingCanvas(handle, { extent });
    if ([...rasters.layers].some(([id, layer]) => site.layers.get(id)?.category === "optical" && layer.failedTiles() > 0)) throw new Error("Local basemap tiles could not be loaded.");
    const context = target.getContext("2d");
    if (!context) throw new Error("The briefing map needs a canvas context.");
    target.width = composed.width;
    target.height = composed.height;
    context.drawImage(composed, 0, 0);
  } finally {
    destroy.reverse().forEach(dispose => dispose());
  }
}

/**
 * Height of the fallback map, CSS px; the SVG uses one unit per CSS px at this height. Shorter than the 235 px canvas (FD-204): the
 * notice that names the failure shares the card's 253 px map block, so the card still prints on one page.
 */
const FALLBACK_HEIGHT = 180;
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The map when the canvas capture failed (T11.06, FD-137, FD-392): the SCR-01 thumbnail (the basemap's coarsest tile, no new
 * asset) with the route as SVG over it. Projected metres map linearly from `aoi.extent_m`, north up, one scale on both axes, so
 * the frame has the AOI's shape. OK legs follow their geometry; a NO ROUTE leg is the dashed straight line between its stops;
 * every stop is numbered, so it reads in black and white. Line and marker styles live in `scr08BriefingCard.css` (the CSP
 * forbids inline style attributes); only geometry is set here, through the CSSOM. No canvas, no network beyond the thumbnail.
 */
export function createBriefingFallback(site: LoadedSite, state: Pick<PlanState, "waypoints" | "result">): HTMLElement {
  const [minX, minY, maxX, maxY] = site.site.aoi.extent_m;
  const width = Math.round(FALLBACK_HEIGHT * (maxX - minX) / (maxY - minY));
  const point = (p: readonly number[]) => `${(p[0]! - minX) / (maxX - minX) * width},${(maxY - p[1]!) / (maxY - minY) * FALLBACK_HEIGHT}`;
  const host = document.createElement("div"); host.className = "scr08-fallback"; host.dataset.slot = "map-fallback";
  const frame = document.createElement("div"); frame.className = "scr08-fallback-frame"; frame.style.width = `${width}px`;
  host.append(frame);
  const basemap = site.site.layers.filter(l => l.kind === "raster_tiles").find(l => l.optional === false)
    ?? site.site.layers.find(l => l.kind === "raster_tiles");
  const url = thumbnailUrl(site);
  const markMissing = () => {
    const label = document.createElement("span"); label.className = "scr08-thumbnail-missing"; label.textContent = "Basemap —";
    label.dataset.provenance = "derived"; label.dataset.unavailable = "true"; label.dataset.source = "unavailable:briefing-thumbnail";
    frame.prepend(label);
  };
  if (url && basemap?.tile_grid) {
    const image = document.createElement("img"); image.src = url; image.alt = `Site context, ${site.site.name}`;
    image.dataset.provenance = basemap.provenance; image.dataset.source = basemap.source_ids.join(" ");
    const grid = basemap.tile_grid;
    const side = grid.tile_size_px * grid.resolutions_m[0]!;
    // The coarsest tile may extend beyond the AOI: keep its actual projected footprint, clipped by the frame.
    image.style.left = `${(grid.origin_m[0] - minX) / (maxX - minX) * 100}%`;
    image.style.top = `${(maxY - grid.origin_m[1]) / (maxY - minY) * 100}%`;
    image.style.width = `${side / (maxX - minX) * 100}%`; image.style.height = `${side / (maxY - minY) * 100}%`;
    image.addEventListener("error", () => { image.remove(); markMissing(); }, { once: true });
    frame.append(image);
  } else markMissing();
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${FALLBACK_HEIGHT}`); svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Planned route in projected metres, north up; dashed lines mark NO ROUTE legs");
  svg.dataset.provenance = "derived"; svg.dataset.source = "plan-store:result.legs.geometry plan-store:waypoints";
  const line = (className: string, coordinates: readonly (readonly number[])[]) => {
    const polyline = document.createElementNS(SVG_NS, "polyline");
    polyline.setAttribute("class", className); polyline.setAttribute("points", coordinates.map(point).join(" "));
    return polyline;
  };
  for (const leg of state.result?.legs ?? []) {
    const from = state.waypoints.find(w => w.id === leg.from), to = state.waypoints.find(w => w.id === leg.to);
    const coordinates = leg.status === "OK" ? leg.geometry : from && to ? [[from.x_m, from.y_m], [to.x_m, to.y_m]] : [];
    if (coordinates.length < 2) continue;
    svg.append(line("casing", coordinates), line(leg.status === "OK" ? "route" : "route no-route", coordinates));
  }
  state.waypoints.forEach((stop, index) => {
    const [x, y] = point([stop.x_m, stop.y_m]).split(",");
    const marker = document.createElementNS(SVG_NS, "circle");
    marker.setAttribute("class", "stop"); marker.setAttribute("cx", x!); marker.setAttribute("cy", y!); marker.setAttribute("r", "9");
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", x!); label.setAttribute("y", y!); label.textContent = String(index);
    svg.append(marker, label);
  });
  frame.append(svg);
  return host;
}
