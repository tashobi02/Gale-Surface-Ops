/** Package 35: explicit PRINT-based light OPS theme (T13.08, FD-002/FD-061). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installDom, removeDom } from "./domHarness";
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
