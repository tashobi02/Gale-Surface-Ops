/** Package 29: UI-only commands, read-only wire/log evidence, and isolated sessions. */
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { Command, CommandResult, LogEvent, ServerMessage, Snapshot } from "@marswalk/protocol";
import { e2eSite } from "./siteBundle";

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
      await expect.poll(() => result(), { message: `${kind} result` }).toBeTruthy();
      expect(result(), `${kind}: ${JSON.stringify(result())}`).toMatchObject({ ok: true });
      return result()!;
    },
  };
}
export type LiveWire = ReturnType<typeof watchLive>;

/** A test boundary, not a step in the SCR-11-only mission. Never send RESET_SESSION behind a UI control. */
export async function resetThroughPresenter(context: BrowserContext): Promise<void> {
  const presenter = await context.newPage();
  try {
    const wire = watchLive(presenter);
    await presenter.goto(`/?site=${e2eSite()}#/presenter`);
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

export async function openFreshOps(context: BrowserContext) {
  await resetThroughPresenter(context);
  const ops = await context.newPage();
  await ops.setViewportSize({ width: 1440, height: 900 });
  const wire = watchLive(ops);
  await ops.goto(`/?site=${e2eSite()}#/ops`);
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
