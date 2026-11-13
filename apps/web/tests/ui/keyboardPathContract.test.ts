import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("the claimed keyboard-only core path does not click or assign focus directly", () => {
  const source = readFileSync(new URL("../../e2e/checks/keyboard-path.spec.ts", import.meta.url), "utf8");
  const core = source.slice(source.indexOf('test("keyboard-path: 01 §E'), source.indexOf('// Package 10:'));
  expect(core).not.toMatch(/\.(?:focus|click|fill)\s*\(/);
  expect(core.match(/page\.goto\s*\(/g)).toHaveLength(1);
  expect(core).toContain("tabToChecked(");
  expect(core).toContain('data-slot="drawer-toggle"');
});

it("the rover keyboard-dispatch case opens its panel by keyboard", () => {
  const source = readFileSync(new URL("../../e2e/checks/ops-no-terminal.spec.ts", import.meta.url), "utf8");
  const check = source.slice(source.indexOf('test("ops-no-terminal: dispatch a rover target using keyboard'), source.indexOf('test("ops-no-terminal: utility rover dispatch'));
  expect(check).not.toContain('openOpsPanel(');
  expect(check).not.toMatch(/\.(?:focus|click)\s*\(/);
  expect(check).toContain('Crew & vehicles');
});
