/**
 * Web Worker client adapter for compute core communication (02 §E.2, 03 §D, 03 §E.4, NFR-10).
 * Implemented by T07.04 (FR-03, FR-07). Implements the C10 `WorkerClient` interface (context.ts).
 *
 * Every promise handed to a caller settles, and its timer is cleared:
 * - resolved with the worker's SAMPLE_RESULT / PLAN_RESULT;
 * - a PLAN_RESULT older than the latest requested plan_revision rejects `SUPERSEDED` (02 §E.2: only the latest is
 *   delivered); a worker `CANCELLED` rejects `CANCELLED`. Both are "not an error": see `isSupersededError`;
 * - any other worker ERROR rejects only the request it names, with the worker's code. Only an `INTERNAL` error
 *   (or a worker script error, `onerror`) marks the client crashed (03 §D) until `retry()`;
 * - `TIMEOUT` when `defaultTimeoutMs` elapses; `CRASH` for what is pending at a worker script error;
 *   `SUPERSEDED` for what is pending at `retry()`; `TERMINATED` for what is pending at `terminate()`.
 * After `terminate()` every call rejects `TERMINATED` (and `postMessage` / `retry` throw it).
 */
import type {
  ComputePlanRequest,
  PlanResultMessage,
  SamplePointRequest,
  SampleResult,
  WorkerErrorCode,
  WorkerRequest,
  WorkerResponse,
} from "@marswalk/protocol";
import type { WorkerClient } from "./context";

/** The part of a Worker the client uses; a DOM `Worker` satisfies it, so do test doubles. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate?(): void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent<unknown>) => void) | null;
}

export type WorkerClientErrorCode = WorkerErrorCode | "CRASH" | "SUPERSEDED" | "TERMINATED";

export class WorkerClientError extends Error {
  readonly code: WorkerClientErrorCode;
  constructor(code: WorkerClientErrorCode, message: string) {
    super(message);
    this.name = "WorkerClientError";
    this.code = code;
  }
}

/**
 * True for a plan that was replaced by a newer revision (`SUPERSEDED`, or the worker's `CANCELLED`): the caller drops
 * it silently and the map stays usable (02 §E.2, 03 §E.4).
 */
export function isSupersededError(error: unknown): error is WorkerClientError {
  return error instanceof WorkerClientError && (error.code === "SUPERSEDED" || error.code === "CANCELLED");
}

export interface WorkerClientOptions {
  /** Creates the worker; default: the plan worker module (`../worker/planWorker.ts`). */
  workerFactory?: () => WorkerLike;
  /** Per-request timeout in ms; none when omitted. */
  defaultTimeoutMs?: number;
  /**
   * Receives an exception thrown by an `onMessage` listener. Default: rethrown asynchronously, so it reaches the
   * window's error handling without breaking delivery to other listeners or settling of the request.
   */
  onListenerError?: (error: unknown) => void;
}

