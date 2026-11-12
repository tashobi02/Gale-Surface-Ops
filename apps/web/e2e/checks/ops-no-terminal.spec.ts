/**
 * Check `ops-no-terminal` (replaces T25.08). Enabled by package 29.
 * The ops UI alone: load the scenario, start the EVA, speed 60x, raise an alert, approve an option, end, then the report. The test
 * never calls the API directly; `sendAsOps` only clicks ops-console controls.
 * TODO(verify): control names are SCR-11's (package 19/20); the end command is N-27.
 */
import { expect, test } from "@playwright/test";
import { openRole, sendAsOps, waitForSnapshot } from "../lib/hab";

test.fixme("ops-no-terminal: a whole mission from the ops console with no terminal (enabled by package 29)", async ({ context }) => {
  const ops = await openRole(context, "ops");
  await waitForSnapshot(ops);
  await sendAsOps(ops, /start eva/i);
  await sendAsOps(ops, /60.?x|60×/i);
  await expect(ops.getByRole("alert").first()).toBeVisible({ timeout: 120_000 });
  await sendAsOps(ops, /approve/i);
  await sendAsOps(ops, /end eva/i);
  await expect(ops).toHaveURL(/#\/report/);
});
