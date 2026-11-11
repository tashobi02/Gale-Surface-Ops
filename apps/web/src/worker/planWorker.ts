/**
 * Compute worker entry (docs/specs/02 §A.1, §E.2). Thin wrapper: all science comes from @marswalk/compute; no DOM, no fetch.
 * The pure handler is deterministic and reads no clock. This adapter adds the run metadata of a
 * PLAN_RESULT: `computed_utc` (the genuine time of the run) and `timing_ms.total` (measured
 * handler duration; no minimum, and no routing/estimates split, which is not measured).
 * Stale-request rejection of older plan_revisions is implemented; effective in-flight
 * cancellation and grid delivery are not (TASK-05 T05.18, T05.27: TODO(decision)).
 * Input validation (02 §E.3) happens in the pure handler → INVALID_INPUT.
 */
import type { PlanResultMessage, WorkerRequest, WorkerResponse } from "@marswalk/protocol";
import { handleWorkerMessage, type LoadedGrid } from "@marswalk/compute";

let currentGrid: LoadedGrid | null = null;
let latestRevision = -1;

/**
 * For testing and direct worker initialisation.
 */
export function setWorkerGrid(grid: LoadedGrid | null): void {
  currentGrid = grid;
}

/**
 * Handle one request and return its response message (02 §E.2).
 * Tracks the latest plan_revision and rejects a request older than it with CANCELLED. This is
 * stale-request rejection only: a search already running is not interrupted.
 */
export function handleMessage(request: WorkerRequest): WorkerResponse {
  if (request.type === "COMPUTE_PLAN") {
    if (request.plan_revision < latestRevision) {
      return {
        type: "ERROR",
        request_id: request.request_id,
        code: "CANCELLED",
        message: `Plan revision ${request.plan_revision} cancelled by newer revision ${latestRevision}`,
      };
    }
    latestRevision = request.plan_revision;
  }

  const startMs = performance.now();
  const response = handleWorkerMessage(currentGrid, request);
  const elapsedMs = performance.now() - startMs;

  if (response.type === "PLAN_RESULT") {
    const planResultMsg = {
      ...response,
      computed_utc: new Date().toISOString(),
      timing_ms: { total: elapsedMs },
    } satisfies PlanResultMessage;
    return planResultMsg;
  }
  return response satisfies WorkerResponse;
}

// Wire worker onmessage only when running in a genuine Worker global scope (02 §A.1, #61)
const g = globalThis as unknown as {
  WorkerGlobalScope?: new () => unknown;
  self?: unknown;
  postMessage?: (message: unknown) => void;
  onmessage?: ((event: { data: WorkerRequest }) => void) | null;
};

const isWorkerScope =
  typeof g.WorkerGlobalScope === "function" &&
  typeof g.self !== "undefined" &&
  g.self instanceof g.WorkerGlobalScope;

if (isWorkerScope && typeof g.postMessage === "function") {
  g.onmessage = (event: { data: WorkerRequest }) => {
    try {
      const response = handleMessage(event.data);
      g.postMessage!(response);
    } catch (err) {
      g.postMessage!({
        type: "ERROR",
        request_id: event.data?.request_id ?? "unknown",
        code: "INTERNAL",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
