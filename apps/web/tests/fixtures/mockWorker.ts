/**
 * Mock Web Worker for frontend development and offline test builds (docs/specs/02 §E.2; map §e F3).
 * Answers SAMPLE_POINT and COMPUTE_PLAN from canned fixtures without running the real A* search.
 * FR-03, FR-06, FR-07. Implemented by TASK-05 (T05.04). Contract C6 v1.
 *
 * Selection:
 * - Query parameter ?result=ok (default), ?result=partial, or ?result=over-limits.
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
 * Handle a WorkerRequest against the mock responses.
 *
 * @param request WorkerRequest received from client.
 * @param resultVariant Chosen fixture key: "ok" | "partial" | "over-limits" (default: "ok").
 */
export function handleMockWorkerMessage(
  request: WorkerRequest,
  resultVariant = "ok",
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
    const fixture = CANNED_PLAN_RESULTS[resultVariant];

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

// In a real Web Worker environment, wire the message listener
if (typeof self !== "undefined" && typeof self.postMessage === "function" && "location" in self) {
  const variant = getResultVariantFromUrl(self.location.href);

  self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const response = handleMockWorkerMessage(event.data, variant);
    self.postMessage(response);
  };
}
