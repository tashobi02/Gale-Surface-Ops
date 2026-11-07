/**
 * Web Worker client adapter for compute core communication (02 §E.2, 03 §D, 03 §E.4, NFR-10).
 * Implemented by T07.04 (FR-03, FR-07).
 */
import type {
  ComputePlanRequest,
  PlanResultMessage,
  SamplePointRequest,
  SampleResult,
  WorkerError,
  WorkerErrorCode,
  WorkerRequest,
  WorkerResponse,
} from "@marswalk/protocol";
import type { WorkerClient } from "./context";

export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate?(): void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent<unknown>) => void) | null;
}

export class WorkerClientError extends Error {
  readonly code: WorkerErrorCode | "CRASH" | "SUPERSEDED";

  constructor(code: WorkerErrorCode | "CRASH" | "SUPERSEDED", message: string) {
    super(message);
    this.name = "WorkerClientError";
    this.code = code;
  }
}

export interface WorkerClientOptions {
  workerFactory?: () => WorkerLike;
  defaultTimeoutMs?: number;
}

export interface ExtendedWorkerClient extends WorkerClient {
  retry(): void;
  isCrashed(): boolean;
}

/**
 * Create a WorkerClient managing request tracking, latest-revision resolution,
 * cancellation handling and crash recovery (02 §E.2, 03 §D).
 */
