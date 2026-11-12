/**
 * T14.04 — SCR-00 Boot error (docs/specs/03 SCR-00, §D "Boot asset failure"; 04 §A.3, §C.1, §E; FR-16, NFR-10; FD-086, FD-207).
 * Plain-language cause, the missing file, Retry, run instructions; OPS mode whatever route failed; status as icon, shape
 * and word; nothing remote.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { BootProblem } from "../../src/ui/context";
import { BootErrorScreen, plainCause } from "../../src/ui/screens/scr00BootError";
import { click, installDom, mount, must, removeDom } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
beforeEach(() => document.documentElement.setAttribute("data-mode", "brief"));
afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-mode");
});

const MANIFEST: BootProblem = {
  code: "MANIFEST_NOT_FOUND",
  message: "Failed to fetch site manifest: sites/gale_boxwork/site-manifest.json (404 Not Found)",
  missingFile: "sites/gale_boxwork/site-manifest.json",
};
const ui = (problem: BootProblem, onRetry: () => void = () => {}) => createElement(BootErrorScreen, { problem, onRetry });

describe("SCR-00 content (03 SCR-00)", () => {
  it("names the missing file", async () => {
    const view = await mount(ui(MANIFEST));
    expect(must(view.container, '[data-slot="missing-file"]').textContent).toBe("sites/gale_boxwork/site-manifest.json");
    expect(view.container.textContent).toContain("sites/gale_boxwork/site-manifest.json");
    await view.unmount();
  });

  it("says in plain language what happened, before the technical code", async () => {
    const view = await mount(ui(MANIFEST));
    const cause = must(view.container, '[data-slot="cause"]').textContent ?? "";
    expect(cause).toMatch(/site manifest/i);
    expect(cause).not.toContain("MANIFEST_NOT_FOUND");
    expect(must(view.container, '[data-slot="code"]').textContent).toBe("MANIFEST_NOT_FOUND");
    expect(must(view.container, "h1").textContent).toBe("A required file is missing");
    await view.unmount();
  });

  it("gives a plain cause for each entry of 03 SCR-00 (manifest, grid, no Web Worker) and falls back to the message", () => {
    expect(plainCause({ code: "MANIFEST_NOT_FOUND", message: "m" }).heading).toBe("A required file is missing");
    expect(plainCause({ code: "MANIFEST_INVALID", message: "m" }).heading).toBe("A required file is not valid");
    expect(plainCause({ code: "POI_ASSET_NOT_FOUND", message: "m" }).heading).toBe("A required file is missing");
    expect(plainCause({ code: "NO_WORKER", message: "m" }).cause).toMatch(/Web Worker/);
    expect(plainCause({ code: "GRID_NOT_LOADED", message: "m" }).cause).toMatch(/routing grid/i);
    expect(plainCause({ code: "WORKER_FAILED", message: "m" }).heading).toBe("The route calculation could not start");
    expect(plainCause({ code: "SOMETHING_NEW", message: "The thing broke" })).toEqual({ heading: "The app cannot start", cause: "The thing broke" });
  });

  it("shows the dash, not a guess, when no file is named", async () => {
    const view = await mount(ui({ code: "NO_WORKER", message: "This browser has no Web Worker support" }));
    const file = must(view.container, '[data-slot="missing-file"]');
    expect(file.textContent).toBe("—");
    expect(file.getAttribute("data-unavailable")).toBe("true");
    await view.unmount();
  });

  it("shows the failure as icon, shape and word, never colour alone (04 §A.3)", async () => {
    const view = await mount(ui(MANIFEST));
    const status = must(view.container, ".status-indicator");
    expect(status.getAttribute("data-status")).toBe("warning");
    expect(status.textContent).toContain("CANNOT START");
    expect(status.querySelector("svg")).not.toBeNull(); // the drawn octagon
    await view.unmount();
  });

  it("offers the run instructions on the screen, as local text and not a remote link (NFR-01)", async () => {
    const view = await mount(ui(MANIFEST));
    const instructions = must(view.container, '[data-slot="run-instructions"]');
    expect(instructions.textContent).toContain("make demo");
    expect(view.container.querySelector("a[href^='http']")).toBeNull();
    expect(view.container.querySelector("[src^='http'], link[href^='http']")).toBeNull();
    await view.unmount();
  });

  it("renders nothing from the problem as markup (a hostile file name stays text)", async () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const view = await mount(ui({ code: "MANIFEST_NOT_FOUND", message: hostile, missingFile: hostile }));
    expect(view.container.querySelector("img")).toBeNull();
    expect(must(view.container, '[data-slot="missing-file"]').textContent).toBe(hostile);
    await view.unmount();
  });
});

describe("SCR-00 actions", () => {
  it("retry re-runs boot", async () => {
    const onRetry = vi.fn();
    const view = await mount(ui(MANIFEST, onRetry));
    const retry = must<HTMLButtonElement>(view.container, '[data-slot="boot-retry"]');
    expect(retry.type).toBe("button");
    expect(retry.textContent).toContain("Retry");
    await click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("Retry is reachable by keyboard and the heading takes focus on render (04 §E)", async () => {
    const view = await mount(ui(MANIFEST));
    expect(document.activeElement).toBe(must(view.container, "h1"));
    const retry = must<HTMLButtonElement>(view.container, '[data-slot="boot-retry"]');
    expect(retry.tabIndex).toBeGreaterThanOrEqual(0);
    retry.focus();
    expect(document.activeElement).toBe(retry);
    await view.unmount();
  });

  it("keeps the 44 px touch target on Retry (04 §E)", async () => {
    const view = await mount(ui(MANIFEST));
    expect(must<HTMLButtonElement>(view.container, '[data-slot="boot-retry"]').className).toContain("scr00-button");
    await view.unmount();
  });
});

describe("SCR-00 mode (FD-207)", () => {
  it("renders in OPS mode whichever route failed, and gives the page its mode back on unmount", async () => {
    document.documentElement.setAttribute("data-mode", "brief"); // e.g. #/sources failed to boot
    const view = await mount(ui(MANIFEST));
    expect(must(view.container, '[data-screen="SCR-00"]').getAttribute("data-mode")).toBe("ops");
    expect(document.documentElement.getAttribute("data-mode")).toBe("ops");
    await view.unmount();
    expect(document.documentElement.getAttribute("data-mode")).toBe("brief");
  });

  it("uses no brand orange: the screen has no signal colour class", async () => {
    const view = await mount(ui(MANIFEST));
    expect(view.container.querySelector(".sig, [class*='signal']")).toBeNull();
    await view.unmount();
  });
});
