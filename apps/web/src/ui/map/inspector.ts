/**
 * Point inspector popover (T07.12; FR-03, FR-15, NFR-05, 02 §D.1, 02 §E.2, 03 §D, 04 §A.3, §C.2, §E).
 *
 * - A map click (unless `shouldInspect` says the page has another use for it, such as add-stop mode) sends SAMPLE_POINT
 *   through the worker client with `snap_radius_m` 50 and the scenario's hard slope limit; `inspectAt(x, y)` is the
 *   same call for the keyboard crosshair (T13.06).
 * - The popover shows planetocentric latitude and east-positive longitude (5 decimals), elevation, slope and thermal
 *   inertia. Each value carries `data-provenance` and `data-source` taken from the manifest Layer it comes from
 *   (`elevation`, `slope`, `ti`: the C9 layer ids; `Layer.provenance`, `Layer.source_ids`); the position takes the
 *   elevation layer's, because the DEM gives the grid its frame (TODO(decision)). A value whose layer is not in the
 *   manifest is not shown: it reads "—", flagged unavailable. TI with no coverage reads "no data". Outside the AOI it
 *   says "Outside mapped area" and shows no value (FR-03).
 * - Text nodes only (no `innerHTML`). The chrome is neutral (`--panel`, `--edge`, `--text-1`, 12 px minimum); colour is
 *   used for status only, with icon and word: BLOCKED (⬣) for a hard hazard or a slope over the limit, UNKNOWN (?) for
 *   no data or a failed read.
 * - It opens beside the clicked point (flipped when it would leave the map), moves focus into the dialog, closes on
 *   Escape, on its CLOSE button and when the map moves, and returns focus to the map. The Escape listener exists only
 *   while it is open.
 * - Only the latest request is shown: an older response, a response after close or destroy, and a stale rejection are
 *   discarded; a rejection of the latest shows UNKNOWN and does not throw. Request ids are per inspector.
 *
 * CRS: projected metres only; never EPSG:3857, WGS84 or `ol/sphere` (02 §C.4.2).
 */
import type { Layer, Provenance, SampleReason, SampleResult } from "@marswalk/protocol";
import type { AppContext, MapHandle } from "../context";
import { UNAVAILABLE, provAttrs, unavailableOf, type Sourced } from "../components/provenance";
import { renderStatusIcon } from "../components/statusIcon";
import { formatLatLonE } from "./projection";

export interface PointInspectorOptions {
  /** Return false to leave a click to something else (add-stop mode, a POI hit). Default: inspect every click. */
  shouldInspect?: (coordinate: [number, number]) => boolean;
}