export function createWorkerClient(
  options: WorkerClientOptions = {}
): ExtendedWorkerClient {
  let worker: WorkerLike | null = null;
  let crashed = false;
  let reqIdCounter = 0;
  let latestPlanRevision = -1;

  const pendingSampleRequests = new Map<
    string,
    {
      resolve: (res: SampleResult) => void;
      reject: (err: Error) => void;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();

  const pendingComputeRequests = new Map<
    string,
    {
      plan_revision: number;
      resolve: (res: PlanResultMessage) => void;
      reject: (err: Error) => void;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();

  const messageListeners = new Set<(message: WorkerResponse) => void>();

  function handleWorkerResponse(event: MessageEvent<WorkerResponse>): void {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;

    for (const listener of messageListeners) {
      try {
        listener(msg);
      } catch (err) {
        console.error("WorkerClient listener error:", err);
      }
    }

    if (msg.type === "SAMPLE_RESULT") {
      const pending = pendingSampleRequests.get(msg.request_id);
      if (pending) {
        if (pending.timer) clearTimeout(pending.timer);
        pendingSampleRequests.delete(msg.request_id);
        pending.resolve(msg);
      }
    } else if (msg.type === "PLAN_RESULT") {
      // Deliver only if at or above latest plan_revision (02 §E.2)
      if (msg.plan_revision < latestPlanRevision) {
        // Stale result: drop silently
        pendingComputeRequests.delete(msg.request_id);
        return;
      }

      const pending = pendingComputeRequests.get(msg.request_id);
      if (pending) {
        if (pending.timer) clearTimeout(pending.timer);
        pendingComputeRequests.delete(msg.request_id);
        pending.resolve(msg);
      }
    } else if (msg.type === "ERROR") {
      if (msg.code === "CANCELLED") {
        // Treat as superseded, not as an error; map stays usable (02 §E.2, 03 §E.4)
        const pending = pendingComputeRequests.get(msg.request_id);
        if (pending) {
          if (pending.timer) clearTimeout(pending.timer);
          pendingComputeRequests.delete(msg.request_id);
        }
      } else {
        // TIMEOUT or INTERNAL or unexpected: fail pending and enter crashed state (03 §D)
        failAllPending(new WorkerClientError(msg.code, msg.message));
        crashed = true;
      }
    }
  }

  function handleWorkerError(event: ErrorEvent | MessageEvent<unknown>): void {
    const message =
      "message" in event && typeof event.message === "string"
        ? event.message
        : "Web Worker crashed";
    crashed = true;
    failAllPending(new WorkerClientError("CRASH", message));
  }

  function failAllPending(error: Error): void {
    for (const [, pending] of pendingSampleRequests) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
    }
    pendingSampleRequests.clear();

    for (const [, pending] of pendingComputeRequests) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
    }
    pendingComputeRequests.clear();
  }

  function startWorker(): void {
    if (options.workerFactory) {
      worker = options.workerFactory();
    } else if (typeof Worker !== "undefined") {
      worker = new Worker(
        new URL("../worker/planWorker.ts", import.meta.url),
        { type: "module" }
      ) as unknown as WorkerLike;
    } else {
      throw new Error("Web Worker environment not available");
    }

    crashed = false;
    worker.onmessage = handleWorkerResponse;
    if ("onerror" in worker) {
      worker.onerror = handleWorkerError as (e: ErrorEvent) => void;
    }
    if ("onmessageerror" in worker) {
      worker.onmessageerror = handleWorkerError as (e: MessageEvent<unknown>) => void;
    }
  }

  startWorker();

  return {
    samplePoint(req: Omit<SamplePointRequest, "type">): Promise<SampleResult> {
      if (crashed) {
        return Promise.reject(
          new WorkerClientError("CRASH", "Worker has crashed; call retry() to restart")
        );
      }

      const request_id = req.request_id ?? `sample-${++reqIdCounter}-${Date.now()}`;
      const fullReq: SamplePointRequest = {
        ...req,
        type: "SAMPLE_POINT",
        request_id,
      };

      return new Promise<SampleResult>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        if (options.defaultTimeoutMs) {
          timer = setTimeout(() => {
            pendingSampleRequests.delete(request_id);
            reject(new WorkerClientError("TIMEOUT", "SAMPLE_POINT timed out"));
          }, options.defaultTimeoutMs);
        }

        pendingSampleRequests.set(request_id, { resolve, reject, timer });
        worker?.postMessage(fullReq);
      });
    },

    computePlan(req: Omit<ComputePlanRequest, "type">): Promise<PlanResultMessage> {
      if (crashed) {
        return Promise.reject(
          new WorkerClientError("CRASH", "Worker has crashed; call retry() to restart")
        );
      }

      const request_id = req.request_id ?? `plan-${++reqIdCounter}-${Date.now()}`;
      if (req.plan_revision > latestPlanRevision) {
        latestPlanRevision = req.plan_revision;
      }

      const fullReq: ComputePlanRequest = {
        ...req,
        type: "COMPUTE_PLAN",
        request_id,
      };

      return new Promise<PlanResultMessage>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        if (options.defaultTimeoutMs) {
          timer = setTimeout(() => {
            pendingComputeRequests.delete(request_id);
            reject(new WorkerClientError("TIMEOUT", "COMPUTE_PLAN timed out"));
          }, options.defaultTimeoutMs);
        }

        pendingComputeRequests.set(request_id, {
          plan_revision: req.plan_revision,
          resolve,
          reject,
          timer,
        });
        worker?.postMessage(fullReq);
      });
    },

    postMessage(message: WorkerRequest): void {
      if (crashed) {
        throw new WorkerClientError("CRASH", "Worker has crashed; call retry() to restart");
      }
      worker?.postMessage(message);
    },

    onMessage(listener: (message: WorkerResponse) => void): () => void {
      messageListeners.add(listener);
      return () => {
        messageListeners.delete(listener);
      };
    },

    terminate(): void {
      failAllPending(new WorkerClientError("CRASH", "Worker client terminated"));
      worker?.terminate?.();
      worker = null;
    },

    retry(): void {
      if (worker?.terminate) {
        try {
          worker.terminate();
        } catch {
          // ignore
        }
      }
      failAllPending(new WorkerClientError("SUPERSEDED", "Worker restarted via retry()"));
      startWorker();
    },

    isCrashed(): boolean {
      return crashed;
    },
  };
}
