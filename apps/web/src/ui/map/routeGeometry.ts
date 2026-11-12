/**
 * Geometry of a route leg in working-projection metres (IAU_2015:49900; 02 §C.1): slicing a polyline between two
 * along-track distances and the extent of that stretch. Shared by the route layer (hazard overlay, T09.01) and the
 * click-to-zoom of a located warning (T09.04, T09.03). Plain arithmetic on projected metres: never `ol/sphere`.
 *
 * FD-082: distances are along-leg; interpolation clamps to the simplified projected polyline.
 */
import type { Leg } from "@marswalk/protocol";

export type Coord = [number, number];
export type Extent = [number, number, number, number];

/** The part of `coords` between `from_m` and `to_m` along the line; [] for fewer than two points or an empty range. */
export function sliceAlongTrack(coords: readonly Coord[], from_m: number, to_m: number): Coord[] {
  if (coords.length < 2 || !(to_m > from_m)) return [];
  const out: Coord[] = [];
  const push = (p: Coord): void => {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  };
  let start = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i]!;
    const [x2, y2] = coords[i + 1]!;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const end = start + len;
    if (len > 0 && end > from_m && start < to_m) {
      const at = (d: number): Coord => {
        const t = (Math.min(Math.max(d, start), end) - start) / len;
        return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
      };
      push(at(from_m));
      push(at(to_m));
    }
    start = end;
    if (start >= to_m) break;
  }
  return out.length >= 2 ? out : [];
}

/** Bounding box of the stretch of an OK leg, or null when there is nothing to fit (no such leg, NO_ROUTE, no stretch). */
export function legStretchExtent(legs: readonly Leg[], legIndex: number, from_m: number, to_m: number): Extent | null {
  const leg = legs[legIndex];
  if (!leg || leg.status !== "OK") return null;
  const stretch = sliceAlongTrack(leg.geometry, from_m, to_m);
  if (stretch.length === 0) return null;
  const xs = stretch.map((p) => p[0]);
  const ys = stretch.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Interpolated display coordinate at an along-leg distance, clamped to the simplified projected line (FD-082). */
export function pointAlongTrack(coords: readonly Coord[], distance_m: number): Coord | null {
  if (!coords.length || !Number.isFinite(distance_m)) return null;
  let remaining = Math.max(0, distance_m);
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!, b = coords[i]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > 0 && remaining <= length) {
      const t = remaining / length;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    remaining -= length;
  }
  return [...coords[coords.length - 1]!];
}