export interface PointInspector {
  /** Sample the point and show the popover. Never rejects. */
  inspectAt(x_m: number, y_m: number): Promise<void>;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

/** The parts of the map handle's OpenLayers map the inspector uses (C10: `getMap` is untyped). */
interface InspectorMap {
  on(type: "singleclick", listener: (event: { coordinate: number[] }) => void): unknown;
  un(type: "singleclick", listener: (event: { coordinate: number[] }) => void): void;
  getPixelFromCoordinate(coordinate: number[]): number[] | null;
  getSize(): number[] | undefined;
}

/** 02 §D.2, §E.2: snap radius of an inspected point, metres. */
const SNAP_RADIUS_M = 50;
/** Distance between the clicked point and the popover, pixels. */
const POPOVER_GAP_PX = 12;
/** The popover's minimum width, pixels; also its width when it cannot be measured. */
const POPOVER_MIN_WIDTH_PX = 240;

const REASON_WORDS: Partial<Record<SampleReason, string>> = {
  HARD_HAZARD: "hard hazard",
  SLOPE_OVER_LIMIT: "slope over the limit",
  NO_DATA: "no data",
};

const CHROME = [
  "position:absolute",
  "z-index:300",
  "min-width:" + POPOVER_MIN_WIDTH_PX + "px",
  "padding:12px",
  "background:var(--panel)",
  "border:1px solid var(--edge)",
  "color:var(--text-1)",
  "font-family:var(--font-mono)",
  "font-size:var(--text-micro)",
  "line-height:var(--line-height-ui)",
].join(";");

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** Fixed-decimal with a true minus sign. */
const fixed = (v: number, digits: number): string => `${v < 0 && Number(Math.abs(v).toFixed(digits)) !== 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;

/** Class and source of a value that comes from manifest layer `id`; a missing layer makes the value unavailable. */
function fromLayer(layers: ReadonlyMap<string, Layer>, id: string): { layer: Layer | undefined; sourced: Sourced; known: boolean } {
  const layer = layers.get(id);
  if (!layer) return { layer, sourced: unavailableOf(null, `layer.${id}`), known: false };
  return { layer, sourced: { prov: layer.provenance as Provenance, src: layer.source_ids.join(", ") }, known: true };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, css?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (css) node.style.cssText = css;
  return node;
}

/**
 * Wires the point inspector to the map and returns its controller. `destroy()` removes every listener and the popover.
 */
export function initPointInspector(mapHandle: MapHandle, ctx: AppContext, options: PointInspectorOptions = {}): PointInspector {
  const map = mapHandle.getMap<InspectorMap>();
  const host = mapHandle.getTargetElement();
  const id = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 8);

  let seq = 0;
  let requests = 0;
  let destroyed = false;
  let popover: HTMLElement | null = null;

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") dismiss(true);
  };

  /** Remove the popover and invalidate any request still in flight. */
  function dismiss(returnFocus: boolean): void {
    seq += 1;
    if (!popover) return;
    popover.remove();
    popover = null;
    document.removeEventListener("keydown", onKeydown);
    if (returnFocus && !destroyed) host.focus();
  }

  function place(root: HTMLElement, at: number[] | null): void {
    const size = map.getSize() ?? [0, 0];
    const width = root.offsetWidth || POPOVER_MIN_WIDTH_PX;
    const height = root.offsetHeight;
    let left = (at?.[0] ?? 0) + POPOVER_GAP_PX;
    let top = (at?.[1] ?? 0) + POPOVER_GAP_PX;
    // Flip to the other side of the point when the popover would leave the map.
    if (size[0] > 0 && left + width > size[0]) left = (at?.[0] ?? 0) - POPOVER_GAP_PX - width;
    if (size[1] > 0 && top + height > size[1]) top = (at?.[1] ?? 0) - POPOVER_GAP_PX - height;
    root.style.left = `${Math.max(0, left)}px`;
    root.style.top = `${Math.max(0, top)}px`;
  }

  function open(root: HTMLElement, x_m: number, y_m: number): void {
    popover?.remove();
    popover = root;
    host.appendChild(root);
    place(root, map.getPixelFromCoordinate([x_m, y_m]));
    root.focus();
    document.addEventListener("keydown", onKeydown);
  }

  function shell(): { root: HTMLElement; body: HTMLElement } {
    const root = el("div", undefined, CHROME);
    root.setAttribute("data-testid", "inspector-popover");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Point inspector");
    root.tabIndex = -1;

    const header = el("div", undefined, "display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;border-bottom:1px solid var(--edge);padding-bottom:6px");
    header.setAttribute("data-part", "header");
    header.appendChild(el("span", "POINT INSPECTOR", "color:var(--text-2);font-weight:600"));
    const close = el("button", "CLOSE", "min-height:var(--target-mouse);padding:4px 8px;background:var(--raised);color:var(--text-1);border:2px solid var(--edge);font:inherit;cursor:pointer");
    close.type = "button";
    close.addEventListener("click", () => dismiss(true));
    header.appendChild(close);
    root.appendChild(header);

    const body = el("div", undefined, "display:flex;flex-direction:column;gap:4px");
    root.appendChild(body);
    return { root, body };
  }

  function row(body: HTMLElement, label: string, field: string, text: string, sourced: Sourced): void {
    const line = el("div", undefined, "display:flex;justify-content:space-between;gap:16px");
    line.appendChild(el("span", label, "color:var(--text-2)"));
    const value = el("span", text, "font-weight:600");
    value.setAttribute("data-field", field);
    for (const [key, v] of Object.entries(provAttrs(sourced))) value.setAttribute(key, v);
    line.appendChild(value);
    body.appendChild(line);
  }

  function render(result: SampleResult, x_m: number, y_m: number): void {
    const { root, body } = shell();
    if (!result.inside_aoi) {
      body.appendChild(el("div", "Outside mapped area", "color:var(--text-2);padding:6px 0"));
      open(root, x_m, y_m);
      return;
    }

    const elevation = fromLayer(ctx.site.layers, "elevation");
    const slope = fromLayer(ctx.site.layers, "slope");
    const ti = fromLayer(ctx.site.layers, "ti");

    // A value is shown only with a manifest layer to label it; a missing value reads "—" in its layer's class.
    const shown = (known: boolean, value: number | null, format: (v: number) => string, missing: string): { text: string; unavailable: boolean } =>
      known && isNumber(value) ? { text: format(value), unavailable: false } : { text: missing, unavailable: true };
    const mark = (base: { sourced: Sourced; layer: Layer | undefined }, unavailable: boolean): Sourced =>
      unavailable && base.layer ? unavailableOf(base.layer.provenance as Provenance, `sample.${base.layer.layer_id}`) : base.sourced;

    const position =
      elevation.known && isNumber(result.lat) && isNumber(result.lon_e)
        ? { text: formatLatLonE(result.lat, result.lon_e), unavailable: false }
        : { text: UNAVAILABLE, unavailable: true };
    row(body, "POSITION", "position", position.text, position.unavailable ? unavailableOf(elevation.layer?.provenance ?? null, "sample.position") : elevation.sourced);

    const elev = shown(elevation.known, result.elevation_m, (v) => `${fixed(v, 1)} m`, UNAVAILABLE);
    row(body, "ELEVATION", "elevation", elev.text, mark(elevation, elev.unavailable));

    const slp = shown(slope.known, result.slope_p90_deg, (v) => `${fixed(v, 1)}°`, UNAVAILABLE);
    row(body, "SLOPE (P90)", "slope", slp.text, mark(slope, slp.unavailable));

    const tiShown = shown(ti.known, result.ti_tiu, (v) => `${Math.round(v)} tiu`, ti.known ? "no data" : UNAVAILABLE);
    row(body, "THERMAL INERTIA", "ti", tiShown.text, mark(ti, tiShown.unavailable));

    if (!result.passable && result.reason && result.reason !== "OUTSIDE_AOI") {
      const line = el("div", undefined, "display:flex;gap:8px;align-items:center;margin-top:8px");
      line.setAttribute("data-field", "passable");
      for (const [key, v] of Object.entries(provAttrs(slope.known ? { prov: "derived", src: slope.sourced.src } : unavailableOf("derived", "sample.passable")))) line.setAttribute(key, v);
      line.appendChild(renderStatusIcon(result.reason === "NO_DATA" ? "unknown" : "blocked"));
      line.appendChild(el("span", REASON_WORDS[result.reason] ?? result.reason.toLowerCase().replace(/_/g, " ")));
      body.appendChild(line);
    }
    open(root, x_m, y_m);
  }

  function renderFailure(x_m: number, y_m: number): void {
    const { root, body } = shell();
    const line = el("div", undefined, "display:flex;gap:8px;align-items:center");
    line.appendChild(renderStatusIcon("unknown"));
    line.appendChild(el("span", "Could not read this point."));
    body.appendChild(line);
    open(root, x_m, y_m);
  }

  async function inspectAt(x_m: number, y_m: number): Promise<void> {
    if (destroyed) return;
    seq += 1;
    const mine = seq;
    requests += 1;
    let result: SampleResult | null = null;
    try {
      result = await ctx.workerClient.samplePoint({
        request_id: `inspector-${id}-${requests}`,
        x_m,
        y_m,
        snap_radius_m: SNAP_RADIUS_M,
        hard_slope_limit_deg: ctx.planStore.get().scenario.hard_slope_limit_deg,
      });
    } catch {
      result = null;
    }
    // Discard whatever is no longer the latest request: a newer click, a close, a map move or a destroy came first.
    if (destroyed || mine !== seq) return;
    if (result) render(result, x_m, y_m);
    else renderFailure(x_m, y_m);
  }

  const onClick = (event: { coordinate: number[] }): void => {
    const coordinate: [number, number] = [event.coordinate[0], event.coordinate[1]];
    if (options.shouldInspect && !options.shouldInspect(coordinate)) return;
    void inspectAt(coordinate[0], coordinate[1]);
  };
  map.on("singleclick", onClick);
  const unsubscribeView = mapHandle.onViewChange(() => dismiss(false));

  return {
    inspectAt,
    close: () => dismiss(true),
    isOpen: () => popover !== null,
    destroy() {
      if (destroyed) return;
      dismiss(false);
      destroyed = true;
      map.un("singleclick", onClick);
      unsubscribeView();
    },
  };
}
