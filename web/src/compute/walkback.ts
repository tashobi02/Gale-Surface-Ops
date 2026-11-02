/**
 * Walkback distance (docs/specs/02 §D.3). FR-09. Implemented by TASK-05.
 * At a route point: min(distance back along the route to start, remaining route distance to
 * the end if the route is a loop). The maximum over the route is compared with the limit.
 */

/**
 * Input: cumulative route distances (m) and loop flag. Output: max walkback (km). TASK-05.
 */
export function maxWalkbackKm(cumulativeDistM: number[], loop: boolean): number {
  throw new Error("TODO(TASK-05): not implemented");
}
