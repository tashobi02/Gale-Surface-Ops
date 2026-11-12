/// <reference types="node" />
/**
 * Verification harness configuration (frontend plan 01, FD-190, FD-197, FD-198).
 *
 * Chromium only, headless, against the Hab Core on 127.0.0.1:8091 serving the built app. Run it with `make e2e`.
 * Nothing here reaches beyond localhost; the browser is the one already installed (no download).
 */
import { chromium, defineConfig, devices, type Project } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { HAB_ORIGIN } from "./lib/hab";
import { bundleAbsentReason } from "./lib/siteBundle";

const here = import.meta.dirname;
const repoRoot = join(here, "..", "..", "..");

/**
 * Playwright 1.64 wants one specific Chromium revision. When that revision is not installed (this machine has older ones),
 * fall back to the newest installed headless shell instead of downloading. `E2E_CHROMIUM` overrides both.
 */
function chromiumExecutable(): string | undefined {
  if (process.env.E2E_CHROMIUM) return process.env.E2E_CHROMIUM;
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), "Library", "Caches", "ms-playwright"),
    join(homedir(), ".cache", "ms-playwright"),
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : undefined,
  ].filter((r): r is string => !!r && existsSync(r));
  if (existsSync(chromium.executablePath())) return undefined; // Playwright's own pick is installed: use it
  for (const root of roots) {
    const shells = readdirSync(root)
      .filter((d) => d.startsWith("chromium_headless_shell-"))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const shell of shells) {
      const dir = join(root, shell);
      for (const sub of readdirSync(dir).filter((d) => d.startsWith("chrome-headless-shell-"))) {
        const exe = join(dir, sub, process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell");
        if (existsSync(exe)) return exe;
      }
    }
  }
  return undefined;
}

/** Device descriptors are for webkit/chromium alike; keep the touch, DPR and mobile flags, drop the browser choice. */
function chromiumDevice(name: string, viewport: { width: number; height: number }) {
  const { defaultBrowserType: _ignored, ...rest } = devices[name];
  return { ...rest, browserName: "chromium" as const, viewport };
}

const desktop = (width: number, height: number) => ({ ...devices["Desktop Chrome"], viewport: { width, height } });

/** Spec files by project (names without `.spec.ts`). A viewport-specific check runs on its own project; the rest on desktop-1440. */
const EVERY_PROJECT = ["offline", "axe"];
const ONLY_DESKTOP_1440 = [
  "_harness", "tiles-all-levels", "scale-bar", "keyboard-path", "grayscale", "contrast", "brand-orange", "toggles",
  "plan-rules", "results-states", "walking-skeleton", "poi-conditions", "print", "plan-hash", "provenance", "credits",
  "ops-no-terminal", "task-latency", "replay", "usability", "capture", "queued-resend", "link-lost", "targets",
];

const project = (name: string, use: Project["use"], files: string[]): Project => ({
  name,
  use,
  testMatch: files.map((f) => new RegExp(`checks/${f}\\.spec\\.ts$`)),
});

const absent = bundleAbsentReason(repoRoot);
if (absent) console.log(`skipped: ${absent}`);

export default defineConfig({
  testDir: join(here, "checks"),
  outputDir: join(here, "out", "test-results"),
  globalSetup: absent ? undefined : join(here, "globalSetup.ts"),
  // One Hab Core, one session: checks that change session state must not interleave.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: join(here, "out", "results.json") }]],
  use: {
    baseURL: HAB_ORIGIN,
    headless: true,
    launchOptions: { executablePath: chromiumExecutable() },
    trace: "off",
  },
  // Bundle absent: no Hab Core starts and only the self-tests run, so the run still exits 0 after printing "skipped: ...".
  projects: absent
    ? [project("bundle-absent", desktop(1440, 900), ["_harness"])]
    : [
        project("desktop-1440", desktop(1440, 900), [...EVERY_PROJECT, ...ONLY_DESKTOP_1440]),
        project("desktop-1280", desktop(1280, 800), EVERY_PROJECT),
        project("desktop-1024", desktop(1024, 768), EVERY_PROJECT),
        project("phone-landscape-844x390", chromiumDevice("iPhone 14 landscape", { width: 844, height: 390 }), [...EVERY_PROJECT, "fullmap", "targets"]),
        project("phone-portrait-390x844", chromiumDevice("iPhone 14", { width: 390, height: 844 }), EVERY_PROJECT),
        project("phone-360x740", chromiumDevice("Pixel 7", { width: 360, height: 740 }), [...EVERY_PROJECT, "viewport360"]),
        project("tablet-landscape-1024x768", chromiumDevice("iPad Mini landscape", { width: 1024, height: 768 }), [...EVERY_PROJECT, "eva-geometry", "rotation", "targets"]),
        project("tablet-portrait-768x1024", chromiumDevice("iPad Mini", { width: 768, height: 1024 }), EVERY_PROJECT),
        project("hud-844x390", chromiumDevice("iPhone 14 landscape", { width: 844, height: 390 }), [...EVERY_PROJECT, "hud-glance"]),
      ],
});
