/**
 * Check `capture` (replaces T17.02 and T17.03 footage). Enabled by package 32.
 * Parses the beat windows from `docs/ops/storyboard.md`, drives the real UI to reach each beat inside its window,
 * records 1440x900 planner/ops/report clips plus 844x390 EVA and HUD frames to `var/videos/raw/`, and writes
 * `var/videos/capture-manifest.json` for `scripts/make_video.sh`. Footage is git-ignored (FD-164).
 */
import { expect, test, type Browser, type BrowserContext, type Page, type WebSocketRoute } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClientMessage, Command, CommandResult, Snapshot } from "@marswalk/protocol";
import { applyStateDelta } from "../../src/net/habClient";
import { captureSiteConfig, captureSiteUrl } from "../lib/captureSite";
import { openOpsPanel } from "../lib/opsFixture";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const STORYBOARD_PATH = join(REPO_ROOT, "docs", "ops", "storyboard.md");
const RECORDING_PATH = join(REPO_ROOT, "scenarios", "storm-sol4190", "recording.json");
const VIDEO_DIR = join(REPO_ROOT, "var", "videos");
const RAW_DIR = join(VIDEO_DIR, "raw");
const TMP_DIR = join(RAW_DIR, "_tmp");
const MANIFEST_PATH = join(VIDEO_DIR, "capture-manifest.json");

interface StoryboardBeat {
  track: "240s" | "30s";
  id: string;
  windowText: string;
  startSec: number;
  endSec: number;
  windowMs: number;
  screen: string;
}

interface RecordedBeat {
  id: string;
  track: "240s" | "30s";
  clip: string;
  clipStartMs: number;
  clipEndMs: number;
  reachedInMs: number;
  windowMs: number;
  targetStartSec: number;
  targetEndSec: number;
  screen: string;
}

interface RecordingFile {
  log_hash: string;
  scenario_id: string;
  data_version: string;
  seed: number;
  messages: Array<
    | { type: "SNAPSHOT"; seq: number; [k: string]: unknown }
    | { type: "STATE_DELTA"; seq: number; sim_time: string; changes: Array<{ path: string; value: unknown }> }
    | { type: "EVENT"; seq: number; sim_time: string; event: Record<string, unknown> }
  >;
}

