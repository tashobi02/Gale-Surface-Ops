/// <reference types="node" />
/**
 * Harness setup and teardown (frontend plan 01, FD-198).
 *
 *  1. Build the web app (`E2E_SKIP_BUILD=1` reuses `apps/web/dist`).
 *  2. Start the Hab Core on 127.0.0.1:8091 as a child process, with the F4 `mock_site` and the fake scenario (or the real
 *     site and `storm-sol4190` with `E2E_SITE=gale_boxwork`).
 *  3. Wait for `GET /api/health` to answer 200.
 *  Teardown stops the Hab Core's whole process group, removes the session folder it created and the copied scenario.
 *
 * N-01 (`--scenario-dir`) is not merged, so the fake scenario is copied under `scenarios/e2e-fake/` for the run (lib/fakeScenario.ts).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT_DIR } from "./lib/a11y";
import { prepareFakeScenario, removeFakeScenario } from "./lib/fakeScenario";
import { HAB_ORIGIN, HAB_PORT, habHealth, recordHabCommand } from "./lib/hab";
import { REAL_SCENARIO, REAL_SITE, e2eSite } from "./lib/siteBundle";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const HEALTH_TIMEOUT_MS = 30_000;

async function answeringHealth(): Promise<boolean> {
  try {
    await habHealth();
    return true;
  } catch {
    return false;
  }
}

async function waitForHealth(child: ChildProcess, log: () => string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Hab Core exited with code ${child.exitCode} before it answered:\n${log()}`);
    if (await answeringHealth()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Hab Core did not answer GET ${HAB_ORIGIN}/api/health within ${HEALTH_TIMEOUT_MS / 1000} s:\n${log()}`);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (await answeringHealth()) {
    throw new Error(`Port ${HAB_PORT} already answers /api/health; stop that process first (the harness owns this port, FD-198).`);
  }

  if (process.env.E2E_SKIP_BUILD !== "1") {
    const build = spawnSync("npm", ["--workspace", "@marswalk/web", "run", "build"], { cwd: repoRoot, encoding: "utf8" });
    if (build.status !== 0) throw new Error(`web build failed:\n${build.stdout}\n${build.stderr}`);
  } else if (!existsSync(join(repoRoot, "apps/web/dist/index.html"))) {
    throw new Error("E2E_SKIP_BUILD=1 but apps/web/dist/index.html does not exist; build first");
  }

  const site = e2eSite();
  const scenario = site === REAL_SITE ? REAL_SCENARIO : prepareFakeScenario(repoRoot, site);

  mkdirSync(OUT_DIR, { recursive: true });
  let output = "";
  // `detached` gives the child its own process group, so teardown also stops the tsx process `npm run` starts.
  const args = ["run", "-s", "hab:start", "--", "--site", site, "--scenario", scenario, "--port", String(HAB_PORT)];
  recordHabCommand({ cwd: repoRoot, args });
  const child = spawn("npm", args, {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d: Buffer) => (output += d.toString()));
  child.stderr?.on("data", (d: Buffer) => (output += d.toString()));
  if (child.pid !== undefined) writeFileSync(join(OUT_DIR, "hab.pid"), `${child.pid}\n`);

  // `out/hab.pid` follows the Hab Core through a restart (link-lost check), so teardown stops the current one.
  const stop = (): void => {
    const pid = existsSync(join(OUT_DIR, "hab.pid")) ? Number(readFileSync(join(OUT_DIR, "hab.pid"), "utf8").trim()) : child.pid;
    if (pid !== undefined && Number.isFinite(pid)) {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
  };

  try {
    await waitForHealth(child, () => output);
  } catch (err) {
    stop();
    if (site !== REAL_SITE) removeFakeScenario(repoRoot);
    throw err;
  }
  const sessionId = /session (s-\d+)/.exec(output)?.[1];

  return async () => {
    stop();
    rmSync(join(OUT_DIR, "hab.pid"), { force: true });
    rmSync(join(OUT_DIR, "hab-command.json"), { force: true });
    if (site !== REAL_SITE) removeFakeScenario(repoRoot);
    // The session folder this run created holds only its own event log; leave other sessions alone.
    if (sessionId) rmSync(join(repoRoot, "apps/hab-core/var/sessions", sessionId), { recursive: true, force: true });
  };
}
