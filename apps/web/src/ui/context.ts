/**
 * UI App Context & Shared Frontend Contracts — Contract C10 v3 (03 §A, 02 §E.2, 04 §B;
 * 01 FR-01, FR-02, FR-15, NFR-05; TASK-07, T07.01).
 *
 * Types and constants only. No logic or DOM execution in this file.
 * Imports only types from schema.ts (C1), worker.ts (C6), planStore.ts (C11) and `react`.
 *
 * Contract change v1 -> v2, 2026-11-11, decided by Sadman Shaharier Mahim (product lead) after reviewing
 * the v1 PR against main. v1 was never merged, so v2 is the first C10 on main; consumers: all frontend, design
 * and story code (docs/tasks/_coordination.md §d, C10). Main's conventions win:
 * - Source id attribute is `data-source` (not `data-source-id`), as `provAttrs` in components/provenance.ts writes it.
 *   This closes the C10 open point "attribute name for the source id (NFR-05)".
 * - Planner screens and shared UI are React components with props (ADR-012), not DOM-returning renderers:
 *   `ScreenComponent` / `ScreenProps` replace `ScreenRenderer`. Role screens (EVA, ops, HUD, Earth) take their own props.
 * - `PROVENANCE_VALUES` is derived from `Provenance` in packages/protocol (the compiler rejects a missing class).
 * - `MapHandle` v2 adds `panBy`, `zoomBy`, `getTargetElement` (focusable, tabindex 0), `getResolution` and
 *   `onViewChange`, so `KeyboardMapHandle` (ui/map/keyboard.ts) and `FullScreenMap`'s `view` prop consume it as is.
 * - `WorkerClient` carries `retry()` and `isCrashed()` (03 §D crash recovery); there is no separate extended type.
 * - Loaded assets keep the manifest `path` and carry a separate fetchable `url`.
 *
 * Contract change v2 -> v3, 12 Nov 2026, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority
 * (FD-063): `MapHandle.fitExtent(extent, { animate })` takes an options argument, so a caller that must not animate
 * (the warnings list under `prefers-reduced-motion`) says so; every fit is instant under that preference. Existing
 * one-argument callers compile unchanged. `LAYER_Z_INDEX` carries the decided traverse and waypoint slots (FD-040).
 */
import type { ReactElement } from "react";
import type { Asset, DataSource, Layer, POIFeature, Provenance, Site } from "@marswalk/protocol";
import type {
  ComputePlanRequest,
  PlanResultMessage,
  SamplePointRequest,
  SampleResult,
  WorkerRequest,
  WorkerResponse,
} from "@marswalk/protocol";
import type { PlanStore } from "../state/planStore";

/**
 * An Asset as loaded: `path` is the manifest value (relative to the site folder, 05 §C Asset), `url` is where the
 * app fetches it from (`sites/<site_id>/<path>`, relative to the app base, 02 §E.1).
 */
export interface LoadedAsset extends Asset {
  url: string;
}

/**
 * In-memory site model with pre-indexed hash maps for O(1) lookups (05 §E.1).
 */
export interface LoadedSite {
  site: Site;
  layers: Map<string, Layer>;
  sources: Map<string, DataSource>;
  assets: Map<string, LoadedAsset>;
  pois: Map<string, POIFeature>;
}

/**
 * Diagnostic or boot failure details when loading site assets (03 §D).
 */
export interface BootProblem {
  code: string;
  message: string;
  missingFile?: string;
  details?: unknown;
}

/**
 * Validator function signature for verifying site manifest structure at boot.
 */
export type SiteValidator = (site: Site) => BootProblem[] | Promise<BootProblem[]>;

/**
 * Map view in working-projection metres (IAU_2015:49900). Same fields as `FullScreenMap`'s `view` prop.
 */
export interface MapView {
  center_x_m: number;
  center_y_m: number;
  /** Metres per pixel; always > 0. */
  resolution_m_per_px: number;
}

/**
 * Generic handle to the shared OpenLayers map workspace without binding OL types directly (MapHandle v2).
 * Coordinates are working-projection metres; never EPSG:3857 or WGS84 (02 §C.1).
 */
