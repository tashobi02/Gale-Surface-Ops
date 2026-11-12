/**
 * `PUBLISH_PLAN` from the planner to the Hab Core (02 §E.6, 05 §C PlanExport, FR-14, FR-31; T11.07).
 *
 * The command carries the plan and the stop tasks beside it (BD-91): one `TASK_ADDED` is logged per
 * seed at publish, and because the seeds travel beside the plan and not inside it, `plan_hash` is
 * unchanged by them (U-48).
 *
 * The connection is opened only for the publish and closed after it: the planner route itself opens no
 * socket (03 §A), so a crew that only plans the walk never joins a session.
 *
 * The outcome is one of three states a screen shows: `pending` (the command is on the wire), `accepted`
 * (the Hab Core logged the plan) and `rejected` (with the Hab Core's own reason, 02 §E.6 rejections).
 */
import type { CommandResult, PlanExport, PublishPlanArgs, StopTaskSeed } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";

// Bound the UI wait when a disconnected Hab Core never answers; this does not drive simulation time.
export const PUBLISH_TIMEOUT_MS = 30_000;

/** What the publish button shows while and after it runs. */
export type PublishOutcome =
  | { status: "pending" }
  | { status: "accepted"; planHash: string }
  | { status: "rejected"; reason: string; code: string | null };

/** The subset of the Hab client this module uses (so a test can supply a double). */
export interface PublishClient {
  send(command: { kind: string; args: unknown }): Promise<CommandResult>;
}

/** Opens the planner connection. The default opens a real one on the page's own host. */
export type OpenPublishClient = () => PublishClient | Promise<PublishClient>;

export interface PublishPlanOptions {
  /** The export to publish (05 §C PlanExport). */
  plan: PlanExport;
  /** The stops' authored tasks, sent beside the plan (BD-91). */
  stopTasks?: readonly StopTaskSeed[];
  /** Opens the connection; the default opens a real `planner` connection on the page's own host. */
  openClient?: OpenPublishClient;
  /** Closes the connection after the publish; the default closes the one it opened. */
  closeClient?: (client: PublishClient) => void;
}

/** The default: open a `planner` connection on the page's own host (no hard-coded host, NFR-01). */
async function defaultOpenClient(): Promise<PublishClient> {
  const { connectHab } = await import("../../net/habClient");
  const { ownClientId } = await import("../../boot/session");
  return connectHab({ role: "planner", clientId: ownClientId(), displayName: "Planner" });
}

/**
 * Publish the plan.
 *
 * The command is `PUBLISH_PLAN {plan, stop_tasks}` (02 §E.6). A `stop_tasks` key is left out when there
 * are no tasks, so the Hab Core sees exactly the command the specs describe.
 */
export async function publishPlan(options: PublishPlanOptions): Promise<PublishOutcome> {
  const open = options.openClient ?? defaultOpenClient;
  const close = options.closeClient ?? ((client: PublishClient) => (client as Partial<HabClient>).close?.());

  let client: PublishClient;
  try {
    client = await open();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: "rejected", reason: `The Hab Core could not be reached: ${reason}`, code: null };
  }

  try {
    const args: PublishPlanArgs = { plan: options.plan };
    const tasks = options.stopTasks ?? [];
    if (tasks.length > 0) args.stop_tasks = [...tasks];

    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      client.send({ kind: "PUBLISH_PLAN", args }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Publishing the plan timed out waiting for the Hab Core.")), PUBLISH_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timer));
    if (result.ok) return { status: "accepted", planHash: options.plan.plan_hash };
    return { status: "rejected", reason: result.message, code: result.code };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: "rejected", reason, code: null };
  } finally {
    close(client);
  }
}
