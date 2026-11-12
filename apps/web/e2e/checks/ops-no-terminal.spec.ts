/**
 * Check `ops-no-terminal` (replaces T25.08). Enabled by package 29.
 * The ops UI alone: load the scenario, start the EVA, speed 60x, raise an alert, approve an option, end, then the report. The test
 * never calls the API directly; `sendAsOps` only clicks ops-console controls.
 * Package 20 enables the approval step against the committed WS fixtures (radiation alert + OPTIONS_PROPOSED). The full mission
 * stays with package 29: the harness Hab Core runs `fake-straight-line`, which raises no storm and proposes no options.
 */
import { expect, test } from "@playwright/test";
import { openOpsFixture } from "../lib/opsFixture";
import { openRole, sendAsOps, waitForSnapshot } from "../lib/hab";

test.fixme("ops-no-terminal: a whole mission from the ops console with no terminal (enabled by package 29)", async ({ context }) => {
  const ops = await openRole(context, "ops");
  await waitForSnapshot(ops);
  await sendAsOps(ops, /start eva/i);
  await sendAsOps(ops, /60.?x|60×/i);
  await expect(ops.getByRole("alert").first()).toBeVisible({ timeout: 120_000 });
  await ops.getByRole("radio").filter({ hasText: /Abort/ }).first().click();
  await ops.getByRole("button", { name: /Approve option/ }).focus();
  await ops.keyboard.down("Space");
  await ops.waitForTimeout(850);
  await ops.keyboard.up("Space");
  await expect(ops).toHaveURL(/#\/report/);
});


test("ops-no-terminal: approve step holds and sends one option (package 20)", async ({ page }) => {
  const { commands } = await openOpsFixture(page, "alerting");
  const option = page.getByRole("radio").first();
  await expect(option).toBeVisible();
  const approve = page.getByRole("button", { name: /Approve option/ });
  await approve.focus();
  await page.keyboard.down("Space");
  await page.waitForTimeout(200);
  await page.keyboard.up("Space");
  expect(commands).toEqual([]);
  await page.keyboard.down("Space");
  await page.waitForTimeout(850);
  await page.keyboard.up("Space");
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0]?.kind).toBe("APPROVE_OPTION");
  expect(commands[0]?.args.option_id).toBeTruthy();
});
