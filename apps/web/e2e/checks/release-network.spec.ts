/**
 * Check `release-network` (backend package 28, T28.05 browser half, T31.08 browser half; NFR-10, NFR-12, NFR-13, BD-02, BD-152).
 * Backend-owned. A dropped socket on an EVA page and its reconnect (the link down and up again, through Playwright's WebSocket
 * route, because `context.setOffline` does not close an open socket), the Hab Core killed and started again (SCR-18, then the
 * session resumes), and the killer demo through the UI in single-laptop mode (`npm run hab:local`).
 */
import { expect, test, type BrowserContext, type Page, type WebSocketRoute } from "@playwright/test";
import type { Snapshot } from "@marswalk/protocol";
import { spawn } from "node:child_process";
import { REPO_ROOT } from "../lib/release";
import { HAB_PORT, habHealth, killHab, restartHab, waitForSnapshot } from "../lib/hab";
import { REAL_SCENARIO, REAL_SITE } from "../lib/siteBundle";
import { openOpsPanel } from "../lib/opsFixture";
import { hold, openFreshOps, resetThroughPresenter, sessionLog, sessionSnapshot, startPaused, watchLive, withMockHab, type LiveWire } from "../lib/liveMission";
import { e2eSite } from "../lib/siteBundle";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// NFR-13 "Client reconnect restores correct state <= 2 s"; SCR-18 appears after 3 s without a heartbeat (03 SCR-18, FR-32).
const RECONNECT_MS = 2_000;
const LINK_LOST_MS = 3_000;

test("release-network: a dropped socket on an EVA page is back with a SNAPSHOT within the NFR-13 time of the link returning", async ({ page }) => {
  let linkUp = true;
  const open: WebSocketRoute[] = [];
  const snapshotsAt: number[] = [];
  await page.routeWebSocket(/\/ws(\?.*)?$/, (ws) => {
    if (!linkUp) {
      void ws.close();
      return;
    }
    open.push(ws);
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (/"type"\s*:\s*"SNAPSHOT"/.test(String(message))) snapshotsAt.push(Date.now());
      ws.send(message);
    });
    ws.onMessage((message) => server.send(message));
  });
  await page.goto("/#/eva/EV1");
  await expect.poll(() => snapshotsAt.length, { message: "the first SNAPSHOT came through the route" }).toBeGreaterThan(0);
  await waitForSnapshot(page);
  const before = snapshotsAt.length;

  linkUp = false;
  for (const ws of open.splice(0)) await ws.close();
  await page.waitForTimeout(LINK_LOST_MS + 500); // the link stays down past the watchdog

  const returned = Date.now();
  linkUp = true;
  await expect.poll(() => snapshotsAt.length, { timeout: RECONNECT_MS + 3_000 }).toBeGreaterThan(before);
  const restoredMs = snapshotsAt[snapshotsAt.length - 1]! - returned;
  test.info().annotations.push({ type: "reconnect-ms", description: String(restoredMs) });
  expect(restoredMs, "SNAPSHOT after the link returned").toBeLessThanOrEqual(RECONNECT_MS);
  await waitForSnapshot(page);
});

// Observed on 13 Nov 2026 (desktop-1440, mock_site): with the socket closed for 3.5 s, and with the Hab Core process gone for 15 s, no
// element with data-screen="SCR-18" appeared on the EVA tablet or the ops console (the tablet kept showing its last values as NOMINAL).
// The overlay is frontend package 18's (LiveFrame, useLinkLost); see B-03 in docs/plan/backend/01-needs-from-frontend.md.
// Fixed 13 Nov 2026 (QD-B03-01): it reproduced only on a merging-core without package 18 and FD-545. The `link-lost` check proves it by
// killing the Hab Core on all eight live viewports and asserting SCR-18 on both roles before the deadline.
test("release-network: SCR-18 shows within 3 s of the link going down on EVA and ops (enabled by frontend package 18, B-03)", async ({ page }) => {
  test.setTimeout(200_000);
  await page.goto("/#/eva/EV1");
  await waitForSnapshot(page);
  killHab();
  await expect(page.locator('[data-screen="SCR-18"]')).toBeVisible({ timeout: LINK_LOST_MS + 1_000 });
  await restartHab(150_000);
});

