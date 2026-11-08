/**
 * Compute worker entry (docs/specs/02 §A.1, §E.2). Thin wrapper: all science comes from @marswalk/compute; no DOM, no fetch.
 * Wiring `self.onmessage` to handleWorkerMessage and the cancellation of older plan_revisions
 * is TASK-05 (T05.27). Input validation (02 §E.3) is repeated here → INVALID_INPUT.
 */
import type { WorkerRequest, WorkerResponse } from "@marswalk/protocol";
import { handleWorkerMessage } from "@marswalk/compute";

/**
 * Handle one request and return its response message. TASK-05.
 * In T05.27, this holds the loaded grid instance and delegates to handleWorkerMessage.
 */
export function handleMessage(request: WorkerRequest): WorkerResponse {
  return handleWorkerMessage(null, request);
}
