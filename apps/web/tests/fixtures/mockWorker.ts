/**
 * Mock Web Worker for frontend development and offline test builds (docs/specs/02 §E.2; map §e F3).
 * Answers SAMPLE_POINT and COMPUTE_PLAN from canned fixtures without running the real A* search.
 * FR-03, FR-06, FR-07. Implemented by TASK-05 (T05.04). Contract C6 v1.
 *
 * Selection:
 * - Query parameter ?result=ok (default), ?result=partial, or ?result=over-limits.
 * - ?result=transient-error fails the first COMPUTE_PLAN with an `INTERNAL` error and answers the next one with the `ok`
 *   fixture. It is the worker-owned way to fail a live computation on demand (N-211): the app has no failure hook, the
 *   worker owns the failure, and the recovery is observable because the second answer is a real plan.
 * - Unknown result names return an ERROR response with code "INTERNAL".
 */

import type {
  ComputePlanRequest,
  PlanResultMessage,
  SamplePointRequest,
  SampleResult,
  WorkerError,
  WorkerRequest,
  WorkerResponse,
} from "@marswalk/protocol";
import okFixture from "./plan-results/ok.json";
import partialFixture from "./plan-results/partial.json";
import overLimitsFixture from "./plan-results/over-limits.json";

export const CANNED_PLAN_RESULTS: Record<string, PlanResultMessage> = {
  ok: okFixture as PlanResultMessage,
  partial: partialFixture as PlanResultMessage,
  "over-limits": overLimitsFixture as PlanResultMessage,
};

/**
 * Verbatim 02 §E.2 SAMPLE_RESULT example for mock responses.
 */
export const MOCK_SAMPLE_RESULT_BASE: Omit<SampleResult, "request_id"> = {
  type: "SAMPLE_RESULT",
  inside_aoi: true,
  passable: false,
  reason: "SLOPE_OVER_LIMIT",
  lat: -4.74378,
  lon_e: 137.43061,
  elevation_m: -3912.4,
  slope_p90_deg: 21.75,
  ti_tiu: 312.0,
  flags: ["LOW_RES_DEM"],
  snap: {
    x_m: 2982.5,
    y_m: -2612.5,
    distance_m: 19.0,
  },
};

/**
 * The per-worker state the `transient-error` variant needs: how many COMPUTE_PLAN requests it has already answered (N-211).
 * The handle function stays pure; the caller owns the counter.
 */
export interface MockWorkerState {
  /** How many COMPUTE_PLAN requests this worker has been asked to answer. */
  planRequests: number;
}

export function createMockWorkerState(): MockWorkerState {
  return { planRequests: 0 };
}

/**
 * Handle a WorkerRequest against the mock responses.
 *
 * @param request WorkerRequest received from client.
 * @param resultVariant Chosen fixture key: "ok" | "partial" | "over-limits" | "transient-error" (default: "ok").
 * @param state The worker's own state; it counts the plan requests the `transient-error` variant needs. A fresh one when omitted.
 */
export function handleMockWorkerMessage(
  request: WorkerRequest,
  resultVariant = "ok",
  state: MockWorkerState = createMockWorkerState(),
): WorkerResponse {
  if (request.type === "SAMPLE_POINT") {
    const sampleReq = request as SamplePointRequest;
    const response: SampleResult = {
      ...MOCK_SAMPLE_RESULT_BASE,
      request_id: sampleReq.request_id,
    };
    return response;
  }

  if (request.type === "COMPUTE_PLAN") {
    const planReq = request as ComputePlanRequest;
    state.planRequests += 1;

    // N-211: the first plan fails, the next one succeeds. The failure is the worker's own, so the app needs no debug hook,
    // and the recovery is visible: the plan after the retry is a real one. The code is TIMEOUT, the worker's own "the
    // computation did not finish" answer (02 §D.2's expansion cap); an INTERNAL answer would mark the client crashed and the
    // Retry would restart the worker, which would reset this counter and fail again for ever.
    if (resultVariant === "transient-error" && state.planRequests === 1) {
      const errorResponse: WorkerError = {
        type: "ERROR",
        request_id: planReq.request_id,
        code: "TIMEOUT",
        message: "The mock worker's transient failure: the first COMPUTE_PLAN of this worker times out.",
      };
      return errorResponse;
    }

    const fixture = CANNED_PLAN_RESULTS[resultVariant === "transient-error" ? "ok" : resultVariant];

    if (!fixture) {
      const errorResponse: WorkerError = {
        type: "ERROR",
        request_id: planReq.request_id,
        code: "INTERNAL",
        message: `Unknown mock result variant "${resultVariant}". Expected one of: ${Object.keys(
          CANNED_PLAN_RESULTS,
        ).join(", ")}.`,
      };
      return errorResponse;
    }

    const response: PlanResultMessage = {
      ...fixture,
      request_id: planReq.request_id,
      plan_revision: planReq.plan_revision,
    };
    return response;
  }

  if (request.type === "LOAD_GRID") {
    return { type: "GRID_LOADED", request_id: request.request_id, site_id: request.site_id, data_version: request.data_version };
  }
  if (request.type === "VALIDATE_MANUAL_LEG") {
    return { type: "ERROR", request_id: request.request_id, code: "INVALID_INPUT", message: "VALIDATE_MANUAL_LEG is not mocked" };
  }

  const exhaustiveCheck: never = request;
  throw new Error(`Unhandled request type: ${(exhaustiveCheck as { type: string }).type}`);
}

/**
 * Extract ?result=<variant> from the worker's URL query string.
 */
export function getResultVariantFromUrl(url: string | URL): string {
  try {
    const parsed = typeof url === "string" ? new URL(url, "http://localhost") : url;
    return parsed.searchParams.get("result") ?? "ok";
  } catch {
    return "ok";
  }
}

/**
 * The variant the app asks for through the worker's name (`mock:<variant>`, set by the `?mock_worker_result=` switch in
 * ui/workerClient.ts; FD-174), or null for any other name. A bundled worker's own URL cannot carry a query.
 */
export function getResultVariantFromName(name: string | undefined): string | null {
  return typeof name === "string" && name.startsWith("mock:") && name.length > "mock:".length ? name.slice("mock:".length) : null;
}

// In a real Web Worker environment, wire the message listener
if (typeof self !== "undefined" && typeof self.postMessage === "function" && "location" in self) {
  const variant = getResultVariantFromName(self.name) ?? getResultVariantFromUrl(self.location.href);
  // The worker's own state: it counts the plan requests the `transient-error` variant needs (N-211).
  const state = createMockWorkerState();

  self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const response = handleMockWorkerMessage(event.data, variant, state);
    self.postMessage(response);
  };
}
