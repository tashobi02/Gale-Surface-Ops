import { describe, expect, it } from "vitest";
import type { LogEvent } from "@marswalk/protocol";
import { taskCountsFromLog, latencySummary } from "../../e2e/lib/liveEvidence";
import scenario from "../../../hab-core/tests/fixtures/fake-scenario/scenario.json";

const [first, second] = scenario.stop_tasks;
const event = (kind: string, data: unknown, seq: number): LogEvent => ({
  seq, sim_time: scenario.start_utc, kind, data, actor: "system", provenance: {}, command_ref: null,
}) as LogEvent;
const seeded = () => [event("TASK_ADDED", first, 1), event("TASK_ADDED", second, 2)];

describe("package 29 live evidence", () => {
  it("counts tasks by id from the log, including undo and system drops", () => {
    const counts = taskCountsFromLog([...seeded(),
      event("TASK_UPDATED", { ...first, state: "DONE" }, 3),
      event("TASK_UPDATED", { ...first, state: "TODO", undo: true }, 4),
      event("TASK_UPDATED", { ...first, state: "SKIPPED" }, 5),
      event("TASK_DROPPED", second, 6),
    ]);
    expect(counts).toEqual({ total: 2, done: 0, skipped: 1, dropped: 1, per_stop: {
      [first!.stop_id]: { total: 1, done: 0, skipped: 1, dropped: 0 },
      [second!.stop_id]: { total: 1, done: 0, skipped: 0, dropped: 1 },
    } });
  });
  it("keeps a completed task when a different task drops", () => {
    expect(taskCountsFromLog([...seeded(), event("TASK_UPDATED", { ...first, state: "DONE" }, 3), event("TASK_DROPPED", second, 4)]))
      .toMatchObject({ total: 2, done: 1, skipped: 0, dropped: 1 });
  });
  it("refuses empty evidence instead of passing zero equal counts", () => {
    expect(() => taskCountsFromLog([])).toThrow(/no task/i);
  });
  it("refuses a truncated log that updates a task it never added", () => {
    expect(() => taskCountsFromLog([event("TASK_UPDATED", { ...first, state: "DONE" }, 3)])).toThrow(/unknown task/i);
  });
  it("reports the nearest-rank p95 and maximum without mutating samples", () => {
    const samples = Array.from({ length: 20 }, (_, i) => 500 - i);
    expect(latencySummary(samples)).toEqual({ count: 20, p95_ms: 499, max_ms: 500 });
    expect(samples[0]).toBe(500);
  });
  it("refuses absent, invalid or backwards latency measurements", () => {
    for (const samples of [[], [NaN], [Infinity], [-1]]) expect(() => latencySummary(samples)).toThrow();
  });
});