// B-03, the second observation: the socket closed (and every reconnect refused) for 3.5 s, on the EVA tablet and on the ops console.
for (const [role, hash] of [["EVA", "/#/eva/EV1"], ["ops", "/#/ops"]] as const) {
  test(`release-network: SCR-18 shows on ${role} when the socket is closed and reconnects are refused (B-03, FR-32)`, async ({ page }) => {
    if (role === "ops") await page.setViewportSize({ width: 1440, height: 900 });
    let linkUp = true;
    let snapshots = 0;
    const open: WebSocketRoute[] = [];
    await page.routeWebSocket(/\/ws(\?.*)?$/, (ws) => {
      if (!linkUp) {
        void ws.close();
        return;
      }
      open.push(ws);
      const server = ws.connectToServer();
      server.onMessage((message) => {
        if (/"type"\s*:\s*"SNAPSHOT"/.test(String(message))) snapshots += 1;
        ws.send(message);
      });
      ws.onMessage((message) => server.send(message));
    });
    await page.goto(hash);
    await expect.poll(() => snapshots, { message: `${role} received its initial SNAPSHOT` }).toBeGreaterThan(0);
    linkUp = false;
    for (const ws of open.splice(0)) await ws.close();
    await expect(page.locator('[data-screen="SCR-18"]')).toBeVisible({ timeout: LINK_LOST_MS + 500 });
    linkUp = true;
    await expect(page.locator('[data-screen="SCR-18"]')).toBeHidden({ timeout: RECONNECT_MS + 3_000 });
  });
}

