/**
 * `globalSetup` of both vitest projects: fails the run when a Hab Core CLI process that the run started is still alive at the
 * end (a server orphaned by a SIGKILL, for example). It lists the CLI processes before the run and after it; processes that
 * existed before (a developer's own `make hab`) are left alone. A stray one is killed by its pid, then named in the error.
 */
import { execFileSync } from "node:child_process";
import { parseCliProcesses, strayCliProcesses } from "./noOpenHandles";

const list = () => parseCliProcesses(execFileSync("ps", ["-ax", "-o", "pid=,ppid=,command="], { encoding: "utf8", maxBuffer: 1 << 24 }));

export default function setup(): () => void {
  const before = new Set(list().map((p) => p.pid));
  return () => {
    const stray = strayCliProcesses(list(), before);
    for (const p of stray) {
      try {
        process.kill(p.pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
    if (stray.length > 0) throw new Error(`test hygiene: the run left Hab Core CLI process(es) running (pid ${stray.map((p) => p.pid).join(", ")}); they were killed. Start the CLI with tests/helpers/cliProcess.ts and stop it with stopCli.`);
  };
}