export interface MapHandle {
  getMap<T = unknown>(): T;
  /**
   * The element that owns map focus: `tabindex="0"`, so the keyboard layer (04 §E) can pan and zoom only while the
   * map has focus.
   */
  getTargetElement(): HTMLElement;
  /**
   * Fit the view to `extent` (projected metres). `animate: false` is an instant move, and `prefers-reduced-motion` makes
   * every fit instant (C10 v3, FD-063; 04 §E Motion).
   */
  fitExtent(extent: [number, number, number, number], options?: { animate?: boolean }): void;
  setCenter(coord: [number, number]): void;
  getCenter(): [number, number];
  setZoom(zoom: number): void;
  getZoom(): number | undefined;
  /** Metres per pixel, or undefined before the view exists. */
  getResolution(): number | undefined;
  /**
   * Move the view by (dx_px, dy_px) screen pixels, y down: a negative dy shows more to the north (ArrowUp).
   * `animate: false` is an instant move (prefers-reduced-motion, 04 §E Motion).
   */
  panBy(dx_px: number, dy_px: number, options?: { animate?: boolean }): void;
  /** Zoom by `delta` levels (+1 in, -1 out). */
  zoomBy(delta: number, options?: { animate?: boolean }): void;
  /**
   * Subscribe to view changes (centre or resolution). The listener is not called on subscribe; read `getCenter()` and
   * `getResolution()` for the current view. Returns an unsubscribe callback.
   */
  onViewChange(listener: (view: MapView) => void): () => void;
  destroy(): void;
}

/**
 * Asynchronous worker client interface over the C6 Web Worker messaging contract (02 §E.2).
 */
export interface WorkerClient {
  samplePoint(req: Omit<SamplePointRequest, "type">): Promise<SampleResult>;
  computePlan(req: Omit<ComputePlanRequest, "type">): Promise<PlanResultMessage>;
  postMessage(message: WorkerRequest): void;
  onMessage(listener: (message: WorkerResponse) => void): () => void;
  /** After this the client rejects every call. */
  terminate(): void;
  /** Restart a crashed worker (03 §D). Requests pending at that moment are rejected, not dropped. */
  retry(): void;
  /** True after a worker crash until `retry()`. */
  isCrashed(): boolean;
}

/**
 * Global application runtime context passed to the planner screens and panels.
 */
export interface AppContext {
  site: LoadedSite;
  planStore: PlanStore;
  workerClient: WorkerClient;
  mapHandle?: MapHandle;
  debug: boolean;
}

/** Props of a planner screen (SCR-01…SCR-09). Role screens (EVA, ops, HUD, Earth) take their own props. */
export interface ScreenProps {
  ctx: AppContext;
}

/** A planner screen: a React component (ADR-012) that receives the app context. */
export type ScreenComponent = (props: ScreenProps) => ReactElement;

/**
 * Fixed map layer z-indices / stack order per FR-02:
 * basemap < hillshade < scientific overlay < hazards < route < POIs.
 *
 * Decided (FD-040, open point 7): the traverse sits above the hazards and below the route, because it is context; the
 * waypoints sit above the route and below the POIs, because they are the plan.
 */
export const LAYER_Z_INDEX = {
  BASEMAP: 10,
  HILLSHADE: 20,
  SCIENTIFIC_OVERLAY: 30,
  HAZARDS: 40,
  TRAVERSE: 45,
  ROUTE: 50,
  WAYPOINTS: 55,
  /** FR-45 stop-type markers: above the waypoints, under the POI pins they annotate (T07.18). */
  EZ: 58,
  POIS: 60,
} as const;

/**
 * HTML attribute name for the provenance class of a displayed value (FR-15, NFR-05).
 */
export const PROVENANCE_ATTR = "data-provenance" as const;

/**
 * HTML attribute name for the source id of a displayed value (NFR-05). Decided 2026-11-11 (C10 v2).
 */
export const SOURCE_ATTR = "data-source" as const;

/** One entry per `Provenance` class: a missing or extra class is a compile error (record keys are exhaustive). */
const PROVENANCE_CLASSES: Record<Provenance, true> = {
  measured: true,
  derived: true,
  modelled: true,
  assumed: true,
  replayed: true,
  simulated: true,
};

/**
 * Permitted provenance values across all displayed metrics (FR-15, NFR-05), derived from the protocol `Provenance`.
 */
export const PROVENANCE_VALUES: readonly Provenance[] = Object.keys(PROVENANCE_CLASSES) as Provenance[];

/**
 * Supported URL search parameters for runtime configuration.
 */
export const URL_PARAMS = {
  SITE: "site",
  DEBUG: "debug",
  MOCK_WORKER: "mock_worker",
} as const;
