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

describe("T13.04 type and icon values that 04 does not allow are flagged, not edited (change 04 first)", () => {
  it("base.css headings keep the v1 style and carry a TODO(decision) for 04 v2 §C.2 (Chakra Petch, not self-hosted)", () => {
    const base = read("base.css");
    expect(base).toMatch(/TODO\(decision\)[\s\S]*04 §C\.2[\s\S]*Chakra Petch/);
    expect(base).toMatch(/font-weight: 600/);
  });

  it(".code/.module-label stay at 11 px with a TODO(decision) because 04 §C.2 sets a 12 px minimum", () => {
    const tokens = read("tokens.css");
    const rule = /\.code,\s*\.module-label\s*\{[^}]*font:\s*500 11px/.exec(tokens);
    expect(rule, ".code, .module-label rule").not.toBeNull();
    const i = tokens.indexOf(".code,");
    expect(tokens.slice(Math.max(0, i - 400), i + 200)).toMatch(/TODO\(decision\)[\s\S]*(11 ?px|12 ?px)[\s\S]*04 §C\.2/);
  });

  it("icons README flags Lucide stroke 2 / round vs 04 §C.4 1.5 / squared as TODO(decision)", () => {
    const readme = readFileSync(join(STYLES_DIR, "../../../public/icons/README.md"), "utf8");
    expect(readme).toMatch(/TODO\(decision\)[^\n]*(04 spec|spec-change|spec change)/i);
    expect(readme).toMatch(/stroke-width="2"/);
  });
});