// B-03: the Hab Core process gone, seen from the ops console too.
test("release-network: SCR-18 shows on ops within 3 s of the Hab Core going away (B-03, FR-32)", async ({ page }) => {
  test.setTimeout(200_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/ops");
  await waitForSnapshot(page);
  killHab();
  await expect(page.locator('[data-screen="SCR-18"]')).toBeVisible({ timeout: LINK_LOST_MS + 1_000 });
  await restartHab(150_000);
});

test("release-network: the Hab Core killed and started again: EVA and ops take a fresh SNAPSHOT of the resumed session", async ({ context }) => {
  test.setTimeout(300_000);
  const eva = await context.newPage();
  const ops = await context.newPage();
  await ops.setViewportSize({ width: 1440, height: 900 });
  await eva.goto("/#/eva/EV1");
  await ops.goto("/#/ops");
  await waitForSnapshot(eva, 30_000);
  await waitForSnapshot(ops, 30_000);

  killHab();
  const killed = Date.now();
  await expect.poll(() => habHealth().then(() => true, () => false), { message: "the Hab Core process is gone" }).toBe(false);
  await eva.waitForTimeout(LINK_LOST_MS + 500);
  test.info().annotations.push({ type: "down-ms", description: String(Date.now() - killed) });

  // `hab:start --resume latest` brings the same session back; both pages reconnect on their own and take a fresh SNAPSHOT (NFR-10).
  const frames = { eva: 0, ops: 0 };
  eva.on("websocket", (ws) => ws.on("framereceived", (f) => typeof f.payload === "string" && /"type"\s*:\s*"SNAPSHOT"/.test(f.payload) && (frames.eva += 1)));
  ops.on("websocket", (ws) => ws.on("framereceived", (f) => typeof f.payload === "string" && /"type"\s*:\s*"SNAPSHOT"/.test(f.payload) && (frames.ops += 1)));
  await restartHab(150_000);
  const answered = Date.now();
  await expect.poll(() => Math.min(frames.eva, frames.ops), { timeout: RECONNECT_MS + 3_000 }).toBeGreaterThan(0);
  test.info().annotations.push({ type: "resumed-ms-after-health", description: String(Date.now() - answered) });
  expect(Date.now() - answered, "both pages have a SNAPSHOT again").toBeLessThanOrEqual(RECONNECT_MS);
  for (const page of [eva, ops]) await waitForSnapshot(page);
});

test("release-network: single-laptop mode serves four windows and runs the killer demo through OPS and EVA", async ({ browser }) => {
  test.skip(
    [join(REPO_ROOT, "data", "sites", REAL_SITE, "site-manifest.json"), join(REPO_ROOT, "data", "sites", REAL_SITE, "grid"),
      join(REPO_ROOT, "data", "sites", REAL_SITE, "tiles"), join(REPO_ROOT, "scenarios", REAL_SCENARIO, "scenario.json")].some((path) => !existsSync(path)),
    "the real bundle is absent",
  );
  test.setTimeout(600_000); // The real grid can take minutes for server-side route computations.
  const port = HAB_PORT + 2;
  const varDir = mkdtempSync(join(tmpdir(), "gale-local-e2e-"));
  const child = spawn("npm", ["run", "-s", "hab:local", "--", "--port", String(port), "--var-dir", varDir], { cwd: REPO_ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout?.on("data", (d: Buffer) => (output += d.toString()));
  child.stderr?.on("data", (d: Buffer) => (output += d.toString()));
  const stop = (): void => {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  };
  try {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`hab:local exited with ${child.exitCode}:\n${output}`);
      const up = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2_000) }).then((r) => r.ok, () => false);
      if (up) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const urls = [...output.matchAll(/http:\/\/(?:127\.0\.0\.1|localhost):\d+\/#\/[^\s]+/g)].map((m) => m[0]);
    expect(urls.length, `the four windows hab:local prints:\n${output}`).toBe(4);
    for (const url of urls) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const frames: string[] = [];
      page.on("websocket", (ws) => ws.on("framereceived", (f) => typeof f.payload === "string" && frames.push(f.payload)));
      await page.goto(url);
      await expect.poll(() => frames.some((f) => /"type"\s*:\s*"SNAPSHOT"/.test(f)), { message: `no SNAPSHOT at ${url}`, timeout: 15_000 }).toBe(true);
      await context.close();
    }
    const context = await browser.newContext({ baseURL: `http://localhost:${port}`, viewport: { width: 1440, height: 900 } });
    try {
      await runKillerDemo(context, await context.newPage(), REAL_SITE, false);
    } finally {
      await context.close();
    }
  } finally {
    stop();
    rmSync(varDir, { recursive: true, force: true });
  }
});

// N-200: the killer demo end to end through the OPS and EVA UI alone. The presenter is not used: SCR-11 starts the library storm
// itself (BD-165), so every command of the demo comes from a control the crew would really press — the ops console's Load
// scenario, Start EVA mission, Set speed to 60x, Start storm and Approve option, and the EVA tablet's Acknowledge alert and
// Summon rover. The evidence is the event log the Hab Core wrote, read back over the ops page's own session API.
//
// The beats are the ones of 01 §E.1: the storm starts, the radiation alert is raised, the options are proposed, the crew
// acknowledges the alert, the rover is summoned, the option is approved and the vehicle is dispatched.
test("release-network: the killer demo runs through the OPS and EVA UI alone (N-200 closed)", async ({ context, page }) => {
  test.setTimeout(600_000);
  await runKillerDemo(context, page);
});

