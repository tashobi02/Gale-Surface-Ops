/** Package 29: UI-only commands, read-only wire/log evidence, and isolated sessions. */
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command, CommandResult, LogEvent, ServerMessage, Snapshot } from "@marswalk/protocol";
import { e2eSite } from "./siteBundle";
import { prepareFakeScenario, removeFakeScenario } from "./fakeScenario";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

/**
 * Runs `fn` against a Hab Core of its own, on the F4 `mock_site` with the harness's fake scenario, on `port`.
 *
 * Some checks measure a property of the *wire* (a latency budget, a round trip) and not of the terrain: they need a
 * fixture whose crew stays in contact at its first stop. On the real `gale_boxwork` terrain the crew walks into the hab's
 * comm shadow, so the tablet's own task list is a figure rather than a control (FD-032) and the check has nothing to press.
 * The `release-matrix` check pins the same fixture for the same reason.
 *
 * The Hab Core is a separate process on its own port, with its own session folder; the harness's own Hab Core is untouched.
 * Nothing here reaches beyond localhost.
 */
export async function withMockHab<T>(port: number, fn: (origin: string) => Promise<T>): Promise<T> {
  const scenario = prepareFakeScenario(REPO_ROOT, "mock_site");
  const varDir = mkdtempSync(join(tmpdir(), "mock-hab-e2e-"));
  const child = spawn(
    "npm",
    ["run", "-s", "hab:start", "--", "--site", "mock_site", "--scenario", scenario, "--port", String(port), "--var-dir", varDir],
    { cwd: REPO_ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
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
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`the mock Hab Core exited with ${child.exitCode}:\n${output}`);
      const up = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2_000) }).then((r) => r.ok, () => false);
      if (up) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    stop();
    rmSync(varDir, { recursive: true, force: true });
    removeFakeScenario(REPO_ROOT);
  }
}

export function watchLive(page: Page) {
  const commands: Command[] = [];
  const messages: ServerMessage[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      const message = JSON.parse(String(payload)) as { type: string; command?: Pick<Command, "kind" | "args"> } & Omit<Command, "kind" | "args">;
      if (message.type === "COMMAND" && message.command) commands.push({ ...message, ...message.command });
    });
    socket.on("framereceived", ({ payload }) => messages.push(JSON.parse(String(payload)) as ServerMessage));
  });
  return {
    commands, messages,
    events: (): LogEvent[] => messages.flatMap((m) => m.type === "EVENT" ? [m.event] : []),
    async command(kind: Command["kind"], action: () => Promise<unknown>): Promise<CommandResult> {
      const before = commands.length;
      await action();
      await expect.poll(() => commands.slice(before).filter((c) => c.kind === kind).length, { message: `${kind} sent exactly once` }).toBe(1);
      const sent = commands.slice(before).find((c) => c.kind === kind)!;
      const result = (): CommandResult | undefined => messages.find((m): m is CommandResult => m.type === "COMMAND_RESULT" && m.command_id === sent.command_id);
      await expect.poll(() => result(), { message: `${kind} result`, timeout: 180_000 }).toBeTruthy();
      expect(result(), `${kind}: ${JSON.stringify(result())}`).toMatchObject({ ok: true });
      return result()!;
    },
  };
}
export type LiveWire = ReturnType<typeof watchLive>;

/** A test boundary, not a step in the SCR-11-only mission. Never send RESET_SESSION behind a UI control. */
export async function resetThroughPresenter(context: BrowserContext, site = e2eSite()): Promise<void> {
  const presenter = await context.newPage();
  try {
    const wire = watchLive(presenter);
    await presenter.goto(`/?site=${site}#/presenter`);
    await expect.poll(() => wire.messages.some((m) => m.type === "SNAPSHOT")).toBe(true);
    await presenter.getByRole("button", { name: "Reset session", exact: true }).click();
    await wire.command("RESET_SESSION", () => presenter.getByRole("button", { name: "Confirm reset session", exact: true }).click());
    await expect(presenter.locator(".presenter-session dd").filter({ hasText: /^LOADED$/ })).toBeVisible();
  } finally { await presenter.close(); }
}

/** Start the storm through the presenter; never use this in SCR-11-only acceptance (N-200, BD-165). */
export async function startStormThroughPresenter(context: BrowserContext): Promise<void> {
  const presenter = await context.newPage();
  try {
    const wire = watchLive(presenter);
    await presenter.goto(`/?site=${e2eSite()}#/presenter`);
    await expect(presenter.getByRole("button", { name: "Start storm", exact: true })).toBeEnabled();
    await wire.command("START_EVENT", () => presenter.getByRole("button", { name: "Start storm", exact: true }).click());
  } finally { await presenter.close(); }
}

export async function openFreshOps(context: BrowserContext, site = e2eSite()) {
  await resetThroughPresenter(context, site);
  const ops = await context.newPage();
  await ops.setViewportSize({ width: 1440, height: 900 });
  const wire = watchLive(ops);
  await ops.goto(`/?site=${site}#/ops`);
  await expect(ops.getByRole("button", { name: "Start EVA mission", exact: true })).toBeVisible();
  return { ops, wire };
}

export async function startPaused(ops: Page, wire: LiveWire): Promise<void> {
  await wire.command("LOAD_SCENARIO", () => ops.getByRole("button", { name: "Load scenario", exact: true }).click());
  await wire.command("START_EVA", () => ops.getByRole("button", { name: "Start EVA mission", exact: true }).click());
  const pause = ops.getByRole("button", { name: "Pause mission clock", exact: true });
  if (await pause.count()) await wire.command("SET_CLOCK", () => pause.click());
  await expect(ops.getByRole("button", { name: "Resume mission clock", exact: true })).toBeVisible();
  await wire.command("SET_CLOCK", () => ops.getByRole("button", { name: "Set speed to 60x", exact: true }).click());
  await expect(ops.getByRole("button", { name: "Set speed to 60x", exact: true })).toHaveAttribute("aria-pressed", "true");
}

export async function jumpUntil(ops: Page, wire: LiveWire, reached: () => boolean, label: string): Promise<void> {
  const resume = ops.getByRole("button", { name: "Resume mission clock", exact: true });
  if (await resume.count()) await wire.command("SET_CLOCK", () => resume.click());
  // Bound an erroneous run; no time or physics is inferred in the test. The Hab Core owns each jump.
  for (let jumps = 0; !reached() && jumps < 256; jumps++) {
    await wire.command("JUMP_NEXT_EVENT", () => ops.getByRole("button", { name: "Jump to next scheduled event", exact: true }).click());
  }
  expect(reached(), label).toBe(true);
  if (!wire.events().some((e) => e.kind === "EVA_ENDED")) {
    await wire.command("SET_CLOCK", () => ops.getByRole("button", { name: "Pause mission clock", exact: true }).click());
    await expect(ops.getByRole("button", { name: "Resume mission clock", exact: true })).toBeVisible();
  }
}

export async function hold(page: Page, button: Locator): Promise<void> {
  await button.focus();
  await page.keyboard.down("Space");
  try { await page.waitForTimeout(850); } finally { await page.keyboard.up("Space"); }
}

export async function sessionSnapshot(page: Page): Promise<Snapshot> {
  const response = await page.request.get("/api/session");
  expect(response.ok()).toBe(true);
  return await response.json() as Snapshot;
}

export async function sessionLog(page: Page): Promise<LogEvent[]> {
  const response = await page.request.get("/api/log");
  expect(response.ok()).toBe(true);
  return (await response.text()).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as LogEvent);
}
