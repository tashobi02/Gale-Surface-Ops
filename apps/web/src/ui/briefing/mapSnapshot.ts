/** Local OpenLayers canvas composition (FR-14, T11.04). Projected metres only. */
import RegularShape from "ol/style/RegularShape.js";
import type VectorLayer from "ol/layer/Vector.js";
import type OlMap from "ol/Map.js";
import type { LoadedSite, MapHandle } from "../context";
import type { PlanStore } from "../../state/planStore";

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
export async function captureBriefingMap(target: HTMLElement, site: LoadedSite, planStore: PlanStore): Promise<string> {
  const [{ createMap }, { createRasterLayers }, { createRouteLayer }, { createWaypointLayer }] = await Promise.all([
    import("../map/createMap"), import("../map/rasterLayers"), import("../map/routeLayer"), import("../map/waypointLayer"),
  ]);
  const handle = createMap({ target, site, keyboard: false });
  const destroy: (() => void)[] = [() => handle.destroy()];
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
    const url = await createMapSnapshotDataUrl(handle, { extent });
    if ([...rasters.layers].some(([id, layer]) => site.layers.get(id)?.category === "optical" && layer.failedTiles() > 0)) throw new Error("Local basemap tiles could not be loaded.");
    return url;
  } finally {
    destroy.reverse().forEach(dispose => dispose());
  }
}
