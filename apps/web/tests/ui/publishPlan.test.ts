/**
 * T11.07: `PUBLISH_PLAN` from the planner to the Hab Core (02 §E.6, 05 §C PlanExport, FR-14, FR-31).
 *
 * The command carries the plan and the stop tasks beside it (BD-91): the tasks are seeds, one
 * `TASK_ADDED` each at publish, and they never change `plan_hash`.
 *
 * The two named checks of the package: `rejected shows reason`, `tasks beside plan`.
 */
import { describe, expect, it, vi } from "vitest";
import type { CommandResult, PlanExport, StopTaskSeed } from "@marswalk/protocol";
import { publishPlan, type PublishOutcome } from "../../src/ui/briefing/publishPlan";

/** A stand-in for the Hab client: records the commands it was asked to send and answers as told. */
function fakeClient(result: CommandResult) {
  const sent: { kind: string; args: unknown }[] = [];
  const close = vi.fn();
  const client = {
    role: "planner" as const,
    close,
    state: () => null,
    events: () => [],
    lastSeq: () => 0,
    linkLost: () => ({ lost: false, since_ms: null }),
    takenOver: () => false,
    subscribe: () => () => {},
    send: async (command: { kind: string; args: unknown }) => {
      sent.push(command);
      return result;
    },
  };
  return { sent, close, client };
}

function exportedPlan(): PlanExport {
  return {
    export_schema_version: "1.0.0",
    app_version: "0.2.0",
    site_id: "mock_site",
    data_version: "mock_site-2026.11.05",
    plan_hash: "3f9a1c07be42",
    scenario: {
      eva_start_utc: "2026-11-14T08:00:00Z",
      max_eva_duration_h: 6,
      dwell_min_per_stop: 20,
      hard_slope_limit_deg: 15,
      caution_slope_deg: 10,
      walkback_limit_km: 5,
      suited_flat_speed_kmh: 3.3,
      solar_phase: "max",
      loop: true,
      max_haven_min: 30,
      crew_count: 2,
      vehicle_available: true,
      vehicle_param_set: "pr1-assumed",
    },
    waypoints: [
      { id: "wp-0", role: "start", x_m: -1800, y_m: -1500 },
      { id: "wp-1", role: "stop", x_m: 410, y_m: 325, poi_id: "poi-boxwork-ridge" },
    ],
    result: {
      status: "OK",
      legs: [],
      totals: null,
      stops_timeline: [],
      warnings: [],
      computed_utc: "2026-11-14T08:00:00Z",
      timing_ms: {},
    },
    provenance_summary: [],
    disclaimer: "Exploratory planning prototype — not validated for operations.",
  };
}

const TASKS: StopTaskSeed[] = [
  { task_id: "t-p-01", stop_id: "wp-1", crew_id: null, kind: "image", text: "Panorama of the boxwork ridge" },
];

describe("publish plan (T11.07)", () => {
  it("times out and closes an unanswered publish", async () => {
    vi.useFakeTimers();
    try {
      const close = vi.fn();
      const client = { send: () => new Promise<CommandResult>(() => {}), close };
      let outcome: PublishOutcome | undefined;
      void publishPlan({ plan: exportedPlan(), openClient: () => client }).then((value) => { outcome = value; });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(outcome).toMatchObject({ status: "rejected", reason: expect.stringMatching(/timed out/i) });
      expect(close).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it("tasks beside plan", async () => {
    const fake = fakeClient({ v: 1, type: "COMMAND_RESULT", command_id: "k-1", ok: true, event_seq: 42 });
    const plan = exportedPlan();
    const outcome = await publishPlan({
      plan,
      stopTasks: TASKS,
      openClient: () => fake.client,
    });
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].kind).toBe("PUBLISH_PLAN");
    const args = fake.sent[0].args as { plan: PlanExport; stop_tasks?: StopTaskSeed[] };
    expect(args.plan).toBe(plan);
    // The tasks travel beside the plan, not inside it, so `plan_hash` is unchanged by them (BD-91).
    expect(args.stop_tasks).toEqual(TASKS);
    expect(outcome.status).toBe("accepted");
  });

  it("tasks beside plan: no tasks means no stop_tasks key", async () => {
    const fake = fakeClient({ v: 1, type: "COMMAND_RESULT", command_id: "k-1", ok: true, event_seq: 1 });
    await publishPlan({ plan: exportedPlan(), stopTasks: [], openClient: () => fake.client });
    const args = fake.sent[0].args as { stop_tasks?: StopTaskSeed[] };
    expect(args.stop_tasks).toBeUndefined();
  });

  it("rejected shows reason", async () => {
    const fake = fakeClient({
      v: 1,
      type: "COMMAND_RESULT",
      command_id: "k-1",
      ok: false,
      code: "INVALID",
      message: "stop_id wp-9 is not a stop of the published plan",
    });
    const outcome = await publishPlan({ plan: exportedPlan(), stopTasks: TASKS, openClient: () => fake.client });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    expect(outcome.reason).toBe("stop_id wp-9 is not a stop of the published plan");
    expect(outcome.code).toBe("INVALID");
  });

  it("rejected shows reason: a rejected command keeps the plan's own reason text", async () => {
    const fake = fakeClient({
      v: 1,
      type: "COMMAND_RESULT",
      command_id: "k-1",
      ok: false,
      code: "BUSY",
      message: "The session is busy.",
    });
    const outcome = await publishPlan({ plan: exportedPlan(), openClient: () => fake.client });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    expect(outcome.reason).toBe("The session is busy.");
  });

  it("the client is closed after the publish, whatever the answer", async () => {
    const accepted = fakeClient({ v: 1, type: "COMMAND_RESULT", command_id: "k-1", ok: true, event_seq: 1 });
    await publishPlan({ plan: exportedPlan(), openClient: () => accepted.client });
    expect(accepted.close).toHaveBeenCalled();

    const refused = fakeClient({ v: 1, type: "COMMAND_RESULT", command_id: "k-2", ok: false, code: "INVALID", message: "no" });
    await publishPlan({ plan: exportedPlan(), openClient: () => refused.client });
    expect(refused.close).toHaveBeenCalled();
  });

  it("a client that cannot be opened is a rejection with a reason, not a throw", async () => {
    const outcome = await publishPlan({
      plan: exportedPlan(),
      openClient: () => {
        throw new Error("no Hab Core on this origin");
      },
    });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    expect(outcome.reason).toContain("no Hab Core on this origin");
  });

  it("the outcome states the plan hash the Hab Core now holds", async () => {
    const fake = fakeClient({ v: 1, type: "COMMAND_RESULT", command_id: "k-1", ok: true, event_seq: 1 });
    const outcome = await publishPlan({ plan: exportedPlan(), openClient: () => fake.client });
    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") throw new Error("unreachable");
    expect(outcome.planHash).toBe("3f9a1c07be42");
  });

  it("the outcome type names the three states a screen shows", () => {
    const states: PublishOutcome["status"][] = ["pending", "accepted", "rejected"];
    expect(states).toEqual(["pending", "accepted", "rejected"]);
  });
});
