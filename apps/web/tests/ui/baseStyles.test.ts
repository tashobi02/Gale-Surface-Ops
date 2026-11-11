/**
 * T13.04 review follow-ups (PR #167): the shipped stylesheets keep the 04 §C.1 / §E / P8 / P10 promises.
 * The checks read the CSS source (jsdom cannot resolve var() or :focus-visible), so they guard the
 * declarations: one focus rule, a visible focus ring in every mode including HUD, a pressed state on
 * every control, and no HUD edge colour that 04 does not define.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrast } from "./wcag";

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src/ui/styles");
const read = (f: string): string => readFileSync(join(STYLES_DIR, f), "utf8");

interface Rule {
  file: string;
  selector: string;
  body: string;
}

/** Splits a stylesheet into flat `selector { body }` rules (at-rule wrappers are flattened; comments removed). */
function rules(file: string): Rule[] {
  const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import[^;]*;/g, "");
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const selector = m[1].trim().replace(/^@media[^,]*?\{/, "").trim();
    out.push({ file, selector, body: m[2] });
  }
  return out;
}

const STYLE_FILES = readdirSync(STYLES_DIR).filter((f) => f.endsWith(".css"));
const ALL_RULES = STYLE_FILES.flatMap(rules);

/** Declared value of a property in a rule body, or undefined. */
function decl(body: string, prop: string): string | undefined {
  const m = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, "i").exec(body);
  return m?.[1].trim();
}

/** The `[data-mode="x"]` token block (`:root, [data-mode="ops"]` is the OPS block). */
function modeBlock(mode: "ops" | "brief" | "hud" | "print"): Rule {
  const block = rules("tokens.css").find(
    (r) => r.selector.split(",").some((s) => s.trim() === `[data-mode="${mode}"]`) && decl(r.body, "--surface-0"),
  );
  if (!block) throw new Error(`no token block for ${mode}`);
  return block;
}

const PRIMITIVES = rules("tokens.css").find((r) => r.selector === ":root" && decl(r.body, "--void"))!;

/** Resolves `var(--x)` chains against the primitives and the given mode block. */
function resolve(value: string, mode: Rule): string {
  return value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    const next = decl(mode.body, name) ?? decl(PRIMITIVES.body, name);
    if (next === undefined) throw new Error(`unresolved ${name}`);
    return resolve(next, mode);
  });
}

describe("T13.04 focus ring: print has no ring of its own until 04 defines one", () => {
  it("print mode carries a TODO(decision) instead of an invented ring", () => {
    const print = modeBlock("print");
    expect(decl(print.body, "--focus-ring")).toBeUndefined();
    expect(read("tokens.css")).toMatch(/04 §C\.1 defines no PRINT focus ring/);
  });
});

