/**
 * T07.04 — worker client (02 §E.2, 03 §D, 03 §E.4; FR-03, FR-07, NFR-10).
 * Every promise a caller holds settles: resolved, rejected SUPERSEDED / CANCELLED (stale or cancelled plan),
 * rejected with the worker's code (per-request ERROR), CRASH, TIMEOUT or TERMINATED. Timers are cleared.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComputePlanRequest, MissionScenario, PlanResultMessage, SampleResult, WorkerResponse } from "@marswalk/protocol";
import {
  createWorkerClient,
  isSupersededError,
  WorkerClientError,
  type WorkerLike,
} from "../../src/ui/workerClient";
import type { WorkerClient } from "../../src/ui/context";
import demoPlan from "../../src/ui/demoPlan.json";
import okJson from "../fixtures/plan-results/ok.json";

class MockWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  posted: { type: string; request_id: string }[] = [];
  terminateCalls = 0;

  postMessage(message: unknown): void {
    this.posted.push(message as { type: string; request_id: string });
  }

  terminate(): void {
    this.terminateCalls += 1;
  }

  respond(response: WorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>);
  }

  crash(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function setup(options: { defaultTimeoutMs?: number; onListenerError?: (error: unknown) => void } = {}) {
  const workers: MockWorker[] = [];
  const client: WorkerClient = createWorkerClient({
    ...options,
    workerFactory: () => {
      const worker = new MockWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { client, workers, worker: () => workers[workers.length - 1] };
}

const sampleReq = (request_id: string) => ({ request_id, x_m: 100, y_m: 200, snap_radius_m: 50 });
const scenario: MissionScenario = {
  ...demoPlan.scenario,
  crew_count: 2,
  solar_phase: "max",
  eva_start_utc: "2024-05-20T06:00:00Z", // test input only; the client never reads it
};
const planReq = (request_id: string, plan_revision: number): Omit<ComputePlanRequest, "type"> => ({
  request_id,
  plan_revision,
  site_id: "mock_site",
  data_version: "mock_site-2026.11.05",
  scenario,
  waypoints: [],
});
const planResult = (request_id: string, plan_revision: number): PlanResultMessage => ({
  ...(okJson as PlanResultMessage),
  request_id,
  plan_revision,
});
const sampleResult = (request_id: string): SampleResult => ({
  type: "SAMPLE_RESULT",
  request_id,
  inside_aoi: true,
  passable: true,
  reason: null,
  lat: -4.7,
  lon_e: 137.4,
  elevation_m: -4400,
  slope_p90_deg: 5.2,
  ti_tiu: null,
  flags: [],
  snap: null,
});

/** The code a promise rejects with. */
async function rejectionCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(WorkerClientError);
  return (error as WorkerClientError).code;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("T07.04 worker client: requests and results", () => {
  it("posts SAMPLE_POINT with the caller's request_id and resolves the matching result", async () => {
    const { client, worker } = setup();
    const pending = client.samplePoint(sampleReq("s-1"));
    expect(worker().posted).toEqual([expect.objectContaining({ type: "SAMPLE_POINT", request_id: "s-1" })]);
    worker().respond(sampleResult("s-1"));
    await expect(pending).resolves.toMatchObject({ request_id: "s-1", slope_p90_deg: 5.2 });
  });

  it("resolves the latest plan revision and settles the stale one: the superseded promise rejects SUPERSEDED", async () => {
    const { client, worker } = setup({ defaultTimeoutMs: 60_000 });
    vi.useFakeTimers();
    const first = client.computePlan(planReq("p-1", 1));
    const second = client.computePlan(planReq("p-2", 2));
    const staleSettled = rejectionCode(first);

    worker().respond(planResult("p-1", 1)); // the older revision answers late
    worker().respond(planResult("p-2", 2));

    expect(await staleSettled).toBe("SUPERSEDED");
    await expect(second).resolves.toMatchObject({ plan_revision: 2, request_id: "p-2" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles a CANCELLED plan with code CANCELLED, keeps the client usable and clears the timer", async () => {
    const { client, worker } = setup({ defaultTimeoutMs: 60_000 });
    vi.useFakeTimers();
    const cancelled = client.computePlan(planReq("p-1", 1));
    const settled = rejectionCode(cancelled);
    worker().respond({ type: "ERROR", request_id: "p-1", code: "CANCELLED", message: "newer revision" });

    expect(await settled).toBe("CANCELLED");
    expect(client.isCrashed()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    const next = client.samplePoint(sampleReq("s-1"));
    worker().respond(sampleResult("s-1"));
    await expect(next).resolves.toMatchObject({ request_id: "s-1" });
  });

  it("classifies SUPERSEDED and CANCELLED as non-errors with isSupersededError", async () => {
    expect(isSupersededError(new WorkerClientError("SUPERSEDED", "x"))).toBe(true);
    expect(isSupersededError(new WorkerClientError("CANCELLED", "x"))).toBe(true);
    expect(isSupersededError(new WorkerClientError("INTERNAL", "x"))).toBe(false);
    expect(isSupersededError(new Error("x"))).toBe(false);
    expect(isSupersededError(null)).toBe(false);
  });

  it("rejects a duplicate request_id that is still pending, without losing the first request", async () => {
    const { client, worker } = setup();
    const first = client.samplePoint(sampleReq("dup"));
    expect(await rejectionCode(client.samplePoint(sampleReq("dup")))).toBe("INVALID_INPUT");
    worker().respond(sampleResult("dup"));
    await expect(first).resolves.toMatchObject({ request_id: "dup" });
    expect(worker().posted).toHaveLength(1);
  });

  it("a rejected duplicate request_id does not advance the latest plan revision", async () => {
    const { client, worker } = setup();
    const first = client.computePlan(planReq("p-1", 1));
    expect(await rejectionCode(client.computePlan(planReq("p-1", 5)))).toBe("INVALID_INPUT");
    worker().respond(planResult("p-1", 1));
    await expect(first).resolves.toMatchObject({ plan_revision: 1 }); // not SUPERSEDED by the rejected revision 5
  });

  it("rejects with TIMEOUT, forgets the request and ignores its late result", async () => {
    const { client, worker } = setup({ defaultTimeoutMs: 1_000 });
    vi.useFakeTimers();
    const pending = client.samplePoint(sampleReq("s-1"));
    const settled = rejectionCode(pending);
    vi.advanceTimersByTime(1_000);
    expect(await settled).toBe("TIMEOUT");
    expect(() => worker().respond(sampleResult("s-1"))).not.toThrow();
    expect(client.isCrashed()).toBe(false);
  });

  it("clears the timer when a request resolves", async () => {
    const { client, worker } = setup({ defaultTimeoutMs: 1_000 });
    vi.useFakeTimers();
    const pending = client.samplePoint(sampleReq("s-1"));
    worker().respond(sampleResult("s-1"));
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("T07.04 worker client: errors are per request, crashes are not", () => {
  it.each(["INVALID_INPUT", "GRID_NOT_LOADED", "TIMEOUT"] as const)(
    "a %s error rejects only its own request and does not crash the client",
    async (code) => {
      const { client, worker } = setup();
      const failing = client.computePlan(planReq("p-1", 1));
      const other = client.samplePoint(sampleReq("s-1"));
      const failed = rejectionCode(failing);

      worker().respond({ type: "ERROR", request_id: "p-1", code, message: `worker said ${code}` });

      expect(await failed).toBe(code);
      expect(client.isCrashed()).toBe(false);
      worker().respond(sampleResult("s-1"));
      await expect(other).resolves.toMatchObject({ request_id: "s-1" });
      const again = client.samplePoint(sampleReq("s-2"));
      worker().respond(sampleResult("s-2"));
      await expect(again).resolves.toMatchObject({ request_id: "s-2" });
    },
  );

  it("an INTERNAL error rejects its request and marks the client crashed until retry()", async () => {
    const { client, workers, worker } = setup();
    const failing = client.samplePoint(sampleReq("s-1"));
    const settled = rejectionCode(failing);
    worker().respond({ type: "ERROR", request_id: "s-1", code: "INTERNAL", message: "boom" });

    expect(await settled).toBe("INTERNAL");
    expect(client.isCrashed()).toBe(true);
    expect(await rejectionCode(client.samplePoint(sampleReq("s-2")))).toBe("CRASH");
    expect(await rejectionCode(client.computePlan(planReq("p-1", 1)))).toBe("CRASH");
    expect(() => client.postMessage({ type: "SAMPLE_POINT", ...sampleReq("s-3") })).toThrow(WorkerClientError);

    client.retry();
    expect(workers).toHaveLength(2);
    expect(client.isCrashed()).toBe(false);
    const recovered = client.samplePoint(sampleReq("s-4"));
    worker().respond(sampleResult("s-4"));
    await expect(recovered).resolves.toMatchObject({ request_id: "s-4" });
  });

  it("an INTERNAL error also settles every other pending request with CRASH and clears their timers", async () => {
    const { client, worker } = setup({ defaultTimeoutMs: 60_000 });
    vi.useFakeTimers();
    const failing = rejectionCode(client.samplePoint(sampleReq("s-1")));
    const otherSample = rejectionCode(client.samplePoint(sampleReq("s-2")));
    const otherPlan = rejectionCode(client.computePlan(planReq("p-1", 1)));
    worker().respond({ type: "ERROR", request_id: "s-1", code: "INTERNAL", message: "boom" });

    expect(await failing).toBe("INTERNAL");
    expect(await otherSample).toBe("CRASH");
    expect(await otherPlan).toBe("CRASH");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an INTERNAL error that names no pending request (request_id unknown) still marks the client crashed", () => {
    const { client, worker } = setup();
    worker().respond({ type: "ERROR", request_id: "unknown", code: "INTERNAL", message: "boom" });
    expect(client.isCrashed()).toBe(true);
  });

  it("a worker script error (onerror) rejects every pending request with CRASH and marks the client crashed", async () => {
    const { client, worker } = setup({ defaultTimeoutMs: 60_000 });
    vi.useFakeTimers();
    const sample = rejectionCode(client.samplePoint(sampleReq("s-1")));
    const plan = rejectionCode(client.computePlan(planReq("p-1", 1)));
    worker().crash("script error");
    expect(await sample).toBe("CRASH");
    expect(await plan).toBe("CRASH");
    expect(client.isCrashed()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a message that cannot be read (onmessageerror) is treated like a crash: no request can be matched", async () => {
    const { client, worker } = setup();
    const pending = rejectionCode(client.samplePoint(sampleReq("s-1")));
    worker().onmessageerror?.({} as MessageEvent<unknown>);
    expect(await pending).toBe("CRASH");
    expect(client.isCrashed()).toBe(true);
  });

  it("retry() rejects what was pending with SUPERSEDED, replaces the worker and ignores the old worker's late messages", async () => {
    const { client, workers } = setup({ defaultTimeoutMs: 60_000 });
    vi.useFakeTimers();
    const old = workers[0];
    const pending = rejectionCode(client.samplePoint(sampleReq("s-1")));
    client.retry();
    expect(await pending).toBe("SUPERSEDED");
    expect(old.terminateCalls).toBe(1);
    expect(old.onmessage).toBeNull();
    expect(workers).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);

    const fresh = client.samplePoint(sampleReq("s-1"));
    old.onmessage?.({ data: sampleResult("s-1") } as MessageEvent<WorkerResponse>); // late, from the terminated worker
    workers[1].respond({ ...sampleResult("s-1"), slope_p90_deg: 7 });
    await expect(fresh).resolves.toMatchObject({ slope_p90_deg: 7 });
  });
});

describe("T07.04 worker client: terminate()", () => {
  it("rejects what is pending with TERMINATED, then rejects every later call", async () => {
    const { client, worker } = setup({ defaultTimeoutMs: 60_000 });
    vi.useFakeTimers();
    const w = worker();
    const pending = rejectionCode(client.computePlan(planReq("p-1", 1)));
    client.terminate();

    expect(await pending).toBe("TERMINATED");
    expect(w.terminateCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(await rejectionCode(client.samplePoint(sampleReq("s-1")))).toBe("TERMINATED");
    expect(await rejectionCode(client.computePlan(planReq("p-2", 2)))).toBe("TERMINATED");
    expect(() => client.postMessage({ type: "SAMPLE_POINT", ...sampleReq("s-2") })).toThrow(WorkerClientError);
    expect(() => client.retry()).toThrow(WorkerClientError);
    expect(w.posted).toHaveLength(1);

    client.terminate();
    expect(w.terminateCalls).toBe(1);
  });
});

describe("T07.04 worker client: listeners", () => {
  it("passes every response to onMessage listeners until unsubscribed", () => {
    const { client, worker } = setup();
    const seen: string[] = [];
    const unsubscribe = client.onMessage((m) => seen.push(m.type));
    worker().respond(sampleResult("s-x"));
    unsubscribe();
    worker().respond(sampleResult("s-y"));
    expect(seen).toEqual(["SAMPLE_RESULT"]);
  });

  it("a throwing listener does not stop delivery or the pending promise, and never uses console.error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reported: unknown[] = [];
    const { client, worker } = setup({ onListenerError: (error) => reported.push(error) });
    const later: string[] = [];
    client.onMessage(() => {
      throw new Error("listener failed");
    });
    client.onMessage((m) => later.push(m.type));
    const pending = client.samplePoint(sampleReq("s-1"));
    worker().respond(sampleResult("s-1"));

    await expect(pending).resolves.toMatchObject({ request_id: "s-1" });
    expect(later).toEqual(["SAMPLE_RESULT"]);
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).message).toBe("listener failed");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("without onListenerError a listener failure is rethrown asynchronously, not logged", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    const { client, worker } = setup();
    client.onMessage(() => {
      throw new Error("listener failed");
    });
    worker().respond(sampleResult("s-1"));
    expect(() => vi.runAllTimers()).toThrow("listener failed");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
