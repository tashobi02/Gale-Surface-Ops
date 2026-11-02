/**
 * Compute worker entry (docs/specs/02 §A.1, §E.2). Pure functions only: no DOM, no fetch.
 * Wiring `self.onmessage` to handleMessage and the cancellation of older plan_revisions
 * is TASK-05. Input validation (02 §E.3) is repeated here → INVALID_INPUT.
 */
import type { WorkerRequest, WorkerResponse } from "./protocol";

/** Handle one request and return its response message. TASK-05. */
export function handleMessage(request: WorkerRequest): WorkerResponse {
  throw new Error("TODO(TASK-05): not implemented");
}
