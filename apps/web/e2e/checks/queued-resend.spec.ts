/** FD-088: lose an accepted command's reply AFTER hold dispatch, then resend to the real Hab Core. */
import { expect, test } from "@playwright/test";
import type { ClientMessage, CommandResult, Snapshot } from "@marswalk/protocol";
import { waitForSnapshot } from "../lib/hab";
import { resetThroughPresenter } from "../lib/liveMission";

 test("queued-resend: in-flight SUMMON keeps its id, queues, resends once and executes once", async ({ page, context }) => {
  const ops = await context.newPage();
  try {
    await ops.goto('/?site=mock_site#/ops');
    await waitForSnapshot(ops);
    await expect(ops.getByTestId('clock-control')).toBeVisible();
    const start = ops.getByRole('button', { name: 'Start EVA mission', exact: true });
    await expect(start).toBeVisible({ timeout: 5000 });
    await start.click();
    await expect(start).toBeHidden({ timeout: 5000 });
    await ops.close();
    const sent: Extract<ClientMessage, { type: "COMMAND" }>[] = [];
    const delivered: CommandResult[] = [];
    let original: CommandResult | undefined;
    await page.routeWebSocket("**/ws", (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((raw) => {
        const msg = JSON.parse(String(raw)) as ClientMessage;
        if (msg.type === 'COMMAND') sent.push(msg);
        server.send(raw);
      });
      server.onMessage((raw) => {
        const msg = JSON.parse(String(raw)) as { type: string };
        if (msg.type === 'COMMAND_RESULT') {
          const result = msg as CommandResult;
          if (!original) {
            original = result;
            // The Hab Core has accepted the command; only its result is lost, proving dedupe on the resend.
            socket.close({ code: 1012, reason: 'Harness: lose in-flight result' });
            server.close();
            return;
          }
          delivered.push(result);
        }
        socket.send(raw);
      });
    });
    await page.goto('/?site=mock_site#/eva/EV1');
    const initial = await page.request.get('/api/session');
    const snapshot = await initial.json() as Snapshot;
    const member = snapshot.crew.find((c) => c.crew_id === 'EV1')!;
    await expect(page.locator('[data-slot="o2"] .value')).toHaveText(String(Math.round(member.o2_frac * 100)));
    await page.evaluate(() => {
      const button = document.querySelector('#action-summon-rover')!;
      const observer = new MutationObserver(() => {
        if (button.textContent?.includes('Queued')) button.setAttribute('data-observed-queued', 'true');
      });
      observer.observe(button, { childList: true, subtree: true, characterData: true });
    });
    const summon = page.locator('#action-summon-rover');
    await summon.hover(); await page.mouse.down();
    await expect.poll(() => sent.length).toBeGreaterThanOrEqual(1); // Hold has actually dispatched.
    await page.mouse.up();
    await expect(summon).toHaveAttribute('data-observed-queued', 'true');
    await expect.poll(() => delivered.length, { timeout: 15_000 }).toBe(1);
    expect(original?.ok, JSON.stringify(original)).toBe(true);
    expect(delivered[0]).toEqual(original);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.command.kind).toBe('SUMMON_VEHICLE');
    expect(sent[1]!.command_id).toBe(sent[0]!.command_id);
    expect(sent[1]!.command.queued_offline).toBe(true);
    await page.waitForTimeout(2000);
    expect(delivered).toHaveLength(1);
    expect(sent).toHaveLength(2);
    // Two successful results have the same event_seq: the server returned the original execution.
  } finally { if (!ops.isClosed()) await ops.close(); }
});

test("queued-resend: queued SUMMON survives a page reload and resends once on reconnect", async ({ page, context }) => {
  await resetThroughPresenter(context);
  const ops = await context.newPage();
  try {
    await ops.goto("/?site=mock_site#/ops");
    await waitForSnapshot(ops);
    await ops.getByRole("button", { name: "Start EVA mission", exact: true }).click();
    await expect(ops.getByRole("button", { name: "Start EVA mission", exact: true })).toBeHidden({ timeout: 5000 });
    await ops.close();

    let dropTransport = false;
    let activeSocket: import("@playwright/test").WebSocketRoute | undefined;
    const resentAfterReload: Extract<ClientMessage, { type: "COMMAND" }>[] = [];
    const resultsAfterReload: CommandResult[] = [];
    let afterReload = false;

    await page.routeWebSocket("**/ws", (socket) => {
      if (dropTransport) {
        socket.close({ code: 1012, reason: "Harness: offline queue before reload" });
        return;
      }
      activeSocket = socket;
      const server = socket.connectToServer();
      socket.onMessage((raw) => {
        const msg = JSON.parse(String(raw)) as ClientMessage;
        if (afterReload && msg.type === "COMMAND") resentAfterReload.push(msg);
        server.send(raw);
      });
      server.onMessage((raw) => {
        const msg = JSON.parse(String(raw)) as { type?: string };
        if (afterReload && msg.type === "COMMAND_RESULT") resultsAfterReload.push(msg as CommandResult);
        socket.send(raw);
      });
    });

    await page.goto("/?site=mock_site#/eva/EV1");
    await expect(page.locator('[data-slot="o2"] .value')).not.toHaveText("—");

    // Drop transport so SUMMON_VEHICLE is queued locally (not yet sent to Hab Core).
    dropTransport = true;
    activeSocket!.close({ code: 1012, reason: "Harness: drop before SUMMON" });
    await expect(page.locator('[data-slot="transport-lost-notice"]')).toBeVisible({ timeout: 1500 });

    const summon = page.locator("#action-summon-rover");
    await summon.hover();
    await page.mouse.down();
    await page.waitForTimeout(950);
    await page.mouse.up();
    await expect(summon).toContainText("Queued");

    // Reload the page and bring transport back up: the queued command must survive reload and execute once.
    dropTransport = false;
    afterReload = true;
    await page.reload();

    await expect.poll(() => resentAfterReload.length, { timeout: 15_000 }).toBe(1);
    expect(resentAfterReload[0]!.command.kind).toBe("SUMMON_VEHICLE");
    expect(resentAfterReload[0]!.command.queued_offline).toBe(true);
    await expect.poll(() => resultsAfterReload.length, { timeout: 15_000 }).toBe(1);
    expect(resultsAfterReload[0]).toMatchObject({
      command_id: resentAfterReload[0]!.command_id,
      ok: true,
    });

    // Reloading again after confirmation must NOT resend the command.
    await page.reload();
    await expect(page.locator('[data-slot="o2"] .value')).not.toHaveText("—");
    await page.waitForTimeout(1000);
    expect(resentAfterReload).toHaveLength(1);
  } finally {
    if (!ops.isClosed()) await ops.close();
    await resetThroughPresenter(context);
  }
});
