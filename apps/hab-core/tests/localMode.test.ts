/**
 * T20.09 (backend package 21): single-laptop mode, the primary topology of the virtual event (BD-02; docs/specs/02 §A.5;
 * 06 §D.5; NFR-01). `npm run hab:local` starts the Hab Core and lists, and with `--open` opens, the four windows of the
 * demo on this laptop: ops, presenter, EVA tablet of EV1 and HUD of EV1.
 *
 * Rules fixed here (decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; BD-02, BD-133):
 * - Every URL is `http://localhost:<port>/#/<route>`: no other host, so the windows need no network beyond this laptop.
 * - The routes are the web app's own hashes (`apps/web/src/ui/router.ts`): `#/ops`, `#/presenter`, `#/eva/EV1`, `#/hud/EV1`.
 * - `--open` builds the platform's opener command (macOS `open`, Windows `cmd /c start`, others `xdg-open`) with the URL as
 *   one argument; nothing is run by the builder, and an opener that fails is reported, never fatal.
 */
import { describe, expect, it, vi } from "vitest";
import { localUrls, openCommand, openWindows, parseLocalArgs, printWindows } from "../src/localMode";

describe("localUrls (BD-02: one laptop)", () => {
  it("lists ops, presenter, EVA EV1 and HUD EV1, in that order, on localhost and the port asked for", () => {
    expect(localUrls(8080)).toEqual([
      { label: "Ops console", role: "ops", url: "http://localhost:8080/#/ops" },
      { label: "Presenter", role: "presenter", url: "http://localhost:8080/#/presenter" },
      { label: "EVA tablet EV1", role: "eva:EV1", url: "http://localhost:8080/#/eva/EV1" },
      { label: "HUD EV1", role: "hud:EV1", url: "http://localhost:8080/#/hud/EV1" },
    ]);
  });

  it("uses the port it is given and no host but localhost", () => {
    for (const w of localUrls(9123)) {
      const u = new URL(w.url);
      expect(u.hostname).toBe("localhost");
      expect(u.port).toBe("9123");
      expect(u.protocol).toBe("http:");
    }
  });

  it("rejects a port that is not 1..65535", () => {
    for (const p of [0, -1, 65536, 1.5, Number.NaN]) expect(() => localUrls(p), String(p)).toThrow(RangeError);
  });
});

describe("openCommand (built, never run here)", () => {
  const url = "http://localhost:8080/#/ops";
  it("macOS: open <url>", () => expect(openCommand("darwin", url)).toEqual({ command: "open", args: [url] }));
  it("Windows: cmd /c start with an empty title, so a URL with & or # is one argument", () =>
    expect(openCommand("win32", url)).toEqual({ command: "cmd", args: ["/c", "start", "", url] }));
  it("Linux and anything else: xdg-open <url>", () => {
    expect(openCommand("linux", url)).toEqual({ command: "xdg-open", args: [url] });
    expect(openCommand("freebsd", url)).toEqual({ command: "xdg-open", args: [url] });
  });
  it("refuses a URL that is not on localhost over http (nothing else is ever opened)", () => {
    for (const bad of ["https://localhost:8080/", "http://example.com/", "file:///etc/passwd", "javascript:alert(1)", "http://localhost.evil.test/", "not a url", ""])
      expect(() => openCommand("darwin", bad), bad).toThrow(/localhost/);
  });
});

describe("openWindows and printWindows", () => {
  it("opens each window once, in order, through the runner it is given", async () => {
    const run = vi.fn(async () => undefined);
    await openWindows(localUrls(8080), "linux", run);
    expect(run.mock.calls).toEqual(localUrls(8080).map((w) => [{ command: "xdg-open", args: [w.url] }]));
  });

  it("a failing opener is reported and the rest are still opened", async () => {
    const run = vi.fn(async (c: { args: string[] }) => {
      if (c.args[0].endsWith("#/presenter")) throw new Error("no display");
    });
    const failed = await openWindows(localUrls(8080), "linux", run);
    expect(run).toHaveBeenCalledTimes(4);
    expect(failed).toEqual([{ label: "Presenter", url: "http://localhost:8080/#/presenter", reason: "no display" }]);
  });

  it("prints one line per window: label, role and URL", () => {
    const lines: string[] = [];
    printWindows(localUrls(8080), (l) => lines.push(l));
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("Ops console");
    expect(lines[0]).toContain("http://localhost:8080/#/ops");
    expect(lines[3]).toContain("hud:EV1");
  });
});

describe("parseLocalArgs", () => {
  it("defaults: port 8080, no --open", () => expect(parseLocalArgs([])).toEqual({ port: 8080, open: false }));
  it("--open and --port", () => expect(parseLocalArgs(["--open", "--port", "9000"])).toEqual({ port: 9000, open: true }));
  it("a bad port is the caller's error", () => {
    expect(() => parseLocalArgs(["--port", "x"])).toThrow(RangeError);
    expect(() => parseLocalArgs(["--port"])).toThrow(RangeError);
    expect(() => parseLocalArgs(["--port", "70000"])).toThrow(RangeError);
  });
});