/**
 * Steps the mission clock one engine event at a time, with the ops console's own "Jump to next scheduled event" control,
 * until `reached` holds. `reached` is given the latest session snapshot, read over the ops page's own session API.
 *
 * `JUMP_NEXT_EVENT` advances the sim to the *next event the engine produces* (a link change, an arrival, an alert), not to
 * the next stop (02 §D.17). That granularity is what the real terrain needs: on `gale_boxwork` the crew walks in and out of
 * comm shadow, so the link windows are a few sim-seconds wide and a coarser step would skip over them. The clock is never
 * waited on in real time and the loop is bounded, so an erroneous run cannot spin forever.
 *
 * The clock is paused after every jump, and the state is judged in that pause. The pause is what makes the moment repeatable:
 * the crew's link to the hab changes with the sim clock, so a snapshot read while the clock runs is a race — the crew can be
 * in contact in one read and out of it in the next, and the state the crew sees when it presses a control has to be the
 * state the command is judged against. The clock is resumed for the next jump and paused again, so the loop is a sequence of
 * frozen instants.
 */
async function stepUntil(
  ops: Page,
  wire: LiveWire,
  reached: (snapshot: Snapshot) => boolean,
  label: string,
): Promise<Snapshot> {
  const jump = ops.getByRole("button", { name: "Jump to next scheduled event", exact: true });
  // A paused clock does not advance: the Hab Core only ticks a RUNNING mission (02 §D.14), so the jump needs the clock
  // running. The ops console's own "Resume mission clock" control does it.
  const resume = ops.getByRole("button", { name: "Resume mission clock", exact: true });
  const describe = (snapshot: Snapshot): string => {
    const alerts = JSON.stringify(snapshot.alerts.map((a) => ({ code: a.code, level: a.level, cleared: a.cleared_seq })));
    const crew = JSON.stringify(snapshot.crew.map((c) => ({ id: c.crew_id, linked: c.linked })));
    return `${label} (sim ${snapshot.session.clock.sim_time}, status ${snapshot.session.status}, alerts ${alerts}, crew ${crew})`;
  };
  let snapshot = await sessionSnapshot(ops);
  for (let steps = 0; steps < 512; steps += 1) {
    if (reached(snapshot)) {
      expect(reached(snapshot), describe(snapshot)).toBe(true);
      return snapshot;
    }
    if (!(await jump.count())) break;
    if (await resume.count()) await wire.command("SET_CLOCK", () => resume.click()).catch(() => undefined);
    const result = await wire.command("JUMP_NEXT_EVENT", () => jump.click()).catch(() => undefined);
    // The clock is paused right after the jump, so the snapshot that follows is a frozen instant and not a race.
    await pauseClock(ops, wire);
    if (result && result.ok === false) break; // the clock cannot step any further (the EVA ended, or no event is left)
    snapshot = await sessionSnapshot(ops);
  }
  expect(
    reached(snapshot),
    describe(snapshot),
  ).toBe(true);
  return snapshot;
}

/**
 * Pauses the mission clock with the ops console's own control.
 *
 * The crew's link to the hab changes with the sim clock, and on the real terrain the windows are a few sim-seconds wide. The
 * demo therefore stops the clock at the moment it wants the crew to press, so the link state the crew sees is the state the
 * command is judged against. It is the same control an operator uses; no time is invented.
 */
async function pauseClock(ops: Page, wire: LiveWire): Promise<void> {
  const pause = ops.getByRole("button", { name: "Pause mission clock", exact: true });
  if (await pause.count()) await wire.command("SET_CLOCK", () => pause.click()).catch(() => undefined);
}

/** The map's coordinate readout, which shows the projected position under the pointer (`x <n> m  y <n> m`). */
async function readoutAt(ops: Page, x: number, y: number): Promise<{ x_m: number; y_m: number } | null> {
  const canvas = ops.locator('[data-slot="ops-map"] [data-slot="map-canvas"]');
  await canvas.hover({ position: { x, y } });
  const text = await ops.getByTestId("coord-readout").textContent();
  const match = /x\s*(-?\d+)\s*m\s+y\s*(-?\d+)\s*m/.exec(text ?? "");
  if (!match) return null;
  return { x_m: Number(match[1]), y_m: Number(match[2]) };
}

