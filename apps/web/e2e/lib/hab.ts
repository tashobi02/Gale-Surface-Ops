/// <reference types="node" />
/**
 * Hab Core helpers for the harness (frontend plan 01, FD-198).
 *
 * Everything a check does to the running system goes through a page, never a direct socket: the point of T25.08 is "no
 * terminal", so `sendAsOps` clicks buttons on the ops console and nothing else. `habHealth` is a read-only HTTP probe.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT_DIR } from "./a11y";

/**
 * Port of the harness's Hab Core (FD-198); keeps `make hab` on 8080 free. `E2E_PORT` lets parallel worktrees each run their own
 * harness without sharing the port (default 8091).
 */
export const HAB_PORT = Number(process.env.E2E_PORT ?? 8091);
export const HAB_ORIGIN = `http://127.0.0.1:${HAB_PORT}`;

/** Roles a harness page can open (protocol `Role` values a device can take, 02 §E.4). */
export type HarnessRole = "planner" | "ops" | "eva:EV1" | "eva:EV2" | "hud:EV1" | "hud:EV2" | "earth";

const ROLE_HASH: Record<HarnessRole, string> = {
  planner: "#/planner",
  ops: "#/ops",
  "eva:EV1": "#/eva/EV1",
  "eva:EV2": "#/eva/EV2",
  "hud:EV1": "#/hud/EV1",
  "hud:EV2": "#/hud/EV2",
  earth: "#/earth",
};

export const roleHash = (role: HarnessRole): string => ROLE_HASH[role];

/** Open one more page of `context` on the route of `role`. A tab keeps one connection (boot/session.ts), so one page per role. */
export async function openRole(context: BrowserContext, role: HarnessRole): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/${ROLE_HASH[role]}`);
  return page;
}

/**
 * Resolves once the page shows a value that came from a Hab Core snapshot. A snapshot-fed value carries `data-provenance`
 * (FR-15), and the live routes render none before the first snapshot.
 * TODO(verify): packages 17 and 19 may add a dedicated ready hook; use it here when they do.
 */
export async function waitForSnapshot(page: Page, timeoutMs = 10_000): Promise<void> {
  await page.waitForSelector("[data-provenance]", { state: "attached", timeout: timeoutMs });
}

/** A control on the ops console, by its accessible name (03 SCR-11): "START EVA", "60×", and so on. */
export type OpsControl = string | RegExp;

/** Press one ops-console control. No direct socket, no REST call: this is the "ops UI only" rule of T25.08. */
export async function sendAsOps(opsPage: Page, control: OpsControl): Promise<void> {
  await opsPage.getByRole("button", { name: control }).first().click();
}

export interface HabHealth {
  status: string;
  data_version: string | null;
  session_id: string | null;
  sim_time: string | null;
  uptime_s: number;
}

/** `GET /api/health` (02 §E.6). Throws when the Hab Core is not answering. */
export async function habHealth(origin = HAB_ORIGIN): Promise<HabHealth> {
  const res = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2_000) });
  if (!res.ok) throw new Error(`GET /api/health answered ${res.status}`);
  return (await res.json()) as HabHealth;
}

/** `out/hab.pid` holds the process-group id of the Hab Core child; `out/hab-command.json` how globalSetup started it. */
const PID_FILE = join(OUT_DIR, "hab.pid");
const COMMAND_FILE = join(OUT_DIR, "hab-command.json");

export interface HabCommand {
  cwd: string;
  args: string[];
}

export const recordHabCommand = (command: HabCommand): void => writeFileSync(COMMAND_FILE, `${JSON.stringify(command)}\n`);

/** Stop the harness's Hab Core (its whole process group), as the link-lost check needs. */
export function killHab(): void {
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  process.kill(-pid, "SIGTERM");
}

/** Start the Hab Core again on the same port, resuming the latest session (NFR-10); resolves once `/api/health` answers. */
export async function restartHab(timeoutMs = 30_000): Promise<void> {
  const command = JSON.parse(readFileSync(COMMAND_FILE, "utf8")) as HabCommand;
  const child = spawn("npm", [...command.args, "--resume", "latest"], { cwd: command.cwd, detached: true, stdio: "ignore" });
  child.unref();
  writeFileSync(PID_FILE, `${child.pid}\n`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await habHealth();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`Hab Core did not answer again within ${timeoutMs / 1000} s`);
}