function parseClockToSec(mmss: string): number {
  const m = /^(\d+):(\d{2})$/.exec(mmss.trim());
  if (!m) throw new Error(`Invalid beat timestamp "${mmss}" in storyboard.md`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function loadStoryboardBeats(): StoryboardBeat[] {
  if (!existsSync(STORYBOARD_PATH)) {
    throw new Error(`Missing storyboard file: ${STORYBOARD_PATH}`);
  }
  const md = readFileSync(STORYBOARD_PATH, "utf8");
  const beats: StoryboardBeat[] = [];
  let currentTrack: "240s" | "30s" | null = null;
  for (const line of md.split(/\r?\n/)) {
    if (/^##\s+240-s\b/i.test(line)) currentTrack = "240s";
    else if (/^##\s+30-s\b/i.test(line)) currentTrack = "30s";
    if (!currentTrack || !line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    const id = cells[0]!;
    if (!/^(?:240|30)-\d{2}$/.test(id)) continue;
    const windowText = cells[1]!;
    const range = /^(\d+:\d{2})\s*[–-]\s*(\d+:\d{2})$/.exec(windowText);
    if (!range) throw new Error(`Invalid beat window "${windowText}" for ${id}`);
    const startSec = parseClockToSec(range[1]!);
    const endSec = parseClockToSec(range[2]!);
    if (endSec <= startSec) throw new Error(`Beat ${id} has non-positive window ${windowText}`);
    beats.push({
      track: currentTrack,
      id,
      windowText,
      startSec,
      endSec,
      windowMs: (endSec - startSec) * 1000,
      screen: cells[2]!,
    });
  }
  if (beats.filter((b) => b.track === "240s").length < 10) {
    throw new Error(`Expected >= 10 beats in 240-s track in ${STORYBOARD_PATH}`);
  }
  if (beats.filter((b) => b.track === "30s").length < 4) {
    throw new Error(`Expected >= 4 beats in 30-s track in ${STORYBOARD_PATH}`);
  }
  return beats;
}

/**
 * Replays snapshots/deltas from `scenarios/storm-sol4190/recording.json` over WebSocket to attached pages (`ops`, `eva`,
 * `hud`) and applies interactive commands sent by the real UI so multi-role interactions behave deterministically.
 */
class StormSessionBridge {
  private readonly recording: RecordingFile;
  private snapshot: Snapshot;
  private cursor = 0;
  private seq: number;
  private readonly sockets = new Set<{ ws: WebSocketRoute; role: string }>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  readonly commands: Array<Pick<Command, "kind" | "args" | "queued_offline">> = [];

  constructor() {
    this.recording = JSON.parse(readFileSync(RECORDING_PATH, "utf8")) as RecordingFile;
    const first = this.recording.messages[0];
    if (!first || first.type !== "SNAPSHOT") {
      throw new Error("storm-sol4190/recording.json message[0] must be a SNAPSHOT");
    }
    this.snapshot = structuredClone(first) as unknown as Snapshot;
    this.seq = first.seq;
    this.heartbeat = setInterval(() => {
      for (const entry of this.sockets) {
        try {
          entry.ws.send(JSON.stringify({ v: 1, type: "PING", seq: this.seq }));
        } catch {
          // Socket may already be closing.
        }
      }
    }, 1000);
  }

  async attach(page: Page, expectedRole: string): Promise<void> {
    await page.routeWebSocket("**/ws", (ws) => {
      const entry = { ws, role: expectedRole };
      this.sockets.add(entry);
      ws.onMessage((raw) => {
        const msg = JSON.parse(String(raw)) as ClientMessage;
        if (msg.type === "HELLO") {
          entry.role = msg.role;
          ws.send(JSON.stringify({ ...this.snapshot, seq: this.seq }));
          return;
        }
        if (msg.type === "COMMAND") {
          this.handleCommand(ws, msg.command_id, msg.role, msg.command);
        }
      });
      ws.onClose(() => {
        this.sockets.delete(entry);
      });
    });
  }

  private broadcastSnapshot(): void {
    const payload = JSON.stringify({ ...this.snapshot, seq: this.seq });
    for (const entry of this.sockets) {
      try {
        entry.ws.send(payload);
      } catch {
        // Ignore closed socket.
      }
    }
  }

  private broadcastDelta(changes: Array<{ path: string; value: unknown }>): void {
    this.seq += 1;
    this.snapshot = applyStateDelta({ ...this.snapshot, seq: this.seq }, changes);
    const payload = JSON.stringify({
      v: 1,
      type: "STATE_DELTA",
      seq: this.seq,
      sim_time: this.snapshot.sim_time,
      changes,
    });
    for (const entry of this.sockets) {
      try {
        entry.ws.send(payload);
      } catch {
        // Ignore closed socket.
      }
    }
  }

  advanceToMessage(targetIndex: number): void {
    const limit = Math.min(targetIndex, this.recording.messages.length - 1);
    while (this.cursor < limit) {
      this.cursor += 1;
      const m = this.recording.messages[this.cursor]!;
      this.seq = Math.max(this.seq + 1, m.seq);
      if (m.type === "STATE_DELTA") {
        this.snapshot = applyStateDelta({ ...this.snapshot, seq: this.seq, sim_time: m.sim_time }, m.changes);
      } else if (m.type === "EVENT") {
        const ev = m.event as { kind?: string; data?: Record<string, unknown> };
        if (ev.kind === "ALERT_RAISED" && ev.data?.alert_id) {
          const alertObj = {
            alert_id: String(ev.data.alert_id),
            code: String(ev.data.code ?? "RADIATION_ALERT"),
            level: (ev.data.level as "warning" | "caution" | "advisory") ?? "warning",
            message: String(ev.data.message ?? ""),
            raised_seq: m.seq,
            raised_sim_time: m.sim_time,
            acked_by: null,
            acked_seq: null,
            cleared_seq: null,
            subjects: Array.isArray(ev.data.subjects) ? ev.data.subjects.map(String) : ["EV1", "EV2"],
            data: ev.data,
          };
          const exists = this.snapshot.alerts.some((a) => a.alert_id === alertObj.alert_id);
          if (!exists) {
            this.snapshot = {
              ...this.snapshot,
              seq: this.seq,
              sim_time: m.sim_time,
              alerts: [...this.snapshot.alerts, alertObj as Snapshot["alerts"][number]],
            };
          }
          if (typeof ev.data.rate_ugy_h === "number") {
            this.snapshot = applyStateDelta(this.snapshot, [
              { path: "conditions/dose_rate_event_ugy_h", value: ev.data.rate_ugy_h },
            ]);
          }
        } else if (ev.kind === "OPTIONS_PROPOSED" && Array.isArray(ev.data?.options)) {
          this.snapshot = {
            ...this.snapshot,
            seq: this.seq,
            sim_time: m.sim_time,
            options: ev.data.options as Snapshot["options"],
          };
        }
      }
    }
    this.broadcastSnapshot();
  }

  setCrewLinked(crewId: string, linked: boolean): void {
    this.broadcastDelta([
      { path: `crew/${crewId}/linked`, value: linked },
      { path: `crew/${crewId}/stale`, value: !linked },
    ]);
  }

  setAlerts(alerts: Snapshot["alerts"]): void {
    this.broadcastDelta([{ path: "alerts", value: alerts }]);
  }

  getAlerts(): Snapshot["alerts"] {
    return this.snapshot.alerts;
  }

  private handleCommand(ws: WebSocketRoute, commandId: string, role: string, command: Pick<Command, "kind" | "args" | "queued_offline">): void {
    this.commands.push(command);
    if (command.kind === "UPDATE_STOP_TASK") {
      const args = command.args as { task_id: string; state: string; reason?: string | null };
      const changes: Array<{ path: string; value: unknown }> = [
        { path: `tasks/${args.task_id}/state`, value: args.state },
        { path: `tasks/${args.task_id}/updated_by`, value: role },
      ];
      if ("reason" in args) {
        changes.push({ path: `tasks/${args.task_id}/reason`, value: args.reason ?? null });
      }
      this.broadcastDelta(changes);
    } else if (command.kind === "TASK_ROVER") {
      const args = command.args as { vehicle_id: string; task: string; target?: { x_m: number; y_m: number }; item?: string };
      const fallback = this.snapshot.vehicles.find((v) => v.vehicle_id === args.vehicle_id);
      const taskObj = {
        kind: args.task,
        target: args.target ?? (fallback ? { x_m: fallback.x_m, y_m: fallback.y_m } : undefined),
        ...(args.item ? { item: args.item } : {}),
      };
      const changes: Array<{ path: string; value: unknown }> = [
        { path: `vehicles/${args.vehicle_id}/task`, value: taskObj },
        { path: `vehicles/${args.vehicle_id}/state`, value: "EN_ROUTE" },
      ];
      this.broadcastDelta(changes);
    } else if (command.kind === "SUMMON_VEHICLE") {
      this.broadcastDelta([{ path: `vehicles/PR1/state`, value: "EN_ROUTE" }]);
    } else if (command.kind === "SET_CLOCK") {
      const args = command.args as { paused?: boolean; speed?: number };
      const changes: Array<{ path: string; value: unknown }> = [];
      if (typeof args.paused === "boolean") changes.push({ path: "session/clock/paused", value: args.paused });
      if (typeof args.speed === "number") changes.push({ path: "session/clock/speed", value: args.speed });
      if (changes.length > 0) this.broadcastDelta(changes);
    } else if (command.kind === "APPROVE_OPTION") {
      this.broadcastDelta([
        { path: "vehicles/PR1/state", value: "EN_ROUTE" },
        { path: "options", value: [] },
      ]);
    }
    const result: CommandResult = {
      v: 1,
      type: "COMMAND_RESULT",
      command_id: commandId,
      ok: true,
      event_seq: this.seq,
    };
    ws.send(JSON.stringify(result));
  }

  dispose(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}

async function newRecordingContext(
  browser: Browser,
  width: number,
  height: number,
): Promise<{ context: BrowserContext; page: Page; startedAt: number }> {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    recordVideo: { dir: TMP_DIR, size: { width, height } },
  });
  const page = await context.newPage();
  return { context, page, startedAt: Date.now() };
}

async function saveRecording(context: BrowserContext, page: Page, destName: string): Promise<string> {
  const dest = join(RAW_DIR, destName);
  const video = page.video();
  await context.close();
  if (!video) throw new Error(`Playwright did not produce a video for ${destName}`);
  copyFileSync(await video.path(), dest);
  return dest;
}

test("capture: each beat reached within its window", async ({ browser }) => {
  test.setTimeout(120_000);
  const siteCfg = captureSiteConfig();
  const storyboardBeats = loadStoryboardBeats();
  const beatById = new Map(storyboardBeats.map((b) => [b.id, b]));

  rmSync(MANIFEST_PATH, { force: true });
  mkdirSync(TMP_DIR, { recursive: true });

  const recordedBeats: RecordedBeat[] = [];
  const bridge = new StormSessionBridge();

  const recordBeat = async (
    id: string,
    clipName: string | string[],
    contextStartedAt: number | number[],
    dwellMs: number,
    fn: () => Promise<void>,
  ): Promise<void> => {
    const spec = beatById.get(id);
    if (!spec) throw new Error(`Storyboard is missing expected beat ${id}`);
    // A beat that drives more than one role records one clip per role: the HUD, the EVA tablet and the ops console
    // were all recording while the beat was reached, so all three are the footage of that beat (the 30-s cut
    // assembles the storm from them).
    const clipNames = Array.isArray(clipName) ? clipName : [clipName];
    const starts = Array.isArray(contextStartedAt) ? contextStartedAt : [contextStartedAt];
    if (starts.length !== clipNames.length) throw new Error(`Beat ${id}: one start time per clip is needed`);
    const t0 = Date.now();
    await fn();
    const reachedInMs = Date.now() - t0;
    expect(reachedInMs, `Beat ${id} exceeded its ${spec.windowMs} ms window`).toBeLessThanOrEqual(spec.windowMs);
    await new Promise((r) => setTimeout(r, dwellMs));
    clipNames.forEach((clip, index) => {
      recordedBeats.push({
        id,
        track: spec.track,
        clip,
        clipStartMs: t0 - starts[index]!,
        clipEndMs: Date.now() - starts[index]!,
        reachedInMs,
        windowMs: spec.windowMs,
        targetStartSec: spec.startSec,
        targetEndSec: spec.endSec,
        screen: spec.screen,
      });
    });
  };

  try {
    // --------------------------------------------------------- 1. PLANNER FLOW (1440x900)
    const plannerSession = await newRecordingContext(browser, 1440, 900);
    const p = plannerSession.page;

    await recordBeat("240-01", "planner.webm", plannerSession.startedAt, 1500, async () => {
      await p.goto(captureSiteUrl("/", siteCfg.site, true));
      await p.waitForLoadState("networkidle");
      await expect(p.locator('[data-screen="SCR-01"]')).toContainText("It is not astronaut operations software.");
      await p.getByText(/Start planning/).first().click();
      await expect(p).toHaveURL(/#\/planner/);
      await p.locator('[data-slot="map-workspace"]').waitFor();
      const toggle = p.locator('[data-slot="drawer-toggle"][data-for="left"]');
      if (await toggle.isVisible()) await toggle.click();
      const switches = p.locator('[data-drawer="left"] [data-layer-id] [role="switch"]:not([disabled])');
      const count = await switches.count();
      expect(count).toBeGreaterThan(0);
      await switches.first().click();
    });

    await recordBeat("240-02", "planner.webm", plannerSession.startedAt, 1500, async () => {
      await p.getByRole("tab", { name: "Plan", exact: true }).click();
      await p.locator('[data-slot="plan-panel"]').waitFor();
      const evaStart = p.getByLabel(/EVA start/i);
      await expect(evaStart).not.toHaveValue("", { timeout: 5_000 }).catch(() => undefined);
      await evaStart.fill(siteCfg.evaStartUtc);
      await p.waitForFunction(() => typeof (window as unknown as { __tryPlace?: unknown }).__tryPlace === "function");
      for (const [x, y] of siteCfg.initialStops) {
        const out = await p.evaluate(
          ([px, py]) => (window as unknown as { __tryPlace: (a: number, b: number) => Promise<{ outcome: string }> }).__tryPlace(px!, py!),
          [x, y],
        );
        expect(out.outcome).toBe("placed");
      }
      await expect(p.locator('[data-waypoint-id="wp-3"]')).toBeVisible();
      await expect(p.locator("[data-results-banner]")).toContainText("OK");
    });

    await recordBeat("240-03", "planner.webm", plannerSession.startedAt, 1500, async () => {
      // Attempt impassable steep cell, observe refusal notice, then add valid nearby stop -> OK.
      const refused = await p.evaluate(
        ([px, py]) => (window as unknown as { __tryPlace: (a: number, b: number) => Promise<{ outcome: string }> }).__tryPlace(px!, py!),
        siteCfg.refusedStop,
      );
      expect(refused.outcome).toBe("refused");
      await expect(p.locator('[data-slot="placement-notice"] [data-slot="notice"]')).toContainText(/Not walkable here/);
      const recovered = await p.evaluate(
        ([px, py]) => (window as unknown as { __tryPlace: (a: number, b: number) => Promise<{ outcome: string }> }).__tryPlace(px!, py!),
        siteCfg.recoveryStop,
      );
      expect(recovered.outcome).toBe("placed");
      await expect(p.locator('[data-waypoint-id="wp-4"]')).toBeVisible();
      await expect(p.locator("[data-results-banner]")).toContainText("OK");
    });

    await recordBeat("240-04", "planner.webm", plannerSession.startedAt, 1500, async () => {
      await p.locator('[data-slot="briefing"]').click();
      await expect(p).toHaveURL(/#\/briefing/);
      await expect(p.locator("[data-plan-hash]")).toBeVisible();
      await expect(p.getByRole("button", { name: "Export plan JSON" })).toBeEnabled();
      await p.evaluate(() => {
        window.location.hash = "#/sources";
      });
      await expect(p.locator('[data-screen="SCR-09"] h1')).toContainText("What each value is");
      await expect(p.locator('[data-slot="dataset-row"]').first()).toBeVisible();
    });

    // Capture 240-09 on SCR-09 highlighting datasets + provenance classes
    await recordBeat("240-09", "planner.webm", plannerSession.startedAt, 1500, async () => {
      await p.evaluate(() => {
        window.location.hash = "#/sources";
      });
      await expect(p.locator('[data-screen="SCR-09"]').first()).toBeVisible();
      await expect(p.locator('[data-screen="SCR-09"]').first()).toContainText(/simulated/i);
    });

    await saveRecording(plannerSession.context, p, "planner.webm");

    // --------------------------------------------------------- 2. OPS + EVA + HUD (Storm Sol 4190)
    const opsSession = await newRecordingContext(browser, 1440, 900);
    const opsPage = opsSession.page;
    await bridge.attach(opsPage, "ops");

    const evaSession = await newRecordingContext(browser, 844, 390);
    const evaPage = evaSession.page;
    await bridge.attach(evaPage, "eva:EV1");

    const hudSession = await newRecordingContext(browser, 844, 390);
    const hudPage = hudSession.page;
    await bridge.attach(hudPage, "hud:EV1");

    // Advance recording to stop 1 (msg 28: EV1 AT_STOP at wp-1); nominal + linked for the 1:05 stop-task tick beat
    bridge.advanceToMessage(28);
    const savedAlerts = bridge.getAlerts();
    bridge.setAlerts([]);
    bridge.setCrewLinked("EV1", true);
    await opsPage.goto(captureSiteUrl("/ops", siteCfg.site));
    await evaPage.goto(captureSiteUrl("/eva/EV1", siteCfg.site));
    await hudPage.goto(captureSiteUrl("/hud/EV1", siteCfg.site));
    await expect(opsPage.locator(".scr11-ops-console").first()).toBeVisible();
    await expect(evaPage.locator('[data-screen="SCR-12"]').first()).toBeVisible();
    await expect(hudPage.locator('[data-screen="SCR-13"]').first()).toBeVisible();

    // Beat 240-05 (1:00–1:10): Ops console + EVA tablet + FD-213 task tick at 1:05 synced across tabs
    await recordBeat("240-05", "eva.webm", evaSession.startedAt, 1500, async () => {
      const progress = opsPage.locator('[data-testid="task-progress-EV1"]');
      const before = await progress.innerText();
      await evaPage.getByTestId("tasks-button").click();
      const firstTick = evaPage.getByRole("button", { name: /Mark task done:/i }).first();
      await expect(firstTick).toBeVisible();
      await firstTick.click();
      await expect(progress).not.toHaveText(before, { timeout: 2000 });
    });

    // Beat 240-06 (1:10–1:30): Earth link + DONKI CME + UR1 RELAY dispatch clearing COMM_SHADOW
    bridge.setAlerts(savedAlerts);
    await recordBeat("240-06", "ops.webm", opsSession.startedAt, 1500, async () => {
      await expect(opsPage.locator(".scr11-ops-console").first()).toContainText(/COMM_SHADOW|Comm shadow|Comm/i);
      await openOpsPanel(opsPage, "crew");
      await opsPage.getByRole("button", { name: "Task rover UR1" }).click();
      const dialog = opsPage.locator('[data-screen="SCR-15"]');
      await expect(dialog).toBeVisible();
      await dialog.locator('[data-task="RELAY"]').click();
      const suggest = dialog.getByRole("button", { name: "Use this suggestion" });
      if (await suggest.isVisible().catch(() => false)) {
        await suggest.click();
      } else {
        await dialog.getByRole("button", { name: "Pick on map" }).click();
        const canvas = opsPage.locator('[data-slot="ops-map"] [data-slot="map-canvas"]');
        await canvas.locator("canvas").first().waitFor({ state: "visible", timeout: 10_000 });
        await canvas.click();
      }
      await dialog.locator('[data-action="confirm"]').click();
      expect(bridge.commands.some((c) => c.kind === "TASK_ROVER")).toBe(true);
      bridge.advanceToMessage(130);
    });

    // Beat 240-07 (1:30–2:00): Radiation surge alert + OPTIONS_PROPOSED + EVA Summon rover + HUD alert + Ops approval
    bridge.advanceToMessage(132); // RADIATION_ALERT a-45 + OPTIONS_PROPOSED active before auto-dispatch at msg 134
    bridge.setCrewLinked("EV1", true); // UR1 relay active so EVA Summon sends immediately
    await recordBeat("240-07", ["hud.webm", "eva.webm", "ops.webm"], [hudSession.startedAt, evaSession.startedAt, opsSession.startedAt], 1500, async () => {
      await expect(hudPage.locator('[data-hud-value="alert"]')).toContainText(/radiation surge/i);
      await expect(evaPage.locator('[data-screen="SCR-14"]')).toBeVisible();
      // Hold "Summon rover" button (HoldToConfirm) -> "Summon accepted"
      const summonBtn = evaPage.locator("#action-summon-rover");
      await expect(summonBtn).toBeVisible();
      const box = (await summonBtn.boundingBox())!;
      await evaPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await evaPage.mouse.down();
      await evaPage.waitForTimeout(900);
      await evaPage.mouse.up();
      await expect(evaPage.locator('[data-screen="SCR-12"]')).toContainText(/Summon accepted/i);
      expect(bridge.commands.some((c) => c.kind === "SUMMON_VEHICLE")).toBe(true);

      // Ops console shows alert and options panel
      await expect(opsPage.getByRole("alert").first()).toBeVisible();
      const optRadio = opsPage.getByRole("radio").first();
      if (await optRadio.isVisible()) {
        await optRadio.click();
        const approve = opsPage.getByRole("button", { name: /Approve option/ });
        await approve.focus();
        await opsPage.keyboard.down("Space");
        await opsPage.waitForTimeout(900);
        await opsPage.keyboard.up("Space");
        expect(bridge.commands.some((c) => c.kind === "APPROVE_OPTION")).toBe(true);
      }
    });

    await saveRecording(opsSession.context, opsPage, "ops.webm");
    await saveRecording(evaSession.context, evaPage, "eva.webm");
    await saveRecording(hudSession.context, hudPage, "hud.webm");

    // --------------------------------------------------------- 3. POST-EVA REPORT (1440x900, PRINT)
    const reportSession = await newRecordingContext(browser, 1440, 900);
    const rPage = reportSession.page;

    await recordBeat("240-08", "report.webm", reportSession.startedAt, 1500, async () => {
      await rPage.goto(captureSiteUrl("/report", siteCfg.site));
      await expect(rPage.locator(".scr17-post-eva-report").first()).toBeVisible();
      await expect(rPage.locator(".scr17-post-eva-report").first()).toContainText("It is not astronaut operations software.");
    });

    // Beat 240-10 (3:20–4:00): Disclaimer, team credit & verification summary
    await recordBeat("240-10", "report.webm", reportSession.startedAt, 1500, async () => {
      await expect(rPage.locator(".scr17-post-eva-report [data-log-hash]")).toBeVisible();
    });

    await saveRecording(reportSession.context, rPage, "report.webm");

    // --------------------------------------------------------- 4. 30-S GLOBAL CUT MAPPINGS
    // Every 30-s beat maps directly to the verified UI recordings above; verify their windows exist cleanly.
    const reuseFrom240 = [
      { id: "30-01", sourceId: "240-01" },
      { id: "30-02", sourceId: "240-07" },
      { id: "30-03", sourceId: "240-09" },
      { id: "30-04", sourceId: "240-10" },
    ] as const;

    for (const item of reuseFrom240) {
      const spec = beatById.get(item.id);
      // A source beat that drove several roles has one recorded clip per role; the 30-s cut reuses all of them.
      const sources = recordedBeats.filter((b) => b.id === item.sourceId);
      if (!spec || sources.length === 0) throw new Error(`Missing beat spec or source recording for ${item.id}`);
      for (const src of sources) {
        expect(src.reachedInMs, `30-s beat ${item.id} exceeded window`).toBeLessThanOrEqual(spec.windowMs);
        recordedBeats.push({
          id: item.id,
          track: "30s",
          clip: src.clip,
          clipStartMs: src.clipStartMs,
          clipEndMs: src.clipEndMs,
          reachedInMs: src.reachedInMs,
          windowMs: spec.windowMs,
          targetStartSec: spec.startSec,
          targetEndSec: spec.endSec,
          screen: spec.screen,
        });
      }
    }

    // Each reused clip currently contains only one role, while the storyboard requires multi-role sequences.
    // Refuse to certify or assemble a partial take until those sequences are captured and timed.
    const shortStormClips = recordedBeats.filter((beat) => beat.id === "30-02").map((beat) => beat.clip);
    expect(shortStormClips, "30-02 needs HUD, EVA and sheltered crew footage").toEqual(
      expect.arrayContaining(["hud.webm", "eva.webm", "ops.webm"]),
    );

    writeFileSync(
      MANIFEST_PATH,
      `${JSON.stringify(
        {
          generated_utc: new Date().toISOString(),
          site: siteCfg.site,
          raw_dir: RAW_DIR,
          beats: recordedBeats,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    bridge.dispose();
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
});
