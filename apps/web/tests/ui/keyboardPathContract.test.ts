import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("the claimed keyboard-only core path does not click or assign focus directly", () => {
  const source = readFileSync(new URL("../../e2e/checks/keyboard-path.spec.ts", import.meta.url), "utf8");
  const core = source.slice(source.indexOf('test("keyboard-path: 01 §E'), source.indexOf('// Package 10:'));
  expect(core).not.toMatch(/\.(?:focus|click|fill)\s*\(/);
  expect(core.match(/page\.goto\s*\(/g)).toHaveLength(1);
  expect(core).toContain("tabToChecked(");
});