/**
 * Clicks the map at the place that holds the given working-projection position, and reads the map's own coordinate readout
 * to prove the pick landed there.
 *
 * The ops map is fitted to the site's extent, so the pixel a position falls on is a linear function of it. The test measures
 * that function at two points of the canvas (the map's own readout says where the pointer is) and solves for the position's
 * pixel. Nothing about the projection is assumed: the numbers come from the map that is on screen.
 */
async function pickOnMap(ops: Page, target: { x_m: number; y_m: number }): Promise<void> {
  const canvas = ops.locator('[data-slot="ops-map"] [data-slot="map-canvas"]');
  const box = await canvas.boundingBox();
  expect(box, "the ops map has a size").toBeTruthy();
  const probes: { px: number; py: number; x_m: number; y_m: number }[] = [];
  // Two points on a diagonal are enough to solve the affine map; the readout is read at each of them.
  for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.75]] as const) {
    const read = await readoutAt(ops, box!.width * fx, box!.height * fy);
    expect(read, `the map's readout answers at ${fx},${fy}`).toBeTruthy();
    probes.push({ px: box!.width * fx, py: box!.height * fy, x_m: read!.x_m, y_m: read!.y_m });
  }
  const [a, b] = probes;
  const perPixelX = (b.x_m - a.x_m) / (b.px - a.px);
  const perPixelY = (b.y_m - a.y_m) / (b.py - a.py);
  const px = a.px + (target.x_m - a.x_m) / perPixelX;
  const py = a.py + (target.y_m - a.y_m) / perPixelY;
  expect(px, "the target's pixel is on the map").toBeGreaterThan(0);
  expect(px).toBeLessThan(box!.width);
  expect(py).toBeGreaterThan(0);
  expect(py).toBeLessThan(box!.height);
  const read = await readoutAt(ops, px, py);
  expect(read, "the map's readout answers at the target's pixel").toBeTruthy();
  expect(Math.abs(read!.x_m - target.x_m), `the pick is at x ${target.x_m} m`).toBeLessThanOrEqual(60);
  expect(Math.abs(read!.y_m - target.y_m), `the pick is at y ${target.y_m} m`).toBeLessThanOrEqual(60);
  await canvas.click({ position: { x: px, y: py } });
}

/**
 * Tasks the utility rover as a RELAY, through the ops console's own SCR-15 dialog (FR-41, FR-42; 01 §E.1 row 0:55).
 *
 * This is the beat that closes the comm shadow on the crew's route: the site's own manifest says a crew walking the track
 * "moves in and out of comm shadow", so without a parked relay the crew's own controls never reach the Hab Core. The target
 * is the reference run's own relay cell, (-95, -905) (scenarios/storm-sol4190/reference_commands.json; BD-147).
 *
 * The fake scenario has no utility rover, so on the mock site there is nothing to task and the beat is skipped: the mock
 * terrain has no comm shadow to close.
 */
