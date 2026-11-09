/**
 * Pure request handler for the compute worker (docs/specs/02 §E.2).
 * FR-03, FR-06, FR-07, NFR-06. Implemented by TASK-05 (T05.26).
 * Dispatches SAMPLE_POINT and COMPUTE_PLAN requests against a LoadedGrid.
 */
import type { WorkerRequest, WorkerResponse } from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";

/**
 * Handle a worker request message against the currently loaded grid.
 * Returns the appropriate WorkerResponse message (SampleResult, PlanResultMessage, or WorkerError).
 */
export function handleWorkerMessage(
  grid: LoadedGrid | null,
  request: WorkerRequest,
): WorkerResponse {
  throw new Error("TODO(TASK-05): not implemented");
}
