/**
 * Check `ops-no-terminal` (replaces T25.08). Enabled by package 29.
 * The ops UI alone: load the scenario, start the EVA, speed 60x, raise an alert, approve an option, end, then the report. The test
 * never calls the API directly; `sendAsOps` only clicks ops-console controls.
 * Package 20 enables the approval step against the committed WS fixtures (radiation alert + OPTIONS_PROPOSED). The full mission
 * stays with package 29: the harness Hab Core runs `fake-straight-line`, which raises no storm and proposes no options.
 */
import { expect, test } from "@playwright/test";
import { UTILITY_ROVER, openOpsFixture, openOpsPanel } from "../lib/opsFixture";
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

test("ops-no-terminal: rover step from the vehicle card, target picked on the map, one TASK_ROVER (package 21)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 1024, "the ops console needs >= 1024 px");
  const { commands } = await openOpsFixture(page, "running", { vehicles: [UTILITY_ROVER] });
  await openOpsPanel(page, "crew");
  await page.getByRole("button", { name: "Task rover UR1" }).click();
  const dialog = page.locator('[data-screen="SCR-15"]');
  await expect(dialog).toContainText("UR1 /// ROVER TASKING");
  await dialog.locator('[data-task="SCOUT"]').click();
  await dialog.getByRole("button", { name: "Pick on map" }).click();
  await expect(page.locator(".ops-map-slot")).toHaveAttribute("data-picking", "true");
  const canvas = page.locator('[data-slot="ops-map"] [data-slot="map-canvas"]');
  await expect(canvas.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
  await canvas.click();
  await expect(dialog.locator('[data-field="target"]')).toHaveAttribute("data-source", "ui:map-pick");
  await dialog.locator("[data-action='confirm']").click();
  await expect(dialog.locator("[data-state='queued']")).toContainText("QUEUED");
  expect(commands).toHaveLength(1);
  expect(commands[0]?.kind).toBe("TASK_ROVER");
  expect(commands[0]?.args).toMatchObject({ vehicle_id: "UR1", task: "SCOUT" });
  const target = commands[0]?.args.target as { x_m: number; y_m: number };
  expect(Number.isFinite(target.x_m) && Number.isFinite(target.y_m)).toBe(true);
  // The layer list names relay coverage as not computed: no relay grid without a parked RELAY rover (FD-071).
  await expect(page.locator('[data-layer="relay_coverage"]')).toHaveText(/Relay coverage — not computed/);
});

test.fixme("ops-no-terminal: rover step against the harness Hab Core (needs N-09)", async ({ context }) => {
  const ops = await openRole(context, "ops");
  await waitForSnapshot(ops);
  await ops.getByRole("button", { name: /Task rover/ }).first().click();
  await ops.locator('[data-screen="SCR-15"] [data-task="RETURN"]').click();
  await ops.locator("[data-screen='SCR-15'] [data-action='confirm']").click();
  await expect(ops.locator("[data-screen='SCR-15'] [data-state='enroute']")).toBeVisible({ timeout: 60_000 });
});