async function taskRelayRover(ops: Page, wire: LiveWire, site: string): Promise<void> {
  const snapshot = await sessionSnapshot(ops);
  const rover = snapshot.vehicles.find((v) => v.kind === "utility_rover");
  if (!rover) {
    test.info().annotations.push({ type: "relay-beat", description: `skipped: ${site} has no utility rover` });
    return;
  }
  await openOpsPanel(ops, "crew");
  await ops.getByRole("button", { name: `Task rover ${rover.vehicle_id}` }).click();
  const dialog = ops.locator('[data-screen="SCR-15"]');
  await expect(dialog, "the rover tasking dialog opens").toBeVisible({ timeout: 15_000 });
  await dialog.locator('[data-task="RELAY"]').click();
  await dialog.getByRole("button", { name: "Pick on map" }).click();
  await expect(ops.locator(".ops-map-slot"), "the map is picking").toHaveAttribute("data-picking", "true");
  await pickOnMap(ops, { x_m: -95, y_m: -905 });
  await expect(dialog.locator('[data-field="target"]'), "the target is the relay point").toHaveAttribute("data-source", "ui:map-pick");
  await wire.command("TASK_ROVER", () => dialog.locator("[data-action='confirm']").click());
  // The Hab Core accepted the task, so the dialog leaves its choosing state and shows a result (03 SCR-15). Which result
  // depends on the snapshot's timing — Queued while the task waits, En route once it is the head of the queue — so the check
  // asserts the acceptance, not one transient label.
  await expect(dialog.locator("[data-state]"), "the relay task was accepted").toBeVisible({ timeout: 15_000 });
  await expect(dialog.locator("[data-state='failed']"), "the relay task was not rejected").toHaveCount(0);
  // The snapshot is the authority on what the rover is doing: the relay is the task, at the picked point (the pick is the
  // map's own reading of the click, so it lands on the cell within the map's resolution).
  await expect
    .poll(
      async () => {
        const after = await sessionSnapshot(ops);
        const ur = after.vehicles.find((v) => v.vehicle_id === rover.vehicle_id);
        const t = ur?.task;
        if (t?.kind !== "RELAY" || !t.target) return null;
        return Math.max(Math.abs(t.target.x_m + 95), Math.abs(t.target.y_m + 905)) <= 60;
      },
      { message: "the rover's snapshot shows the relay task at the picked point", timeout: 15_000 },
    )
    .toBe(true);
}

