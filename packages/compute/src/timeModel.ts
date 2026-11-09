/**
 * Walking time model (docs/specs/02 §D.3; ADR-005). FR-09. Implemented by TASK-05 (T05.22).
 * Label: modelled — Earth hiking function scaled to an Apollo lunar planning speed;
 * not validated for Mars suits or 0.38 g.
 */
import type { MissionScenario, PlanResult, Waypoint } from "@marswalk/protocol";

/**
 * Suited walking speed for a signed gradient S = Δz/d (uphill positive).
 * Formula: v(S) = v0 · exp(−3.5·|S + 0.05|) / exp(−0.175) (02 §D.2).
 * Input: S (dimensionless), v0 (km/h, flat suited speed). Output: km/h.
 */
export function suitedSpeedKmh(gradient: number, v0Kmh: number): number {
  return (v0Kmh * Math.exp(-3.5 * Math.abs(gradient + 0.05))) / Math.exp(-0.175);
}

/**
 * Time for one grid step. Input: horizontal step d (m), Δz (m), v0 (km/h), caution multiplier.
 * Output: hours (02 §D.2).
 */
export function stepTimeH(dM: number, dzM: number, v0Kmh: number, multiplier: number): number {
  if (dM === 0 && dzM === 0) {
    return 0;
  }
  const length3DM = Math.hypot(dM, dzM);
  const gradient = dM === 0 ? (dzM > 0 ? 100 : -100) : dzM / dM;
  const speedKmh = suitedSpeedKmh(gradient, v0Kmh);
  const distKm = length3DM / 1000;
  return (distKm / speedKmh) * multiplier;
}

/**
 * EVA timeline: start + Σ leg walk time + Σ dwell. Output: per-stop arrival/departure (UTC).
 * LTST and sun elevation are filled in by mars24.ts (02 §D.3).
 */
export function evaTimeline(
  scenario: MissionScenario,
  waypoints: Waypoint[],
  legWalkMin: number[],
): Pick<PlanResult["stops_timeline"][number], "arrive_utc" | "depart_utc">[] {
  if (waypoints.length === 0) {
    return [];
  }

  const startMs = Date.parse(scenario.eva_start_utc);
  const dwellPerStopMs = (scenario.dwell_min_per_stop ?? 0) * 60 * 1000;

  const result: Pick<PlanResult["stops_timeline"][number], "arrive_utc" | "depart_utc">[] = [];

  let currentMs = startMs;

  // Waypoint 0 (start): arrives and departs at EVA start
  result.push({
    arrive_utc: new Date(currentMs).toISOString(),
    depart_utc: new Date(currentMs).toISOString(),
  });

  for (let i = 1; i < waypoints.length; i++) {
    const walkMin = legWalkMin[i - 1] ?? 0;
    const walkMs = walkMin * 60 * 1000;
    const arriveMs = currentMs + walkMs;

    const isStop = waypoints[i].role === "stop";
    const dwellMs = isStop ? dwellPerStopMs : 0;
    const departMs = arriveMs + dwellMs;

    result.push({
      arrive_utc: new Date(arriveMs).toISOString(),
      depart_utc: new Date(departMs).toISOString(),
    });

    currentMs = departMs;
  }

  // Loop closing leg: return to start waypoint (hab)
  if (
    scenario.loop &&
    waypoints.length >= 2 &&
    legWalkMin.length >= waypoints.length &&
    waypoints[waypoints.length - 1].role !== "start"
  ) {
    const returnWalkMin = legWalkMin[waypoints.length - 1] ?? 0;
    const returnWalkMs = returnWalkMin * 60 * 1000;
    const returnArriveMs = currentMs + returnWalkMs;

    result.push({
      arrive_utc: new Date(returnArriveMs).toISOString(),
      depart_utc: new Date(returnArriveMs).toISOString(),
    });
  }

  return result;
}
