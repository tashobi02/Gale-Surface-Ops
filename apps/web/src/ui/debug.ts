import "./debug.css";
/**
 * Debug diagnostics overlay for `?debug=1` (T07.13; NFR-11, 02 §F, 05 §E.1; C10 v2 React component).
 *
 * Shows FPS, the timings of the latest PLAN_RESULT, the routing-grid cell under the pointer and the site data
 * version. Without `ctx.debug` it renders nothing and registers nothing (no listener, no animation frame).
 *
 * - A value that has not been measured yet reads "—" (flagged `data-unavailable`), never a placeholder number: FPS
 *   until a full second of frames has been counted, the worker timing until a PLAN_RESULT arrives, the cell until
 *   the pointer moves over the map.
 * - Every value carries `data-provenance` and `data-source` (FR-15): FPS and worker timings are `measured` in this
 *   browser, the cell is `derived` from the manifest grid by the 05 §E.1 formula, the data version is `derived`
 *   from the manifest.
 * - Text nodes only (React); print is suppressed by a real `@media print` rule; chrome uses design tokens and the
 *   12 px minimum (04 §C.2).
 */
import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import type { RoutingGrid } from "@marswalk/protocol";
import type { AppContext } from "./context";
import { UNAVAILABLE, provAttrs, unavailableOf, type Sourced } from "./components/provenance";

/** The parts of the manifest grid the cell address needs (05 §C RoutingGrid). */
export type GridMetadata = Pick<RoutingGrid, "cell_m" | "origin_m" | "width" | "height">;

export interface GridCell {
  /** Row, counted from the north edge. */
  i: number;
  /** Column, counted from the west edge. */
  j: number;
}

/**
 * Grid cell of a point in working-projection metres, 05 §E.1:
 * `i = floor((origin_y − y)/cell)`, `j = floor((x − origin_x)/cell)`. Null outside the grid.
 */
export function computeGridCell(x_m: number, y_m: number, grid: GridMetadata): GridCell | null {
  const [originX, originY] = grid.origin_m;
  const j = Math.floor((x_m - originX) / grid.cell_m);
  const i = Math.floor((originY - y_m) / grid.cell_m);
  if (i < 0 || i >= grid.height || j < 0 || j >= grid.width) return null;
  return { i, j };
}

/** True when the query string has `debug=1` (URL_PARAMS.DEBUG in context.ts). Defaults to the page's own. */
export function isDebugParamEnabled(search?: string): boolean {
  const query = search ?? (typeof window !== "undefined" ? window.location.search : "");
  return new URLSearchParams(query).get("debug") === "1";
}

export interface DebugOverlayProps {
  ctx: AppContext;
}

/** The pointer events of the map handle's OpenLayers map that the overlay listens to (C10: `getMap` is untyped). */
interface PointerSource {
  on(type: "pointermove", listener: (event: { coordinate: number[] }) => void): unknown;
  un(type: "pointermove", listener: (event: { coordinate: number[] }) => void): void;
}


const PANEL: CSSProperties = {
  position: "fixed",
  top: "8px",
  left: "8px",
  zIndex: 9999,
  padding: "6px 10px",
  background: "var(--panel)",
  border: "1px solid var(--edge)",
  color: "var(--text-1)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-micro)",
  lineHeight: "var(--line-height-ui)",
  pointerEvents: "none",
  userSelect: "none",
};

/** One diagnostic line: label, then the value with its provenance and source. */
function Row(props: { name: string; label: string; text: string; sourced: Sourced }): ReactElement {
  return createElement(
    "div",
    { "data-debug": props.name, ...provAttrs(props.sourced) },
    createElement("span", { style: { color: "var(--text-2)" } }, `${props.label} `),
    createElement("span", { style: { fontWeight: 600 } }, props.text),
  );
}

/** Frames per second over each full second of animation frames; null until the first second is complete. */
function useFps(): number | null {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    if (typeof requestAnimationFrame !== "function") return;
    let frames = 0;
    let windowStart: number | null = null;
    let handle: number | null = null;
    const tick = (now: number): void => {
      if (windowStart === null) {
        windowStart = now;
      } else {
        frames += 1;
        if (now - windowStart >= 1000) {
          setFps(Math.round((frames * 1000) / (now - windowStart)));
          frames = 0;
          windowStart = now;
        }
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      if (handle !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle);
    };
  }, []);
  return fps;
}

function DebugPanel({ ctx }: DebugOverlayProps): ReactElement {
  const fps = useFps();
  const [timing, setTiming] = useState<Record<string, number> | null>(null);
  // `undefined`: pointer not seen yet; `null`: outside the grid
  const [cell, setCell] = useState<GridCell | null | undefined>(undefined);
  const grid = useRef<GridMetadata>(ctx.site.site.grid);
  grid.current = ctx.site.site.grid;

  useEffect(
    () =>
      ctx.workerClient.onMessage((message) => {
        if (message.type === "PLAN_RESULT") setTiming(message.timing_ms);
      }),
    [ctx.workerClient],
  );

  useEffect(() => {
    if (!ctx.mapHandle) return;
    const map = ctx.mapHandle.getMap<PointerSource>();
    const onMove = (event: { coordinate: number[] }): void => {
      const [x, y] = event.coordinate;
      setCell(computeGridCell(x, y, grid.current));
    };
    map.on("pointermove", onMove);
    return () => map.un("pointermove", onMove);
  }, [ctx.mapHandle]);

  const timingText =
    timing === null
      ? UNAVAILABLE
      : Object.entries(timing)
          .map(([name, ms]) => `${name} ${ms.toFixed(1)} ms`)
          .join(", ");
  const cellText = cell === undefined ? UNAVAILABLE : cell === null ? "outside grid" : `[${cell.i}, ${cell.j}]`;

  return createElement(
    "div",
    { "data-testid": "debug-overlay", role: "group", "aria-label": "Diagnostics", style: PANEL },
    createElement("div", { style: { color: "var(--text-2)" } }, "DIAGNOSTICS ?debug=1"),
    createElement(Row, {
      name: "fps",
      label: "FPS",
      text: fps === null ? UNAVAILABLE : String(fps),
      sourced: fps === null ? unavailableOf("measured", "debug.fps") : { prov: "measured", src: "browser:requestAnimationFrame" },
    }),
    createElement(Row, {
      name: "worker",
      label: "Worker",
      text: timingText,
      sourced: timing === null ? unavailableOf("measured", "debug.worker_timing_ms") : { prov: "measured", src: "worker:PLAN_RESULT.timing_ms" },
    }),
    createElement(Row, {
      name: "cell",
      label: "Cell",
      text: cellText,
      sourced: cell === undefined ? unavailableOf("derived", "debug.grid_cell") : { prov: "derived", src: "manifest:grid (05 §E.1)" },
    }),
    createElement(Row, {
      name: "data-version",
      label: "Data",
      text: ctx.site.site.data_version,
      sourced: { prov: "derived", src: "manifest:data_version" },
    }),
  );
}

/** The `?debug=1` overlay: nothing at all unless `ctx.debug` (NFR-11). */
export function DebugOverlay(props: DebugOverlayProps): ReactElement {
  return props.ctx.debug ? createElement(DebugPanel, { ctx: props.ctx }) : createElement(NothingToShow);
}

function NothingToShow(): null {
  return null;
}