async function runKillerDemo(context: BrowserContext, page: Page, site = e2eSite(), resetAfter = true): Promise<void> {
  const eva = page;
  const { ops, wire } = await openFreshOps(context, site);
  const evaWire = watchLive(eva);
  try {
    await startPaused(ops, wire);
    await eva.goto(`/?site=${site}#/eva/EV1`);
    await expect.poll(() => evaWire.messages.some((m) => m.type === "SNAPSHOT"), { message: "the EVA tablet got a SNAPSHOT" }).toBe(true);

    // The relay beat of 01 §E.1 (row 0:55): the utility rover is tasked to park as a RELAY, which is what closes the
    // comm shadow on the crew's route. On the real terrain the crew walks out of the hab's line of sight, so without the
    // relay the crew's own controls never reach the Hab Core. The beat is the reference run's own (TASK_ROVER UR1 RELAY at
    // (-95, -905) at 04:11:01, scenarios/storm-sol4190/reference_commands.json).
    await taskRelayRover(ops, wire, site);

    // SCR-11 starts the storm; the presenter is not in the loop (N-200, BD-165).
    await wire.command("START_EVENT", () => ops.getByRole("button", { name: "Start storm", exact: true }).click());

    // The alert reaches the EVA tablet and the crew acknowledges it there. On the real terrain the crew is in the hab's
    // comm shadow when the storm's alert arrives, so the Hab Core refuses the EVA's command with NO_LINK (02 §E.6) and the
    // command waits queued on the tablet. The crew waits for the link before pressing, so the demo waits for it too: the
    // clock is stepped one engine event at a time, and each step is judged in a pause, so the link state cannot change under
    // the crew's finger.
    await stepUntil(
      ops,
      wire,
      (snapshot) => {
        const alert = snapshot.alerts.find((a) => a.level === "warning" && a.cleared_seq === null);
        const crew = snapshot.crew.find((c) => c.crew_id === "EV1");
        return Boolean(alert && crew?.linked);
      },
      "the storm's alert is up and the crew's suit has the hab link",
    );

    const ack = eva.getByRole("button", { name: "Acknowledge alert" });
    await expect(ack, "the alert is on the EVA tablet").toBeVisible({ timeout: 15_000 });
    await evaWire.command("ACK_ALERT", () => ack.click());

    // The options are proposed for that alert and the crew summons the rover from the tablet.
    await expect
      .poll(() => wire.events().some((e) => e.kind === "OPTIONS_PROPOSED"), { message: "the options arrive" })
      .toBe(true);
    const summon = eva.getByRole("button", { name: /Summon rover/ });
    await expect(summon, "the EVA tablet offers Summon rover").toBeVisible({ timeout: 15_000 });
    await evaWire.command("SUMMON_VEHICLE", () => hold(eva, summon));

    // SCR-11 approves the option; the rover is dispatched.
    await openOpsPanel(ops, "mission");
    const option = ops.locator('[role="radio"][data-option-kind="ABORT_TO_HAB"]');
    await expect(option, "the ops console lists the options").toHaveCount(1, { timeout: 15_000 });
    await option.click();
    await wire.command("APPROVE_OPTION", () => hold(ops, ops.getByRole("button", { name: /Approve option/ })));

    // The beats are in the log the Hab Core wrote, in this order. The approval dispatches the rover at once, so the clock
    // stays paused and the log is read as it stands.
    await expect
      .poll(() => wire.events().some((e) => e.kind === "VEHICLE_DISPATCHED" && e.data.vehicle_id === "PR1"), { message: "the rover is dispatched" })
      .toBe(true);
    const log = await sessionLog(ops);
    const seqOf = (kind: string, where: (d: Record<string, unknown>) => boolean = () => true): number =>
      log.find((e) => e.kind === kind && where(e.data as Record<string, unknown>))?.seq ?? -1;
    const order = [
      seqOf("ALERT_RAISED", (d) => d.code === "RADIATION_ALERT"),
      seqOf("OPTIONS_PROPOSED"),
      seqOf("ALERT_ACKED"),
      seqOf("VEHICLE_DISPATCHED", (d) => d.vehicle_id === "PR1"),
    ];
    expect(order.every((s) => s > 0), `seqs ${order.join(", ")} of ${JSON.stringify(log.map((e) => e.kind))}`).toBe(true);
    expect(order, "the beats come in this order").toEqual([...order].sort((a, b) => a - b));

    // Every command of the demo came from a UI control: the ops console or the EVA tablet, never from the API.
    expect(wire.commands.map((c) => c.kind)).toContain("START_EVA");
    expect(wire.commands.map((c) => c.kind)).toContain("START_EVENT");
    expect(wire.commands.map((c) => c.kind)).toContain("APPROVE_OPTION");
    expect(evaWire.commands.map((c) => c.kind)).toContain("ACK_ALERT");
    expect(evaWire.commands.map((c) => c.kind)).toContain("SUMMON_VEHICLE");
  } finally {
    await eva.close().catch(() => undefined);
    await ops.close().catch(() => undefined);
    if (resetAfter) await resetThroughPresenter(context, site);
  }
}

