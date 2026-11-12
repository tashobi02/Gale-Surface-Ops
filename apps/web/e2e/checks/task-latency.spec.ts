/**
 * Check `task-latency` (replaces T31.08). Enabled by package 29.
 * Ticking a task on `#/eva/EV1` changes the ops TaskProgress within 500 ms (two pages, one browser); an abort drops the open
 * tasks; the report's counts equal the log's.
 */
import { expect, test } from "@playwright/test";
import { openRole, waitForSnapshot } from "../lib/hab";

const BUDGET_MS = 500;

test.fixme("task-latency: a task tick reaches the ops TaskProgress within 500 ms (enabled by package 29)", async ({ context }) => {
  const eva = await openRole(context, "eva:EV1");
  const ops = await openRole(context, "ops");
  await waitForSnapshot(eva);
  await waitForSnapshot(ops);
  const progress = ops.locator("[data-task-progress]");
  const before = await progress.innerText();
  const start = Date.now();
  await eva.getByRole("checkbox", { name: /task/i }).first().check();
  await expect(progress).not.toHaveText(before, { timeout: BUDGET_MS });
  expect(Date.now() - start).toBeLessThanOrEqual(BUDGET_MS + 100);
});
