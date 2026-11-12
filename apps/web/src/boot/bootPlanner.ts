/**
 * Planner boot sequence (docs/specs/03 SCR-00, §D; 01 FR-01, FR-16; T07.03):
 * Web Worker check -> loadSite -> validateSite -> worker client -> plan store.
 *
 * Every failure is a `BootError` whose `problem` names the file or the field (03 §D "Boot asset failure"). Two steps are
 * stubs on main: `validateSite` (T14.03) and `createPlanStore` (T08.03). A stub's "TODO(...)" error is skipped and recorded
 * in `skipped`, never reported as success, and when the plan store is missing `planStore` is null (no AppContext can be
 * made, so a planner screen shows its not-built placeholder). Any other error is a real failure.
 *
 * Live roles (ops, EVA, HUD, report, join) do not boot this: a suit tablet must come up even when site tiles fail to load.
 */
import type { BootProblem, LoadedSite, WorkerClient } from "../ui/context";
import type { PlanStore } from "../state/planStore";
import { DEFAULT_SCENARIO, createPlanStore } from "../state/planStore";
import { createWorkerClient } from "../ui/workerClient";
import { BootError, loadSite } from "./loadSite";
import { validateSite } from "./validateSite";

export interface PlannerBoot {
  site: LoadedSite;
  workerClient: WorkerClient;
  /** Null while `createPlanStore` is still the T08.03 stub. */
  planStore: PlanStore | null;
  /** Steps that were skipped because their module is still a stub, each "<step>: <stub message>". */
  skipped: string[];
}

export interface PlannerBootDeps {
  hasWorker?: () => boolean;
  loadSite?: () => Promise<LoadedSite>;
  validateSite?: (site: LoadedSite["site"]) => BootProblem[];
  createWorkerClient?: () => WorkerClient;
  createPlanStore?: (site: LoadedSite, workerClient: WorkerClient) => PlanStore;
}

/**
 * The plan store the boot builds (T08.03): Empty, with the FR-05 defaults and the manifest's `default_start` as the one
 * start waypoint; COMPUTE_PLAN carries the site's `site_id` and `data_version` (02 §E.2). The start time stays empty (FD-042).
 */
export function createBootPlanStore(site: LoadedSite, workerClient: WorkerClient): PlanStore {
  const start = site.site.default_start;
  return createPlanStore(
    {
      scenario: { ...DEFAULT_SCENARIO },
      waypoints: [{ id: "wp-0", role: "start", x_m: start.x_m, y_m: start.y_m, label: start.label.slice(0, 40) }],
    },
    { workerClient, siteId: site.site.site_id, dataVersion: site.site.data_version },
  );
}

/** True for the "TODO(...)" error a not-yet-built module throws. */
export function isNotBuilt(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("TODO(");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runBoot(deps: PlannerBootDeps): Promise<PlannerBoot> {
  const hasWorker = deps.hasWorker ?? (() => typeof Worker !== "undefined");
  if (!hasWorker()) {
    throw new BootError({ code: "NO_WORKER", message: "This browser has no Web Worker support, so routes cannot be computed" });
  }

  const site = await (deps.loadSite ?? (() => loadSite()))();

  const skipped: string[] = [];
  try {
    const problems = (deps.validateSite ?? validateSite)(site.site);
    if (problems.length > 0) throw new BootError(problems[0]);
  } catch (err) {
    if (!isNotBuilt(err)) throw err;
    skipped.push(`validateSite: ${message(err)}`);
  }

  let workerClient: WorkerClient;
  try {
    workerClient = (deps.createWorkerClient ?? (() => createWorkerClient()))();
  } catch (err) {
    throw new BootError({ code: "WORKER_FAILED", message: `The compute worker could not start: ${message(err)}` });
  }

  let planStore: PlanStore | null = null;
  try {
    planStore = (deps.createPlanStore ?? createBootPlanStore)(site, workerClient);
  } catch (err) {
    if (!isNotBuilt(err)) {
      workerClient.terminate();
      throw new BootError({ code: "PLAN_STORE_FAILED", message: `The plan store could not start: ${message(err)}` });
    }
    skipped.push(`createPlanStore: ${message(err)}`);
  }

  return { site, workerClient, planStore, skipped };
}

export interface PlannerBootHandle {
  /** The boot, run once; concurrent callers share it. A failure is kept until `reset()`. */
  get(): Promise<PlannerBoot>;
  /** Forget the result (retry after a failure). */
  reset(): void;
}

export function createPlannerBoot(deps: PlannerBootDeps = {}): PlannerBootHandle {
  let pending: Promise<PlannerBoot> | null = null;
  return {
    get: () => (pending ??= runBoot(deps)),
    reset: () => {
      pending = null;
    },
  };
}
