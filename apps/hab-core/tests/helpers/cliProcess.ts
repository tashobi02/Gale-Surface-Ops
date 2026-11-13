/**
 * Starting the Hab Core CLI from a test (test hygiene, backend package 30). `node_modules/.bin/tsx` is a wrapper that starts a
 * second node process for the script, so SIGKILL on the child it was given orphaned the real server, which then kept
 * listening after the run. The CLI is therefore started as `node --import tsx <script> ...`: the process the test holds is the
 * server itself, a kill ends it, and the open-handle guard (`noOpenHandles.ts`) sees it as a `ProcessWrap`.
 */
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** The repository root (tsx is resolved from its node_modules). */
export const REPO_ROOT = join(here, "../../../..");
export const CLI_SCRIPT = join(REPO_ROOT, "apps/hab-core/src/cli.ts");

/** Arguments of `process.execPath` that run `script` (the CLI by default) with `args`. */
export function cliExecArgs(args: readonly string[], script: string = CLI_SCRIPT): string[] {
  return ["--import", "tsx", script, ...args];
}

/** Runs the CLI as one process. Pipes stdout and stderr unless `options.stdio` says otherwise. */
export function spawnCli(args: readonly string[], options: SpawnOptions = {}): ChildProcess {
  return spawn(process.execPath, cliExecArgs(args), { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"], ...options });
}

/** Signals the child and resolves once it has exited (at once when it already has). */
export function stopCli(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill(signal);
  });
}