describe("T13.04 focus ring: defined once, visible in every mode (04 §C.1 focus, §E, P10)", () => {
  it.each(["ops", "brief", "hud"] as const)("%s mode defines its own non-none --focus-ring", (mode) => {
    const ring = decl(modeBlock(mode).body, "--focus-ring");
    expect(ring).toBeDefined();
    expect(ring!.toLowerCase()).not.toBe("none");
    expect(resolve(ring!, modeBlock(mode))).toMatch(/\d+px/);
  });

  it("HUD defines its own ring from HUD tokens: 2 px black gap, 2 px white (hud-text) ring", () => {
    const hud = modeBlock("hud");
    const ring = decl(hud.body, "--focus-ring");
    expect(ring).toBeDefined();
    expect(resolve(ring!, hud).replace(/\s+/g, " ").toUpperCase()).toBe("0 0 0 2PX #000000, 0 0 0 4PX #FFFFFF");
  });

  it("OPS ring outer colour is the 04 focus colour #FFFFFF", () => {
    const ops = modeBlock("ops");
    expect(resolve(decl(ops.body, "--focus-ring")!, ops).toUpperCase()).toMatch(/0 0 0 4PX #FFFFFF$/);
  });

  it("exactly one :focus-visible rule exists across all stylesheets, and it applies --focus-ring", () => {
    const focusRules = ALL_RULES.filter((r) => /(^|,)\s*:focus-visible\s*(,|$)/.test(r.selector));
    expect(focusRules.map((r) => r.file)).toEqual(["base.css"]);
    expect(decl(focusRules[0].body, "box-shadow")).toBe("var(--focus-ring)");
  });

  it("no rule removes the outline outright; a transparent outline keeps focus visible in forced-colors", () => {
    for (const r of ALL_RULES) {
      const outline = decl(r.body, "outline");
      if (outline !== undefined) expect(outline, `${r.file} ${r.selector}`).not.toMatch(/^(none|0)\b/i);
    }
    const focusRule = ALL_RULES.find((r) => r.selector === ":focus-visible")!;
    expect(decl(focusRule.body, "outline")).toMatch(/transparent/);
  });

  it("no rule on controls resets box-shadow to none (it would erase the focus ring)", () => {
    for (const r of ALL_RULES) {
      if (/^\s*:focus-visible/.test(r.selector)) continue;
      if (decl(r.body, "box-shadow") === "none") {
        expect(r.selector, `${r.file} sets box-shadow: none on a control`).not.toMatch(/button|\.btn|input|select|textarea|^a\b/);
      }
    }
  });
});

describe("T13.04 pressed state on every control (04 P8, §D.1 'Pressed: inverted')", () => {
  it("button and .btn invert to foreground-on-surface while :active (never when disabled, 04 §D.1), using tokens only", () => {
    const pressed = ALL_RULES.find((r) => r.selector.replace(/\s+/g, "") === "button:not(:disabled):active,.btn:not(:disabled):not([aria-disabled=\"true\"]):active");
    expect(pressed, "button:active, .btn:active rule").toBeDefined();
    expect(decl(pressed!.body, "background")).toBe("var(--fg-1)");
    expect(decl(pressed!.body, "color")).toBe("var(--surface-0)");
  });
});

describe("T13.04 control edge: only 04-defined values (04 §C.1 edge, ≥ 3 : 1 non-text)", () => {
  it("HUD does not hard-code a control edge colour", () => {
    const edge = decl(modeBlock("hud").body, "--control-edge");
    expect(edge).toBeDefined();
    expect(edge).toMatch(/^var\(--edge\)$/);
    expect(read("tokens.css")).not.toMatch(/#333333/i);
  });
});

describe("T13.04 type and icon values follow 04 (spec-change #213, decided 2026-11-11)", () => {
  it("base.css headings keep Inter 600 under the 04 §C.2 v1 exception; self-hosting Chakra Petch stays a TODO(decision) for T13.04", () => {
    const base = read("base.css");
    expect(base).toMatch(/04 §C\.2[^*]*Headings during the font roll-out/);
    expect(base).toMatch(/v1 (screens|exception)/);
    expect(base).toMatch(/TODO\(decision\)[^*]*self-host[^*]*Chakra Petch[^*]*T13\.04/i);
    expect(base).not.toMatch(/TODO\(decision\)[^\n]*headings keep the v1 style/);
    expect(base).not.toMatch(/04 spec change needed/);
    expect(base).toMatch(/font-weight: 600/);
  });

  it("icons README follows 04 §C.4: Lucide defaults, ISC licence, no stroke override or TODO notes", () => {
    const readme = readFileSync(join(STYLES_DIR, "../../../public/icons/README.md"), "utf8");
    expect(readme).toMatch(/Licence\*\*: ISC/);
    expect(readme).toMatch(/04 §C\.4/);
    expect(readme).toMatch(/stroke-width="2"/);
    expect(readme).not.toMatch(/TODO/);
    expect(readme).not.toMatch(/1\.5 ?px|squared caps|stroke-linecap: square|stroke-linejoin: miter/);
    expect(readme).not.toMatch(/Note for 04 spec owner/);
  });
});

describe("T13.04 minimum text size for .code and .module-label (04 §C.2: 11 px microcopy only on BRIEF and planner desktop)", () => {
  const SELECTORS = [".code", ".module-label"] as const;

  /** font-size set for `selector` inside `scope` (a scope selector such as `[data-mode="brief"]`; "" = unscoped). */
  function sizeIn(scope: string, selector: string): string | undefined {
    for (const r of ALL_RULES) {
      const sels = r.selector.split(",").map((x) => x.trim().replace(/\s+/g, " "));
      const want = scope ? `${scope} ${selector}` : selector;
      if (!sels.includes(want)) continue;
      const size = decl(r.body, "font-size");
      if (size !== undefined) return resolve(size, modeBlock("ops"));
      const font = decl(r.body, "font");
      if (font !== undefined) return /\b(\d+px|var\(--text-micro\))/.exec(resolve(font, modeBlock("ops")))?.[1];
    }
    return undefined;
  }

  it.each(SELECTORS)("%s defaults to 12 px (ops and every other surface)", (sel) => {
    expect(sizeIn("", sel)).toBe("12px");
  });

  it.each(SELECTORS)("%s is 11 px in BRIEF", (sel) => {
    expect(sizeIn('[data-mode="brief"]', sel)).toBe("11px");
  });

  it.each(SELECTORS)("%s is 11 px on planner desktop (>= 1024 px) only", (sel) => {
    expect(sizeIn('[data-surface="planner"]', sel)).toBe("11px");
    const css = read("tokens.css");
    expect(css).toMatch(/@media \(min-width: 1024px\)\s*\{[^@]*\[data-surface="planner"\] \.code/);
  });

  it.each(SELECTORS)("%s is 14 px on the HUD (never below 14 px)", (sel) => {
    expect(sizeIn('[data-mode="hud"]', sel)).toBe("14px");
  });

  it.each(SELECTORS)("%s is 16 px on the EVA screens (never below 16 px)", (sel) => {
    for (const scope of ['[data-surface="eva"]', '[data-screen="SCR-12"]', '[data-screen="SCR-12-FULLMAP"]', '[data-screen="SCR-14"][data-variant="eva"]']) {
      expect(sizeIn(scope, sel), scope).toBe("16px");
    }
  });

  it("no rule sets 11 px on .code or .module-label outside BRIEF and planner desktop", () => {
    for (const r of ALL_RULES) {
      const sels = r.selector.split(",").map((x) => x.trim());
      if (!sels.some((x) => /\.(code|module-label)$/.test(x))) continue;
      if (!/\b11px\b/.test(r.body)) continue;
      for (const x of sels) expect(x, `${r.file}: ${x} sets 11 px`).toMatch(/^\[data-(mode="brief"|surface="planner")\] \.(code|module-label)$/);
    }
  });

  it("11 px microcopy keeps >= 4.5 : 1: fg-3 on BRIEF paper and concrete, text-3 on the OPS panels", () => {
    const brief = modeBlock("brief");
    const fg3 = resolve(decl(brief.body, "--fg-3")!, brief);
    for (const surface of ["--paper", "--concrete"]) {
      expect(contrast(fg3, resolve(decl(PRIMITIVES.body, surface)!, brief)), `brief ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
    const ops = modeBlock("ops");
    const ops3 = resolve(decl(ops.body, "--fg-3")!, ops);
    for (const surface of ["--void", "--panel", "--raised"]) {
      expect(contrast(ops3, resolve(decl(PRIMITIVES.body, surface)!, ops)), `ops ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the old TODO(decision) about the 11 px floor is gone", () => {
    expect(read("tokens.css")).not.toMatch(/TODO\(decision\)[^\n]*11 ?px/);
    expect(read("tokens.css")).toMatch(/04 §C\.2[^*]*Minimum text size/);
  });
});
