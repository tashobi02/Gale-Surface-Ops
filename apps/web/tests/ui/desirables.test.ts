/** Package 35: explicit PRINT-based light OPS theme (T13.08, FD-002/FD-061). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installDom, removeDom, mount, click, keyDown } from "./domHarness";
import { applyTheme } from "../../src/ui/theme";
import { contrast } from "./wcag";

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src/ui/styles");
const readStyle = (f: string): string => readFileSync(join(STYLES_DIR, f), "utf8");

describe("T13.08: light theme only by param (FD-002, FD-061)", () => {
  beforeEach(() => {
    installDom();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    removeDom();
  });

  it("light theme only by param: sets data-theme='light' only when ?theme=light is supplied", () => {
    // 1. When URL search has theme=light, data-theme='light' is set
    applyTheme("?theme=light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    // 2. When URL search has no theme param or theme=dark, data-theme is removed (dark stays default)
    applyTheme("");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();

    applyTheme("?theme=dark");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();

    applyTheme("?site=mock_site");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();

    // 3. Hash query param fallback works
    applyTheme("", { theme: "light" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("light.css contains no prefers-color-scheme media query (dark stays default per FD-002)", () => {
    const raw = readStyle("light.css");
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(raw).not.toMatch(/TODO\((decision|verify)\)/);
  });

  it("light.css defines PRINT tokens and print neutrals with verified contrast and no brand orange (FD-061)", () => {
    const css = readStyle("light.css");
    // Overrides token names
    expect(css).toMatch(/--surface-0\s*:\s*#FFFFFF/i);
    expect(css).toMatch(/--fg-1\s*:\s*var\(--print-text\)/);
    expect(css).toMatch(/--accent\s*:\s*var\(--print-text\)/);
    // Verified print contrast values
    expect(contrast("#111827", "#FFFFFF")).toBeGreaterThanOrEqual(4.5); // print-text on surface-0
    expect(contrast("#4B5563", "#FFFFFF")).toBeGreaterThanOrEqual(4.5); // secondary text on surface-0
    expect(contrast("#0E7A4F", "#FFFFFF")).toBeGreaterThanOrEqual(4.5); // nominal on white
    expect(contrast("#9A5B00", "#FFFFFF")).toBeGreaterThanOrEqual(4.5); // caution on white
    expect(contrast("#B42318", "#FFFFFF")).toBeGreaterThanOrEqual(4.5); // warning on white
  });
});

describe("light theme review regressions", () => {
  beforeEach(installDom);
  afterEach(removeDom);

  function styles(mode: string): CSSStyleDeclaration {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.mode = mode;
    const sheet = document.createElement("style");
    sheet.textContent = ":root { --print-text: #111827; }" + readStyle("light.css");
    document.head.append(sheet);
    return getComputedStyle(document.documentElement);
  }

  it.each(["hud", "brief", "print"])("does not remap the %s palette", mode => {
    expect(styles(mode).getPropertyValue("--surface-0")).toBe("");
  });

  it("control boundaries use a PRINT colour with at least 3:1 on both light surfaces", () => {
    expect(styles("ops").getPropertyValue("--control-edge").trim()).toBe("#111827");
    for (const surface of ["#FFFFFF", "#F3F4F6"]) expect(contrast("#111827", surface)).toBeGreaterThanOrEqual(3);
  });

  it("keeps status patterns and uses legible ink on the PRINT status fills", () => {
    const css = readStyle("light.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/background-image\s*:\s*none/);
    for (const fill of ["#0E7A4F", "#9A5B00", "#B42318", "#1D4ED8", "#6D28D9"])
      expect(contrast("#FFFFFF", fill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("T13.07 coach marks dismiss and keyboard ownership", () => {
  beforeEach(installDom);
  afterEach(removeDom);

  async function coach() {
    const { CoachMarks } = await import("../../src/ui/coachMarks");
    const { createElement } = await import("react");
    const before = document.createElement("button");
    before.textContent = "Previous focus";
    document.body.append(before);
    before.focus();
    const onDismiss = vi.fn();
    const mounted = await mount(createElement(CoachMarks, { onDismiss }));
    return { ...mounted, before, onDismiss, CoachMarks, createElement };
  }

  it("coach marks dismiss: exactly three steps, focus returns and dismissal survives remount in memory", async () => {
    const c = await coach();
    const titles = ["Turn on Slope", "Click a POI → Add as stop", "Open Briefing"];
    for (const title of titles) {
      expect(c.container.querySelector("h3")?.textContent).toBe(title);
      expect(c.container.contains(document.activeElement)).toBe(true);
      await click(c.container.querySelector('[data-action="next"]')!);
    }
    expect(c.container.textContent).toBe("");
    expect(document.activeElement).toBe(c.before);
    expect(c.onDismiss).toHaveBeenCalledTimes(1);
    await c.unmount();
    const again = await mount(c.createElement(c.CoachMarks));
    expect(again.container.textContent).toBe("");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    await again.unmount();
  });

  it("Escape dismisses once and releases its handler so other controls keep Escape", async () => {
    const c = await coach();
    await keyDown(document.activeElement!, "Escape");
    expect(c.container.textContent).toBe("");
    expect(document.activeElement).toBe(c.before);
    await keyDown(c.before, "Escape");
    expect(c.onDismiss).toHaveBeenCalledTimes(1);
    await c.unmount();
  });

  it("coach mark counter carries provenance and text describes the real POI action", async () => {
    const c = await coach();
    const counter = c.container.querySelector(".coach-mark-step-counter")!;
    expect(counter.getAttribute("data-provenance")).toBe("derived");
    expect(counter.getAttribute("data-source")).toBeTruthy();
    await click(c.container.querySelector('[data-action="next"]')!);
    expect(c.container.textContent).not.toContain("press A");
    await click(c.container.querySelector('[data-action="dismiss"]')!);
    expect(c.container.textContent).toBe("");
    await c.unmount();
  });

  it("uses existing anchors, remains available on small screens and obeys pointer targets", async () => {
    const { COACH_MARK_STEPS } = await import("../../src/ui/coachMarks");
    expect(COACH_MARK_STEPS.map(step => step.anchorSelector)).toEqual([
      "#scr02-left-tab-layers", '[data-slot="map-host"]', '[data-slot="briefing"]',
    ]);
    const css = readFileSync(join(STYLES_DIR, "../screens/scr02MapWorkspace.css"), "utf8");
    const coachCss = css.slice(css.indexOf("/* First-run coach marks"));
    expect(coachCss).not.toMatch(/display:\s*none/);
    expect(coachCss).not.toMatch(/min-height:\s*auto/);
  });
});
