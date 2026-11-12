/**
 * T07.03 — planner boot sequence (docs/specs/03 SCR-00, §D; 01 FR-01, FR-16): Worker check -> loadSite -> validateSite ->
 * worker client -> plan store. Any problem is a BootError that names the file or field; the T14.03 stub is skipped (and
 * said so), never silently treated as success. T07.04: `?mock_worker=1` starts the F3 mock worker (FD-174).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoadedSite, WorkerClient } from "../../src/ui/context";
import type { PlanStore } from "../../src/state/planStore";
import { BootError } from "../../src/boot/loadSite";
import { createBootPlanStore, createPlannerBoot, isNotBuilt } from "../../src/boot/bootPlanner";
import { DEFAULT_SCENARIO } from "../../src/state/planStore";

const site = { site: { site_id: "mock_site" } } as unknown as LoadedSite;
const worker = { terminate: vi.fn() } as unknown as WorkerClient;
const store = {} as PlanStore;

function deps(over: Partial<Parameters<typeof createPlannerBoot>[0]> = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      hasWorker: () => (calls.push("hasWorker"), true),
      loadSite: async () => (calls.push("loadSite"), site),
      validateSite: () => (calls.push("validateSite"), []),
      createWorkerClient: () => (calls.push("createWorkerClient"), worker),
      createPlanStore: () => (calls.push("createPlanStore"), store),
      ...over,
    },
  };
}

describe("createPlannerBoot", () => {
  it("runs the steps in the order of T07.03 and returns what it built", async () => {
    const { calls, deps: d } = deps();
    const boot = await createPlannerBoot(d).get();
    expect(calls).toEqual(["hasWorker", "loadSite", "validateSite", "createWorkerClient", "createPlanStore"]);
    expect(boot.site).toBe(site);
    expect(boot.workerClient).toBe(worker);
    expect(boot.planStore).toBe(store);
    expect(boot.skipped).toEqual([]);
  });

  it("is built once: a second get() returns the same boot and starts no second worker", async () => {
    const { calls, deps: d } = deps();
    const planner = createPlannerBoot(d);
    const [a, b] = await Promise.all([planner.get(), planner.get()]);
    expect(a).toBe(b);
    expect(calls.filter((c) => c === "createWorkerClient")).toHaveLength(1);
  });

  it("without Web Worker support: NO_WORKER, before anything is loaded", async () => {
    const { calls, deps: d } = deps({ hasWorker: () => false });
    await expect(createPlannerBoot(d).get()).rejects.toMatchObject({ problem: { code: "NO_WORKER" } });
    expect(calls).not.toContain("loadSite");
  });

  it("a missing manifest is the BootError loadSite raised, naming the file", async () => {
    const { deps: d } = deps({
      loadSite: async () => {
        throw new BootError({ code: "MANIFEST_NOT_FOUND", message: "Site manifest not found", missingFile: "sites/mock_site/site-manifest.json" });
      },
    });
    await expect(createPlannerBoot(d).get()).rejects.toMatchObject({ problem: { missingFile: "sites/mock_site/site-manifest.json" } });
  });

  it("validateSite problems stop the boot with the first problem's code and file", async () => {
    const { calls, deps: d } = deps({
      validateSite: () => [{ code: "ASSET_MISSING", message: "tile grid missing", missingFile: "sites/mock_site/dem.tif" }],
    });
    await expect(createPlannerBoot(d).get()).rejects.toMatchObject({ problem: { code: "ASSET_MISSING", missingFile: "sites/mock_site/dem.tif" } });
    expect(calls).not.toContain("createWorkerClient");
  });

  it("a validateSite that is still the T14.03 stub is skipped and recorded", async () => {
    const { deps: d } = deps({
      validateSite: () => {
        throw new Error("TODO(T14.03): validateSite not implemented");
      },
    });
    const boot = await createPlannerBoot(d).get();
    expect(boot.skipped).toEqual(["validateSite: TODO(T14.03): validateSite not implemented"]);
  });

  it("a plan store that cannot start is PLAN_STORE_FAILED, and the worker it was given is stopped", async () => {
    const { deps: d } = deps({
      createPlanStore: () => {
        throw new Error("boom");
      },
    });
    await expect(createPlannerBoot(d).get()).rejects.toMatchObject({ problem: { code: "PLAN_STORE_FAILED" } });
    expect(worker.terminate).toHaveBeenCalled();
  });

  it("a worker that cannot start is WORKER_FAILED", async () => {
    const { deps: d } = deps({
      createWorkerClient: () => {
        throw new Error("no Worker");
      },
    });
    await expect(createPlannerBoot(d).get()).rejects.toMatchObject({ problem: { code: "WORKER_FAILED" } });
  });

  it("reset() lets a retry run the whole sequence again", async () => {
    let fail = true;
    const { calls, deps: d } = deps({
      loadSite: async () => {
        if (fail) throw new BootError({ code: "MANIFEST_NOT_FOUND", message: "x" });
        return site;
      },
    });
    const planner = createPlannerBoot(d);
    await expect(planner.get()).rejects.toBeInstanceOf(BootError);
    fail = false;
    planner.reset();
    await expect(planner.get()).resolves.toMatchObject({ site });
    expect(calls.filter((c) => c === "hasWorker")).toHaveLength(2);
  });
});

describe("isNotBuilt", () => {
  it("recognises the TODO(...) stub errors only", () => {
    expect(isNotBuilt(new Error("TODO(T08.03): not implemented"))).toBe(true);
    expect(isNotBuilt(new Error("boom"))).toBe(false);
    expect(isNotBuilt("TODO(x)")).toBe(false);
  });
});

describe("createBootPlanStore (T08.03: the plan store the boot builds)", () => {
  const mockSite = {
    site: { site_id: "mock_site", data_version: "mock_site-2026.11.05", default_start: { x_m: 12, y_m: -34, label: "Hab" } },
  } as unknown as LoadedSite;
  const client = { computePlan: vi.fn(() => new Promise<never>(() => {})), retry: vi.fn(), isCrashed: () => false } as unknown as WorkerClient;

  it("starts Empty at the manifest's default start with the FR-05 defaults, and no invented start time", () => {
    const store = createBootPlanStore(mockSite, client);
    expect(store.get().status).toBe("Empty");
    expect(store.get().waypoints).toEqual([{ id: "wp-0", role: "start", x_m: 12, y_m: -34, label: "Hab" }]);
    expect(store.get().scenario).toEqual(DEFAULT_SCENARIO);
  });

  it("sends COMPUTE_PLAN with the site's id and data_version once a stop and a start time exist", () => {
    const store = createBootPlanStore(mockSite, client);
    store.setScenario({ eva_start_utc: "2026-11-14T08:00:00Z" });
    store.addWaypoint({ id: "wp-1", role: "stop", x_m: 50, y_m: 50 });
    expect(client.computePlan).toHaveBeenCalledWith(expect.objectContaining({ site_id: "mock_site", data_version: "mock_site-2026.11.05", plan_revision: 2 }));
  });

  it("the boot hands the real store to the app: planStore is built from the site and the worker client", async () => {
    const boot = await createPlannerBoot({
      hasWorker: () => true,
      loadSite: async () => mockSite,
      validateSite: () => [],
      createWorkerClient: () => client,
    }).get();
    expect(boot.planStore.get().waypoints[0]).toMatchObject({ id: "wp-0", role: "start" });
    expect(boot.skipped).toEqual([]);
  });
});

describe("the default worker client follows ?mock_worker (T07.04, FD-174)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts the F3 mock for ?mock_worker=1 and the plan worker otherwise", async () => {
    const built: { url: string; name: string | undefined }[] = [];
    class RecordingWorker {
      onmessage: unknown = null;
      constructor(url: URL, options?: WorkerOptions) {
        built.push({ url: url.pathname, name: options?.name });
      }
      postMessage(): void {}
      terminate(): void {}
    }
    vi.stubGlobal("Worker", RecordingWorker);
    const bootWith = async (search: string) => {
      vi.stubGlobal("location", { search });
      const withStart = { site: { site_id: "mock_site", data_version: "v", default_start: { x_m: 1, y_m: 2, label: "Hab" } } } as unknown as LoadedSite;
      const boot = await createPlannerBoot({ loadSite: async () => withStart, validateSite: () => [] }).get();
      boot.workerClient.terminate();
    };
    await bootWith("?mock_worker=1&mock_worker_result=over-limits");
    await bootWith("");
    expect(built[0]!.url).toMatch(/tests\/fixtures\/mockWorker\.ts$/);
    expect(built[0]!.name).toBe("mock:over-limits");
    expect(built[1]!.url).toMatch(/src\/worker\/planWorker\.ts$/);
    expect(built[1]!.name).toBeUndefined();
  });
});
