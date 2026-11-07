import { describe, it, expect, vi } from "vitest";
import {
  createWorkerClient,
  WorkerClientError,
  type WorkerLike,
} from "../../src/ui/workerClient";
import type {
  SampleResult,
  PlanResultMessage,
  WorkerRequest,
  WorkerResponse,
} from "@marswalk/protocol";

class MockWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postedMessages: WorkerRequest[] = [];
  terminated = false;

  postMessage(message: WorkerRequest): void {
    this.postedMessages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  simulateResponse(response: WorkerResponse): void {
    if (this.onmessage) {
      this.onmessage({ data: response } as MessageEvent<WorkerResponse>);
    }
  }

  simulateError(message: string): void {
    if (this.onerror) {
      this.onerror(new ErrorEvent("error", { message }));
    }
  }
}

describe("T07.04 Worker Client (createWorkerClient)", () => {
  it("sends SAMPLE_POINT request with unique request_id and resolves response", async () => {
    let mockWorker!: MockWorker;
    const client = createWorkerClient({
      workerFactory: () => {
        mockWorker = new MockWorker();
        return mockWorker;
      },
    });

    const samplePromise = client.samplePoint({
      request_id: "req-1",
      x_m: 100,
      y_m: 200,
      snap_radius_m: 50,
    });

    expect(mockWorker.postedMessages.length).toBe(1);
    const sent = mockWorker.postedMessages[0];
    expect(sent.type).toBe("SAMPLE_POINT");

    const sampleResult: SampleResult = {
      type: "SAMPLE_RESULT",
      request_id: sent.request_id,
      inside_aoi: true,
      passable: true,
      reason: null,
      lat: -4.7,
      lon_e: 137.4,
      elevation_m: -2000,
      slope_p90_deg: 5.2,
      ti_tiu: 350,
      flags: [],
      snap: null,
    };

    mockWorker.simulateResponse(sampleResult);

    const result = await samplePromise;
    expect(result.inside_aoi).toBe(true);
    expect(result.slope_p90_deg).toBe(5.2);
    expect(result.request_id).toBe(sent.request_id);
  });

  it("drops older COMPUTE_PLAN revisions and delivers only the latest revision", async () => {
    let mockWorker!: MockWorker;
    const client = createWorkerClient({
      workerFactory: () => {
        mockWorker = new MockWorker();
        return mockWorker;
      },
    });

    const req1Promise = client.computePlan({
      request_id: "p1",
      plan_revision: 1,
      site_id: "mock_site",
      data_version: "v1",
      scenario: {} as any,
      waypoints: [],
    });

    const req2Promise = client.computePlan({
      request_id: "p2",
      plan_revision: 2,
      site_id: "mock_site",
      data_version: "v1",
      scenario: {} as any,
      waypoints: [],
    });

    expect(mockWorker.postedMessages.length).toBe(2);
    const msg1 = mockWorker.postedMessages[0];
    const msg2 = mockWorker.postedMessages[1];

    // Simulate worker returning revision 1 late
    mockWorker.simulateResponse({
      type: "PLAN_RESULT",
      request_id: msg1.request_id,
      plan_revision: 1,
      status: "OK",
    } as PlanResultMessage);

    // Simulate worker returning revision 2
    mockWorker.simulateResponse({
      type: "PLAN_RESULT",
      request_id: msg2.request_id,
      plan_revision: 2,
      status: "OK",
    } as PlanResultMessage);

    const res2 = await req2Promise;
    expect(res2.plan_revision).toBe(2);
  });

  it("handles CANCELLED worker response as superseded without crashing", async () => {
    let mockWorker!: MockWorker;
    const client = createWorkerClient({
      workerFactory: () => {
        mockWorker = new MockWorker();
        return mockWorker;
      },
    });

    client.computePlan({
      request_id: "p1",
      plan_revision: 1,
      site_id: "mock_site",
      data_version: "v1",
      scenario: {} as any,
      waypoints: [],
    });

    const sent = mockWorker.postedMessages[0];

    mockWorker.simulateResponse({
      type: "ERROR",
      request_id: sent.request_id,
      code: "CANCELLED",
      message: "Superseded by newer revision",
    });

    expect(client.isCrashed()).toBe(false);
  });

  it("handles worker error, marks crashed, and recovers on retry()", async () => {
    let mockWorker!: MockWorker;
    let factoryCount = 0;
    const client = createWorkerClient({
      workerFactory: () => {
        factoryCount++;
        mockWorker = new MockWorker();
        return mockWorker;
      },
    });

    expect(factoryCount).toBe(1);

    const pendingPromise = client.samplePoint({
      request_id: "req-err",
      x_m: 0,
      y_m: 0,
      snap_radius_m: 50,
    });

    mockWorker.simulateResponse({
      type: "ERROR",
      request_id: mockWorker.postedMessages[0].request_id,
      code: "INTERNAL",
      message: "Fatal internal calculation error",
    });

    await expect(pendingPromise).rejects.toThrow(WorkerClientError);
    expect(client.isCrashed()).toBe(true);

    // Call retry to recover
    client.retry();
    expect(factoryCount).toBe(2);
    expect(client.isCrashed()).toBe(false);
  });
});

