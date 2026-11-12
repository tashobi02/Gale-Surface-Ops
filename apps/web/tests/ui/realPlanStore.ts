/**
 * Test helper: the real C11 plan store (`createPlanStore`) on a fake worker client that records every COMPUTE_PLAN and lets a
 * test answer it, so a panel test can count what the UI sent and when (03 §C.3: 300 ms debounce, immediate reorder).
 */
import { vi } from "vitest";
import type { MissionScenario, PlanResultMessage, Waypoint } from "@marswalk/protocol";
import type { ComputePlanRequest } from "@marswalk/protocol";
import { DEFAULT_SCENARIO, createPlanStore, type PlanState, type PlanStore } from "../../src/state/planStore";
import okFixture from "../fixtures/plan-results/ok.json";

type Request = Omit<ComputePlanRequest, "type">;

export interface Call {
  req: Request;
  resolve(message: PlanResultMessage): void;
  reject(error: unknown): void;
}

export interface RealPlan {
  store: PlanStore;
  calls: Call[];
  /** Answer the newest request with the canned OK result, plus any fields in `over`. */
  answer(over?: Partial<PlanResultMessage>): void;
}

/** The F4 mock site's start (`default_start`) and its one POI (`poi-boxwork-ridge`). */
export const START: Waypoint = { id: "wp-0", role: "start", x_m: -1800, y_m: -1500, label: "Habitat / rover" };
export const STOP_POI: Waypoint = { id: "wp-1", role: "stop", x_m: 410, y_m: 325, poi_id: "poi-boxwork-ridge" };
export const STOP_FREE: Waypoint = { id: "wp-2", role: "stop", x_m: 200, y_m: 0 };
export const START_UTC = "2026-11-14T08:00:00Z";

export function realPlan(initial: Partial<PlanState> = {}): RealPlan {
  const calls: Call[] = [];
  const store = createPlanStore(
    { scenario: { ...DEFAULT_SCENARIO, eva_start_utc: START_UTC } as MissionScenario, waypoints: [START], ...initial },
    {
      workerClient: {
        computePlan: (req: Request) => new Promise<PlanResultMessage>((resolve, reject) => calls.push({ req, resolve, reject })),
        retry: vi.fn(),
        isCrashed: () => false,
      },
      siteId: "mock_site",
      dataVersion: "mock_site-test",
    },
  );
  return {
    store,
    calls,
    answer(over = {}) {
      const last = calls[calls.length - 1];
      if (!last) throw new Error("no COMPUTE_PLAN to answer");
      last.resolve({ ...(okFixture as PlanResultMessage), plan_revision: last.req.plan_revision, ...over });
    },
  };
}
