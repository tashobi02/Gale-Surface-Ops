/**
 * Open-handle guard for the Hab Core test suites. A server or a child process that a test starts and does not close keeps
 * running after the run (an earlier agent had to kill them by PID). `leakedHandles()` names the Node resources that matter:
 * a listening socket (`TCPServerWrap`, which `startServer` and `net.createServer` hold) and a running child process
 * (`ProcessWrap`, which `execFile` and `spawn` hold). Client sockets are left out on purpose: the HTTP agent of `fetch` keeps
 * idle ones for a short while, and they cannot outlive the process the way a server can.
 */
const WATCHED = new Set(["TCPServerWrap", "ProcessWrap"]);

/** The watched resources that are open right now, one entry per handle. */
export function leakedHandles(): string[] {
  return process.getActiveResourcesInfo().filter((name) => WATCHED.has(name));
}

/** Waits up to `windowMs` for the watched handles to close (a `close()` that resolved may still be draining) and returns what is left. */
export async function settleHandles(windowMs = 200, stepMs = 10): Promise<string[]> {
  const until = performance.now() + windowMs;
  let left = leakedHandles();
  while (left.length > 0 && performance.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, stepMs));
    left = leakedHandles();
  }
  return left;
}

/** A process running the Hab Core CLI script, from `ps -ax -o pid=,ppid=,command=`. */
export interface CliProcess {
  pid: number;
  ppid: number;
}

/** The lines of `ps` whose command runs `apps/hab-core/src/cli.ts` (exactly that script, not a file that starts with its name). */
export function parseCliProcesses(psOutput: string): CliProcess[] {
  const found: CliProcess[] = [];
  for (const line of psOutput.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m && /apps\/hab-core\/src\/cli\.ts(\s|$)/.test(m[3])) found.push({ pid: Number(m[1]), ppid: Number(m[2]) });
  }
  return found;
}

/** The CLI processes that are not in `before`: the ones this run started and left behind. */
export function strayCliProcesses(now: readonly CliProcess[], before: ReadonlySet<number>): CliProcess[] {
  return now.filter((p) => !before.has(p.pid));
}
