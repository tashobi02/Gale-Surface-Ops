/**
 * Single-laptop mode (T20.09; BD-02, BD-133; docs/specs/02 §A.5; 06 §D.5; NFR-01). The virtual event runs on one laptop:
 * the Hab Core on this machine and every role view as a browser window. This module knows the four windows of the demo
 * and how to open them; `cli.ts local` starts the Hab Core and calls it. No network beyond `localhost`: every URL is
 * `http://localhost:<port>/#/<route>`, and `openCommand` refuses anything else.
 *
 * The routes are the web app's own hashes (`apps/web/src/ui/router.ts`): `#/ops`, `#/presenter`, `#/eva/EV1`, `#/hud/EV1`.
 * Wall-clock time is not used here; the opener is injected so the tests run nothing.
 */
import type { Role } from "@marswalk/protocol";

export interface LocalWindow {
  label: string;
  role: Role;
  url: string;
}

export interface OpenCommand {
  command: string;
  args: string[];
}

export interface FailedOpen {
  label: string;
  url: string;
  reason: string;
}

export interface LocalArgs {
  port: number;
  open: boolean;
}

const DEFAULT_PORT = 8080;

/** The windows, in the order the demo script uses them (docs/ops/demo-kit.md). */
const WINDOWS: readonly { label: string; role: Role; route: string }[] = [
  { label: "Ops console", role: "ops", route: "ops" },
  { label: "Presenter", role: "presenter", route: "presenter" },
  { label: "EVA tablet EV1", role: "eva:EV1", route: "eva/EV1" },
  { label: "HUD EV1", role: "hud:EV1", route: "hud/EV1" },
];

function checkPort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError(`port must be an integer from 1 to 65535, got ${port}`);
  return port;
}

export function localUrls(port: number): LocalWindow[] {
  checkPort(port);
  return WINDOWS.map(({ label, role, route }) => ({ label, role, url: `http://localhost:${port}/#/${route}` }));
}

/** The command that opens `url` in the default browser on `platform` (a `process.platform` value). Builds it; runs nothing. */
export function openCommand(platform: string, url: string): OpenCommand {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RangeError(`only http://localhost URLs are opened, got ${JSON.stringify(url)}`);
  }
  if (parsed.protocol !== "http:" || parsed.hostname !== "localhost") throw new RangeError(`only http://localhost URLs are opened, got ${JSON.stringify(url)}`);
  if (platform === "darwin") return { command: "open", args: [url] };
  // `start` takes the first quoted argument as a window title, so an empty title keeps the URL (with its # and &) one argument.
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] };
  return { command: "xdg-open", args: [url] };
}

/** Opens each window in order through `run`; a failure is collected and the rest still open. */
export async function openWindows(
  windows: readonly LocalWindow[],
  platform: string,
  run: (command: OpenCommand) => Promise<unknown>,
): Promise<FailedOpen[]> {
  const failed: FailedOpen[] = [];
  for (const w of windows) {
    try {
      await run(openCommand(platform, w.url));
    } catch (err) {
      failed.push({ label: w.label, url: w.url, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return failed;
}

export function printWindows(windows: readonly LocalWindow[], print: (line: string) => void): void {
  for (const w of windows) print(`${w.label.padEnd(16)} ${w.role.padEnd(10)} ${w.url}`);
}

/** `--port <n>` and `--open` of `hab:local`; the other options are the `start` options and are read by the CLI. */
export function parseLocalArgs(argv: readonly string[]): LocalArgs {
  const i = argv.indexOf("--port");
  const port = i < 0 ? DEFAULT_PORT : checkPort(Number(argv[i + 1]));
  return { port, open: argv.includes("--open") };
}
