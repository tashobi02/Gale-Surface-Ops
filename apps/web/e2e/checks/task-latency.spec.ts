/** T31.08: real tablet → Hab Core → ops DOM latency, then abort drops and independent log/report equality. */
import { expect, test, type Page } from "@playwright/test";
import type { PostEvaReport } from "@marswalk/protocol";
import { openOpsPanel } from "../lib/opsFixture";
import { hold, jumpUntil, openFreshOps, resetThroughPresenter, sessionLog, sessionSnapshot, startPaused, startStormThroughPresenter, watchLive } from "../lib/liveMission";
import { latencySummary, taskCountsFromLog } from "../lib/liveEvidence";
import { e2eSite } from "../lib/siteBundle";

const BUDGET_MS = 500; // NFR-12 / T31.08
const SAMPLES = 20; // NFR-12 p95 method (TASK-20)
type TimingWindow = Window & { __taskClick?: number; __taskChange?: number };

/** The event timestamps share the browser epoch, across documents. Automation polling is outside the interval. */
async function armTiming(eva: Page, ops: Page, expected: string): Promise<void> {
  await eva.evaluate(() => {
    (window as TimingWindow).__taskClick = undefined;
    document.addEventListener("click", () => { (window as TimingWindow).__taskClick = performance.timeOrigin + performance.now(); }, { capture: true, once: true });
  });
  await ops.getByTestId("task-progress-EV1").evaluate((element, text) => {
    (window as TimingWindow).__taskChange = undefined;
    const observer = new MutationObserver(() => {
      if (element.textContent?.replace(/\s+/g, " ").includes(text)) {
        (window as TimingWindow).__taskChange = performance.timeOrigin + performance.now();
        observer.disconnect();
      }
    });
    observer.observe(element, { subtree: true, childList: true, characterData: true });
  }, expected);
}

