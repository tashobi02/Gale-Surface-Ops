/**
 * Two-way linking between profile chart hover/scrub and map location (FR-08).
 * Stub for T09.05. Wiring, not rendering: call it from an effect and return its cleanup.
 */
import type { MapHandle } from "../context";

/** Link `profileElement` to the map; returns the unlink callback. */
export function linkProfileToMap(mapHandle: MapHandle, profileElement: HTMLElement): () => void {
  throw new Error("TODO(T09.05): linkProfileToMap not implemented");
}