interface Pending {
  resolve: (message: SampleResult | PlanResultMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Create a WorkerClient managing request tracking, latest-revision resolution, cancellation handling and crash
 * recovery (02 §E.2, 03 §D). Throws when no Worker can be created (no `Worker` global and no factory).
 */
export function createWorkerClient(options: WorkerClientOptions = {}): WorkerClient {
  let worker: WorkerLike | null = null;
  let crashed = false;
  let terminated = false;
  let latestPlanRevision = -1;
  const pending = new Map<string, Pending>();
  const messageListeners = new Set<(message: WorkerResponse) => void>();

  function reportListenerError(error: unknown): void {
    if (options.onListenerError) {
      options.onListenerError(error);
    } else {
      setTimeout(() => {
        throw error;
      }, 0);
    }
  }

  /** Remove a request and clear its timer; returns it, or undefined when it already settled. */
  function take(requestId: string): Pending | undefined {
    const entry = pending.get(requestId);
    if (!entry) return undefined;
    pending.delete(requestId);
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    return entry;
  }

  function rejectAll(makeError: () => Error): void {
    for (const requestId of [...pending.keys()]) {
      take(requestId)?.reject(makeError());
    }
  }

  function handleWorkerResponse(event: MessageEvent<WorkerResponse>): void {
    const message = event.data;
    if (!message || typeof message !== "object") return;
    for (const listener of [...messageListeners]) {
      try {
        listener(message);
      } catch (error) {
        reportListenerError(error);
      }
    }

    if (message.type === "SAMPLE_RESULT") {
      take(message.request_id)?.resolve(message);
    } else if (message.type === "PLAN_RESULT") {
      const entry = take(message.request_id);
      if (!entry) return;
      if (message.plan_revision < latestPlanRevision) {
        entry.reject(
          new WorkerClientError(
            "SUPERSEDED",
            `Plan revision ${message.plan_revision} superseded by revision ${latestPlanRevision}`,
          ),
        );
      } else {
        entry.resolve(message);
      }
    } else if (message.type === "ERROR") {
      take(message.request_id)?.reject(new WorkerClientError(message.code, message.message));
      // A worker that reports an internal failure is not trusted until restarted (03 §D); other codes are per request.
      if (message.code === "INTERNAL") crashed = true;
    }
  }

  function handleWorkerFailure(event: Event): void {
    const reason = "message" in event && typeof event.message === "string" && event.message ? event.message : "Web Worker failed";
    crashed = true;
    rejectAll(() => new WorkerClientError("CRASH", reason));
  }

  function detach(old: WorkerLike): void {
    old.onmessage = null;
    old.onerror = null;
    old.onmessageerror = null;
    old.terminate?.();
  }

  function startWorker(): void {
    const created: WorkerLike = options.workerFactory
      ? options.workerFactory()
      : createDefaultWorker();
    created.onmessage = handleWorkerResponse;
    // A message that cannot be read cannot be matched to a request, so it is treated like a script error.
    created.onerror = (event) => handleWorkerFailure(event);
    created.onmessageerror = (event) => handleWorkerFailure(event);
    crashed = false;
    worker = created;
  }

  function send<T extends SampleResult | PlanResultMessage>(request: WorkerRequest): Promise<T> {
    if (terminated) return Promise.reject(new WorkerClientError("TERMINATED", "Worker client was terminated"));
    if (crashed) {
      return Promise.reject(new WorkerClientError("CRASH", "Worker has crashed; call retry() to restart"));
    }
    if (pending.has(request.request_id)) {
      return Promise.reject(
        new WorkerClientError("INVALID_INPUT", `request_id ${request.request_id} is already pending`),
      );
    }
    return new Promise<T>((resolve, reject) => {
      const timer =
        options.defaultTimeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              take(request.request_id)?.reject(
                new WorkerClientError("TIMEOUT", `${request.type} ${request.request_id} timed out`),
              );
            }, options.defaultTimeoutMs);
      pending.set(request.request_id, { resolve: resolve as Pending["resolve"], reject, timer });
      worker?.postMessage(request);
    });
  }

  startWorker();

  return {
    samplePoint(req: Omit<SamplePointRequest, "type">): Promise<SampleResult> {
      return send<SampleResult>({ ...req, type: "SAMPLE_POINT" });
    },
    computePlan(req: Omit<ComputePlanRequest, "type">): Promise<PlanResultMessage> {
      if (!terminated && !crashed && req.plan_revision > latestPlanRevision) {
        latestPlanRevision = req.plan_revision;
      }
      return send<PlanResultMessage>({ ...req, type: "COMPUTE_PLAN" });
    },
    postMessage(message: WorkerRequest): void {
      if (terminated) throw new WorkerClientError("TERMINATED", "Worker client was terminated");
      if (crashed) throw new WorkerClientError("CRASH", "Worker has crashed; call retry() to restart");
      worker?.postMessage(message);
    },
    onMessage(listener: (message: WorkerResponse) => void): () => void {
      messageListeners.add(listener);
      return () => {
        messageListeners.delete(listener);
      };
    },
    terminate(): void {
      if (terminated) return;
      terminated = true;
      rejectAll(() => new WorkerClientError("TERMINATED", "Worker client was terminated"));
      if (worker) detach(worker);
      worker = null;
    },
    retry(): void {
      if (terminated) throw new WorkerClientError("TERMINATED", "Worker client was terminated");
      if (worker) detach(worker);
      rejectAll(() => new WorkerClientError("SUPERSEDED", "Worker restarted via retry()"));
      latestPlanRevision = -1;
      startWorker();
    },
    isCrashed(): boolean {
      return crashed;
    },
  };
}

/** The plan worker as a module worker (02 §A.1). */
function createDefaultWorker(): WorkerLike {
  if (typeof Worker === "undefined") throw new Error("Web Worker environment not available");
  return new Worker(new URL("../worker/planWorker.ts", import.meta.url), { type: "module" });
}
