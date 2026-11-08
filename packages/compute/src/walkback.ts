/**
 * Walkback distance (docs/specs/02 §D.3). FR-09. Implemented by TASK-05 (T05.23).
 * At a route point: min(distance back along the route to start, remaining route distance to
 * the end if the route is a loop). The maximum over the route is compared with the limit.
 */

/**
 * Input: cumulative route distances (m) and loop flag. Output: max walkback (km).
 *
 * Loop: per point, min(distance back along route, remaining distance to end).
 * One-way: distance back along route.
 * Returns the maximum over the route in km (02 §D.3).
 */
export function maxWalkbackKm(cumulativeDistM: number[], loop: boolean): number {
  if (cumulativeDistM.length === 0) {
    return 0;
  }

  const totalM = cumulativeDistM[cumulativeDistM.length - 1];
  let maxWbM = 0;

  for (const s of cumulativeDistM) {
    const wb = loop ? Math.min(s, Math.max(0, totalM - s)) : s;
    if (wb > maxWbM) {
      maxWbM = wb;
    }
  }

  return maxWbM / 1000;
}
