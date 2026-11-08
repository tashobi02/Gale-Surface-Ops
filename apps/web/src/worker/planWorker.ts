/**
 * Compute worker entry (docs/specs/02 §A.1, §E.2). Thin wrapper: all science comes from @marswalk/compute; no DOM, no fetch.
 * Wiring `self.onmessage` to handleWorkerMessage and the cancellation of older plan_revisions
 * is TASK-05 (T05.27). Input validation (02 §E.3) is repeated here → INVALID_INPUT.
 */
import type { WorkerRequest, WorkerResponse } from "@marswalk/protocol";
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
 * Tracks the latest plan_revision; cancels older searches cooperatively.
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

  return handleWorkerMessage(currentGrid, request);
}

// Wire worker onmessage when running in a Worker global scope
const workerScope = globalThis as unknown as {
  onmessage?: ((event: { data: WorkerRequest }) => void) | null;
  postMessage?: (message: unknown) => void;
};

if (typeof workerScope.postMessage === "function") {
  workerScope.onmessage = (event: { data: WorkerRequest }) => {
    try {
      const response = handleMessage(event.data);
      workerScope.postMessage!(response);
    } catch (err) {
      workerScope.postMessage!({
        type: "ERROR",
        request_id: event.data?.request_id ?? "unknown",
        code: "INTERNAL",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