// NFR-12 budget 500 ms, p95 of 20 samples. The full measurement — 20 tablet task changes, the abort dropping open tasks and the
// independent log/report equality — is the `task-latency` check, which runs on every live viewport. This case proves the same budget
// from the release-network side: one real task change at a real stop reaches the ops TaskProgress inside the budget.
//
// It runs on the F4 `mock_site` with the harness's fake scenario, on a Hab Core of its own: the budget is a property of the
// wire, not of the terrain, and on the real `gale_boxwork` ground the crew walks into the hab's comm shadow at its first stop,
// where the tablet's task list is a figure and not a control (FD-032). The `release-matrix` check pins the same fixture for
// the same reason.
test("release-network: a task tick on the EVA tablet reaches the ops TaskProgress within 500 ms, p95 of 20 (enabled by frontend packages 17 and 29)", async ({ browser }) => {
  test.setTimeout(600_000);
  await withMockHab(HAB_PORT + 3, async (origin) => {
    const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 900 } });
    const eva = await context.newPage();
    const { ops, wire } = await openFreshOps(context, "mock_site");
    const evaWire = watchLive(eva);
    try {
      await startPaused(ops, wire);
      await eva.goto("/?site=mock_site#/eva/EV1");
      await expect.poll(() => evaWire.messages.some((m) => m.type === "SNAPSHOT")).toBe(true);

      // The crew walks to its first stop: the tablet's task list is a control only while the crew is AT the stop (FD-032),
      // so the walk has to be walked out. The step is the ops console's own "Jump to next scheduled event", and the arrival is
      // read from the snapshot's `activity`, not from the event list: the EVENT frames arrive after the command result, so a
      // check that reads the events would step past the arrival and miss the window.
      const jump = ops.getByRole("button", { name: "Jump to next scheduled event", exact: true });
      const resume = ops.getByRole("button", { name: "Resume mission clock", exact: true });
      if (await resume.count()) await wire.command("SET_CLOCK", () => resume.click());
      let atStop = false;
      for (let step = 0; step < 64; step += 1) {
        await wire.command("JUMP_NEXT_EVENT", () => jump.click()).catch(() => undefined);
        const snapshot = await sessionSnapshot(ops);
        const ev1 = snapshot.crew.find((c) => c.crew_id === "EV1");
        if (ev1?.activity === "AT_STOP") {
          atStop = true;
          break;
        }
      }
      expect(atStop, "EV1 reaches its first stop").toBe(true);
      // The clock is paused on arrival, so the crew stays at the stop while the tablet is used.
      await pauseClock(ops, wire);

      await eva.getByTestId("tasks-button").click();
      const row = eva.locator('[data-task-id]').first();
      await expect(row, "the tablet lists a stop task").toBeVisible({ timeout: 30_000 });
      const taskId = await row.getAttribute("data-task-id");
      const before = await sessionSnapshot(ops);
      const task = before.tasks.find((t) => t.task_id === taskId)!;
      expect(task, "the row is a real task from the plan, not an invented checkbox").toBeTruthy();
      expect(task.state, "the task starts as TODO").toBe("TODO");

      await openOpsPanel(ops, "crew");
      const mine = before.tasks.filter((t) => t.crew_id === null || t.crew_id === "EV1");
      const baseDone = mine.filter((t) => t.state === "DONE").length;
      const expected = `TOTAL ${baseDone + 1}/${mine.length}`;

      // Both clocks are the browser epoch, so the interval is the real click-to-ops-DOM time and not an automation delay.
      await eva.evaluate(() => {
        (window as Window & { __taskClick?: number }).__taskClick = undefined;
        document.addEventListener("click", () => {
          (window as Window & { __taskClick?: number }).__taskClick = performance.timeOrigin + performance.now();
        }, { capture: true, once: true });
      });
      await ops.getByTestId("task-progress-EV1").evaluate((element, text) => {
        (window as Window & { __taskChange?: number }).__taskChange = undefined;
        const observer = new MutationObserver(() => {
          if (element.textContent?.replace(/\s+/g, " ").includes(text)) {
            (window as Window & { __taskChange?: number }).__taskChange = performance.timeOrigin + performance.now();
            observer.disconnect();
          }
        });
        observer.observe(element, { subtree: true, childList: true, characterData: true });
      }, expected);

      await evaWire.command("UPDATE_STOP_TASK", () => row.getByRole("button", { name: /^Mark task done:/ }).click());
      await expect(ops.getByTestId("task-progress-EV1")).toContainText(expected);
      await expect.poll(() => ops.evaluate(() => (window as Window & { __taskChange?: number }).__taskChange)).toBeTruthy();
      const start = await eva.evaluate(() => (window as Window & { __taskClick?: number }).__taskClick);
      const end = await ops.evaluate(() => (window as Window & { __taskChange?: number }).__taskChange);
      expect(start).toBeDefined();
      expect(end).toBeDefined();
      test.info().annotations.push({ type: "release-network-task-ms", description: String(end! - start!) });
      expect(end! - start!, "the tablet task change reaches the ops TaskProgress inside the NFR-12 budget").toBeLessThanOrEqual(500);
    } finally {
      await eva.goto("about:blank").catch(() => undefined);
      await ops.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  });
});
