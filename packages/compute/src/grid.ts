/**
 * Routing-grid loading and addressing (docs/specs/05 §C RoutingGrid, §E.1, §E.3; 02 §E.1).
 * FR-03, FR-07. Implemented by TASK-05 (T05.16).
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
 * Input: grid metadata + raw ArrayBuffers. Output: LoadedGrid. TASK-05 (T05.16).
 *
 * Referential integrity (05 §E.3):
 * Rejects buffers whose dimensions do not match the grid metadata width * height.
 */
export function loadGrid(
  meta: RoutingGrid,
  buffers: {
    elevation: ArrayBuffer;
    slopeP90: ArrayBuffer;
    slopeMax: ArrayBuffer;
    flags: ArrayBuffer;
    ti?: ArrayBuffer;
    commHab: ArrayBuffer;
  },
): LoadedGrid {
  const expectedCount = meta.width * meta.height;

  if (buffers.elevation.byteLength !== expectedCount * Float32Array.BYTES_PER_ELEMENT) {
    throw new Error(
      `Elevation buffer byte length (${buffers.elevation.byteLength}) does not match expected length (${
        expectedCount * Float32Array.BYTES_PER_ELEMENT
      }) for ${meta.width}x${meta.height} grid.`,
    );
  }

  if (buffers.slopeP90.byteLength !== expectedCount) {
    throw new Error(
      `slopeP90 buffer byte length (${buffers.slopeP90.byteLength}) does not match expected length (${expectedCount}).`,
    );
  }

  if (buffers.slopeMax.byteLength !== expectedCount) {
    throw new Error(
      `slopeMax buffer byte length (${buffers.slopeMax.byteLength}) does not match expected length (${expectedCount}).`,
    );
  }

  if (buffers.flags.byteLength !== expectedCount) {
    throw new Error(
      `flags buffer byte length (${buffers.flags.byteLength}) does not match expected length (${expectedCount}).`,
    );
  }

  if (buffers.commHab.byteLength !== expectedCount) {
    throw new Error(
      `commHab buffer byte length (${buffers.commHab.byteLength}) does not match expected length (${expectedCount}).`,
    );
  }

  let ti: Float32Array | undefined;
  if (buffers.ti !== undefined) {
    if (buffers.ti.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
      throw new Error(`TI buffer byte length (${buffers.ti.byteLength}) is not a multiple of 4 bytes.`);
    }
    ti = new Float32Array(buffers.ti);
  }

  return {
    meta,
    elevation: new Float32Array(buffers.elevation),
    slopeP90: new Uint8Array(buffers.slopeP90),
    slopeMax: new Uint8Array(buffers.slopeMax),
    flags: new Uint8Array(buffers.flags),
    commHab: new Uint8Array(buffers.commHab),
    ti,
  };
}

/**
 * Array offset of the cell containing (x_m, y_m), or null outside the grid (05 §E.1).
 * Formula:
 *   i = floor((origin_y − y) / cell_m)
 *   j = floor((x − origin_x) / cell_m)
 *   offset = i * width + j
 */
export function cellIndex(grid: LoadedGrid, x_m: number, y_m: number): number | null {
  if (!Number.isFinite(x_m) || !Number.isFinite(y_m)) return null;
  const origin_x = grid.meta.origin_m[0];
  const origin_y = grid.meta.origin_m[1];
  const cell = grid.meta.cell_m;

  const i = Math.floor((origin_y - y_m) / cell);
  const j = Math.floor((x_m - origin_x) / cell);

  if (i < 0 || i >= grid.meta.height || j < 0 || j >= grid.meta.width) {
    return null;
  }

  return i * grid.meta.width + j;
}

/**
 * Decode a u8 slope value (degrees × 4) to degrees, or null for 255 (05 §C RoutingGrid).
 */
export function decodeSlopeDeg(value: number): number | null {
  if (value === 255) {
    return null;
  }
  return value / 4;
}
