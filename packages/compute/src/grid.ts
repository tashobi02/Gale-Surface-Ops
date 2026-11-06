/**
 * Routing-grid loading and addressing (docs/specs/05 §C RoutingGrid, §E.1; 02 §E.1).
 * FR-03, FR-07. Implemented by TASK-05.
 */
import type { RoutingGrid } from "@marswalk/protocol";

/** In-memory arrays for one site, row-major, north-up (02 §E.1). */
export interface LoadedGrid {
  meta: RoutingGrid;
  /** Metres. */
  elevation: Float32Array;
  /** Degrees × 4, 255 = no data. */
  slopeP90: Uint8Array;
  slopeMax: Uint8Array;
  /** Bitfield, see FLAG_BITS. */
  flags: Uint8Array;
  /** tiu on the 100 m sidecar grid; absent if the TI layer is unavailable (05 §E.6). */
  ti?: Float32Array;
  /**
   * v2: 1 = line of sight to the hab mast, 0 = none, 255 = no data (05 RoutingGrid comm_hab_asset).
   * Added by Obidit Islam for Mishkat Ahmed Khan (T05.16 owner) after the T03.01 C4 review.
   */
  commHab: Uint8Array;
}

/**
 * Wrap fetched little-endian buffers as typed arrays and check shared dimensions.
 * Input: grid metadata + raw ArrayBuffers. Output: LoadedGrid. TASK-05.
 */
export function loadGrid(
  meta: RoutingGrid,
  buffers: { elevation: ArrayBuffer; slopeP90: ArrayBuffer; slopeMax: ArrayBuffer; flags: ArrayBuffer; ti?: ArrayBuffer; commHab: ArrayBuffer },
): LoadedGrid {
  throw new Error("TODO(TASK-05): not implemented");
}

/**
 * Array offset of the cell containing (x_m, y_m), or null outside the grid (05 §E.1).
 * Input: metres in the working projection. Output: index i*width + j. TASK-05.
 */
export function cellIndex(grid: LoadedGrid, x_m: number, y_m: number): number | null {
  throw new Error("TODO(TASK-05): not implemented");
}

/**
 * Decode a u8 slope value (degrees × 4) to degrees, or null for 255 (05 §C RoutingGrid). TASK-05.
 */
export function decodeSlopeDeg(value: number): number | null {
  throw new Error("TODO(TASK-05): not implemented");
}
