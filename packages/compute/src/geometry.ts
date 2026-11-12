/**
 * Bearing and distance between two points of the working projection (docs/specs/02 §C.1; 01 FR-33; backend decision
 * BD-95, T32.31). Pure planar geometry in projected metres: x is east, y is north. No Earth or Mars radius, no
 * spherical-distance helper and no geodesic is used (CLAUDE.md §2): the working projection's metres are the unit, and a
 * straight line in it is the "straight-line horizontal distance" the HUD shows. TASK-32.
 */

interface XY {
  x_m: number;
  y_m: number;
}

function finite(p: XY, name: string): void {
  if (!Number.isFinite(p.x_m) || !Number.isFinite(p.y_m)) throw new RangeError(`${name}: a coordinate is not finite (${p.x_m}, ${p.y_m})`);
}

/**
 * Compass bearing from `from` to `to`: degrees in [0, 360), clockwise from grid north (+y of the working projection),
 * so +y is 0, +x is 90, -y is 180 and -x is 270. Two coincident points have no direction and give 0 (a convention, never
 * NaN). Throws RangeError for a non-finite coordinate. Grid north is the projection's +y, not true north (BD-95).
 */
export function bearingDeg(from: XY, to: XY): number {
  finite(from, "bearingDeg");
  finite(to, "bearingDeg");
  const dx = to.x_m - from.x_m;
  const dy = to.y_m - from.y_m;
  if (dx === 0 && dy === 0) return 0;
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  const b = deg < 0 ? deg + 360 : deg;
  // A hair west of north adds up to exactly 360 in floating point; the range is half-open, and -0 must not appear.
  return b >= 360 || b === 0 ? 0 : b;
}

/** Straight-line horizontal distance between two points, projected metres (`Math.hypot`). Throws RangeError for a non-finite coordinate. */
export function horizontalDistanceM(from: XY, to: XY): number {
  finite(from, "horizontalDistanceM");
  finite(to, "horizontalDistanceM");
  return Math.hypot(to.x_m - from.x_m, to.y_m - from.y_m);
}
