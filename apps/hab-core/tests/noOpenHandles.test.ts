/**
 * Test hygiene: a test that starts a server or a child process must close it. The guard (`tests/helpers/noOpenHandles.ts`,
 * loaded for every test file by `vitest.config.ts`) fails the file whose last test leaves a listening socket or a child
 * process running. These tests pin what the guard can see; the guard itself runs in every other file.
 */
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { leakedHandles, parseCliProcesses, settleHandles, strayCliProcesses } from "./helpers/noOpenHandles";

describe("the open-handle guard", () => {
  it("sees no leak in a clean process", async () => {
    expect(await settleHandles()).toEqual([]);
  });

  it("names a listening server until it is closed", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    expect(leakedHandles()).toContain("TCPServerWrap");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await settleHandles()).toEqual([]);
  });

  it("names a running child process until it is killed", async () => {
    const child = execFile(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    expect(leakedHandles()).toContain("ProcessWrap");
    child.kill();
    await exited;
    expect(await settleHandles()).toEqual([]);
  });

  it("does not count a handle that closes inside the settle window", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    setTimeout(() => server.close(), 20);
    expect(await settleHandles()).toEqual([]);
  });
});

describe("the run-level guard for orphaned Hab Core processes", () => {
  const PS = [
    "  101     1 /usr/bin/node --import tsx /repo/apps/hab-core/src/cli.ts start --port 0",
    "  102   101 /usr/bin/node --import tsx /repo/apps/hab-core/src/cli.ts start --port 0",
    "  103     1 /usr/bin/node /repo/node_modules/vitest/vitest.mjs run",
    "  104     1 /usr/bin/node /repo/apps/hab-core/src/cliHelper.ts",
  ].join("\n");

  it("lists the processes that run the CLI script, with their parent", () => {
    expect(parseCliProcesses(PS)).toEqual([
      { pid: 101, ppid: 1 },
      { pid: 102, ppid: 101 },
    ]);
  });

  it("scopes the process list to this checkout so sibling worktree CLIs are never killed", () => {
    const output = PS + "\n  105 1 /usr/bin/node --import tsx /repo/var/worktrees/b4/apps/hab-core/src/cli.ts start";
    expect(parseCliProcesses(output, "/repo/apps/hab-core/src/cli.ts")).toEqual([{ pid: 101, ppid: 1 }, { pid: 102, ppid: 101 }]);
    expect(parseCliProcesses(output, "/repo/var/worktrees/b4/apps/hab-core/src/cli.ts")).toEqual([{ pid: 105, ppid: 1 }]);
  });

  it("names only the ones that did not exist before the run", () => {
    expect(strayCliProcesses(parseCliProcesses(PS), new Set([101]))).toEqual([{ pid: 102, ppid: 101 }]);
    expect(strayCliProcesses(parseCliProcesses(PS), new Set([101, 102]))).toEqual([]);
  });
});
