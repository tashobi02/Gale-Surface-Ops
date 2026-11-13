/** Independent tallies for package 29: log evidence and browser timing, never scientific computation. */
import type { LogEvent, StopTask } from "@marswalk/protocol";

type Counts = { total: number; done: number; skipped: number; dropped: number };
export type TaskCounts = Counts & { per_stop: Record<string, Counts> };
const empty = (): Counts => ({ total: 0, done: 0, skipped: 0, dropped: 0 });

export function taskCountsFromLog(events: readonly LogEvent[]): TaskCounts {
  const tasks = new Map<string, { stop_id: string; state: StopTask["state"] }>();
  for (const event of events) {
    if (!["TASK_ADDED", "TASK_UPDATED", "TASK_DROPPED"].includes(event.kind)) continue;
    const data = event.data as { task_id: string; stop_id: string; state?: StopTask["state"] };
    if (event.kind === "TASK_ADDED") tasks.set(data.task_id, { stop_id: data.stop_id, state: "TODO" });
    else {
      const task = tasks.get(data.task_id);
      if (!task) throw new Error(`unknown task in log: ${data.task_id}`);
      task.state = event.kind === "TASK_DROPPED" ? "DROPPED" : data.state!;
    }
  }
  if (tasks.size === 0) throw new Error("no task evidence in log");
  const result: TaskCounts = { ...empty(), per_stop: {} };
  for (const task of tasks.values()) {
    const stop = result.per_stop[task.stop_id] ??= empty();
    for (const counts of [result, stop]) {
      counts.total++;
      if (task.state === "DONE") counts.done++;
      if (task.state === "SKIPPED") counts.skipped++;
      if (task.state === "DROPPED") counts.dropped++;
    }
  }
  return result;
}

export function latencySummary(samples: readonly number[]): { count: number; p95_ms: number; max_ms: number } {
  if (!samples.length || samples.some((n) => !Number.isFinite(n) || n < 0)) throw new Error("missing or invalid latency samples");
  const sorted = [...samples].sort((a, b) => a - b);
  return { count: sorted.length, p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1]!, max_ms: sorted[sorted.length - 1]! };
}
