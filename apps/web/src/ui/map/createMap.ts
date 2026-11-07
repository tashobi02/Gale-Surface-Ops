/**
 * Map initialization and view binding in IAU_2015:49900 Mars CRS (02 §B, 04 §B).
 * Stub for T07.06.
 */
import type { LoadedSite, MapHandle } from "../context";

export interface CreateMapOptions {
  target: HTMLElement | string;
  site: LoadedSite;
}

export function createMap(options: CreateMapOptions): MapHandle {
  throw new Error("TODO(T07.06): createMap not implemented");
}