test("task-latency: 20 task changes reach ops within 500 ms; abort drops open tasks; report counts match the log", async ({ context, page, hasTouch }) => {
  test.setTimeout(180_000);
  // Keep the EVA device project's viewport; the companion console always needs a desktop screen.
  const eva = page;
  const { ops, wire } = await openFreshOps(context);
  const evaWire = watchLive(eva);
  try {
    await startPaused(ops, wire);
    await eva.goto(`/?site=${e2eSite()}#/eva/EV1`);
    await expect.poll(() => evaWire.messages.some((m) => m.type === "SNAPSHOT")).toBe(true);
    await jumpUntil(ops, wire, () => wire.events().some((e) => e.kind === "ARRIVED_STOP" && e.data.crew_id === "EV1"), "EV1 arrives at the first stop");
    await expect(ops.getByRole("button", { name: "Resume mission clock", exact: true })).toBeVisible();
    const before = await sessionSnapshot(ops);
    const member = before.crew.find((c) => c.crew_id === "EV1")!;
    expect(member.activity).toBe("AT_STOP");
    const stops = before.plan!.waypoints.filter((w) => w.role === "stop");
    const stopId = stops[member.stop_index! - 1]!.id;
    const task = before.tasks.find((t) => t.stop_id === stopId && t.state === "TODO" && (t.crew_id === null || t.crew_id === "EV1"))!;
    expect(task, "a real task at the stop, not an invented checkbox").toBeTruthy();
    await eva.getByTestId("tasks-button").click();
    const row = eva.locator(`[data-task-id="${task.task_id}"]`);
    await expect(row).toBeVisible();
    await openOpsPanel(ops, "crew");
    const mine = before.tasks.filter((t) => t.crew_id === null || t.crew_id === "EV1");
    const baseDone = mine.filter((t) => t.state === "DONE").length;
    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const done = i % 2 === 0;
      const expected = `TOTAL ${baseDone + (done ? 1 : 0)}/${mine.length}`;
      await armTiming(eva, ops, expected);
      const action = row.getByRole("button", { name: done ? /^Mark task done:/ : /^Undo task change:/ });
      await evaWire.command("UPDATE_STOP_TASK", () => hasTouch ? action.tap() : action.click());
      await expect(ops.getByTestId("task-progress-EV1")).toContainText(expected);
      await expect.poll(() => ops.evaluate(() => (window as TimingWindow).__taskChange)).toBeTruthy();
      const start = await eva.evaluate(() => (window as TimingWindow).__taskClick);
      const end = await ops.evaluate(() => (window as TimingWindow).__taskChange);
      expect(start).toBeDefined(); expect(end).toBeDefined();
      samples.push(end! - start!);
      await expect(row).toHaveAttribute("data-state", done ? "DONE" : "TODO");
    }
    const summary = latencySummary(samples);
    test.info().annotations.push({ type: "task-latency-ms", description: JSON.stringify({ ...summary, samples }) });
    expect(summary.count).toBe(SAMPLES);
    expect(summary.p95_ms).toBeLessThanOrEqual(BUDGET_MS);
    expect(summary.max_ms).toBeLessThanOrEqual(BUDGET_MS);
    expect((await sessionSnapshot(ops)).sim_time).toBe(before.sim_time); // undo window uses wall time; science does not advance

    // ABORT executes a live ABORT_TO_HAB option. A nominal EVA has no such option.
    await startStormThroughPresenter(context);
    await jumpUntil(ops, wire, () => wire.events().some((e) => e.kind === "ALERT_RAISED" && e.data.code === "RADIATION_ALERT"), "a real storm proposes an abort option");
    const preAbort = await sessionSnapshot(ops);
    const options = preAbort.options.filter((o) => o.kind === "ABORT_TO_HAB" && o.crew_ids.includes("EV1") && preAbort.alerts.some((a) => a.alert_id === o.alert_id && a.cleared_seq === null));
    const raisedSeq = (id: string) => preAbort.alerts.find((a) => a.alert_id === id)!.raised_seq;
    options.sort((a, b) => raisedSeq(b.alert_id) - raisedSeq(a.alert_id) || (a.option_id < b.option_id ? -1 : a.option_id > b.option_id ? 1 : 0));
    const abort = options[0]!;
    expect(abort, "ABORT must use an actual active option").toBeTruthy();
    const preAbortStops = preAbort.plan!.waypoints.filter((w) => w.role === "stop");
    const droppedStops = abort.stops_dropped.map((n) => preAbortStops[n - 1]!.id);
    const openTasks = preAbort.tasks.filter((t) => t.state === "TODO" && droppedStops.includes(t.stop_id)).map((t) => t.task_id);
    const retained = preAbort.tasks.filter((t) => !openTasks.includes(t.task_id));
    expect(openTasks.length, "the option must drop real remaining-stop tasks").toBeGreaterThan(0);
    const closeOptions = eva.getByRole("button", { name: "Close options sheet", exact: true });
    if (await closeOptions.count()) await closeOptions.click();
    await evaWire.command("ABORT", () => hold(eva, eva.locator('[data-hold-key="eva-abort"]')));
    // The session broadcasts the same dropped tasks to both connected devices; the current stop is retained.
    await expect.poll(async () => (await sessionSnapshot(ops)).tasks.filter((t) => openTasks.includes(t.task_id)).map((t) => t.state)).toEqual(openTasks.map(() => "DROPPED"));
    const afterAbort = await sessionSnapshot(ops);
    for (const task of retained) expect(afterAbort.tasks.find((t) => t.task_id === task.task_id)?.state).toBe(task.state);
    for (const trace of [wire, evaWire]) {
      await expect.poll(() => [...new Set(trace.events().filter((e) => e.kind === "TASK_DROPPED").map((e) => e.data.task_id))].sort()).toEqual([...openTasks].sort());
    }
    await jumpUntil(ops, wire, () => wire.events().some((e) => e.kind === "EVA_ENDED"), "the aborted EVA ends");
    await expect(ops).toHaveURL(/#\/report/);
    const log = await sessionLog(ops);
    const counts = taskCountsFromLog(log);
    const response = await ops.request.get("/api/report");
    expect(response.ok()).toBe(true);
    const report = await response.json() as PostEvaReport;
    expect(report.tasks).toEqual(counts);
    await expect(ops.locator('[data-source="report:tasks_totals"]')).toContainText(`All stops: ${counts.done} / ${counts.skipped} / ${counts.dropped} of ${counts.total}`);
    await expect(ops.locator('[data-slot="report-status"]')).toHaveCount(0);
  } finally { await eva.goto("about:blank"); await ops.close(); await resetThroughPresenter(context); }
});
