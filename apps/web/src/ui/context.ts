/**
 * UI App Context & Shared Frontend Contracts (Contract C10 v1).
 * (03 §A, 02 §E.2, 04 §B, 01 FR-01, FR-02, FR-15, NFR-05; TASK-07).
 *
 * Types and constants only. No logic or DOM execution in this file.
 * Imports only types from schema.ts (C1), worker.ts (C6), and planStore.ts (C11).
 */
import type {
  Asset,
  DataSource,
  Layer,
  POIFeature,
  Site,
} from "@marswalk/protocol";
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
 * In-memory site model with pre-indexed hash maps for O(1) lookups (05 §E.1).
 */
export interface LoadedSite {
  site: Site;
  layers: Map<string, Layer>;
  sources: Map<string, DataSource>;
  assets: Map<string, Asset>;
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
export type SiteValidator = (site: Site) => BootProblem[];

/**
 * Generic handle to the shared OpenLayers map workspace without binding OL types directly.
 */
export interface MapHandle {
  getMap<T = unknown>(): T;
  fitExtent(extent: [number, number, number, number]): void;
  setCenter(coord: [number, number]): void;
  getCenter(): [number, number];
  setZoom(zoom: number): void;
  getZoom(): number | undefined;
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
  terminate(): void;
}

/**
 * Global application runtime context passed to screen renderers and panels.
 */
export interface AppContext {
  site: LoadedSite;
  planStore: PlanStore;
  workerClient: WorkerClient;
  mapHandle?: MapHandle;
  debug: boolean;
}

/**
 * Standard screen renderer signature for root hash views (03 §A, 04 §B).
 */
export type ScreenRenderer = (root: HTMLElement, ctx: AppContext) => void | (() => void);

/**
 * Fixed map layer z-indices / stack order per FR-02:
 * basemap < hillshade < scientific overlay < hazards < route < POIs.
 *
 * Open point 7: Traverse and waypoints positions are TODO(decision).
 */
export const LAYER_Z_INDEX = {
  BASEMAP: 10,
  HILLSHADE: 20,
  SCIENTIFIC_OVERLAY: 30,
  HAZARDS: 40,
  TRAVERSE: 45, // TODO(decision): open point 7 (traverse layer stack position)
  ROUTE: 50,
  WAYPOINTS: 55, // TODO(decision): open point 7 (waypoint layer stack position)
  POIS: 60,
} as const;

/**
 * HTML attribute name for scientific/operational value provenance (FR-15, NFR-05).
 */
export const PROVENANCE_ATTR = "data-provenance" as const;

/**
 * Permitted provenance values across all displayed metrics (FR-15, NFR-05).
 */
export const PROVENANCE_VALUES = [
  "measured",
  "derived",
  "modelled",
  "assumed",
  "replayed",
  "simulated",
] as const;

export type ProvenanceKind = (typeof PROVENANCE_VALUES)[number];

/**
 * HTML attribute name for citing data source ID (NFR-05).
 * TODO(decision): open point 8 (source-id attribute name, e.g. "data-source-id").
 */
export const SOURCE_ID_ATTR = "data-source-id" as const;

/**
 * Supported URL search parameters for runtime configuration.
 */
export const URL_PARAMS = {
  SITE: "site",
  DEBUG: "debug",
  MOCK_WORKER: "mock_worker",
} as const;
