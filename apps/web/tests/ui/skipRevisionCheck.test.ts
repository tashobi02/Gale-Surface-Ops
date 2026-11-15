import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("N-29 acceptance uses an authoritative live session and log", () => {
  const source = readFileSync(new URL("../../e2e/checks/targets.spec.ts", import.meta.url), "utf8");
  expect(source).not.toContain('test.fixme("needs N-29:');
  const start = source.indexOf('test("the Hab Core accepts a skipped task\'s new reason');
  const end = source.indexOf('test("targets: stop task editor', start);
  expect(start, "the live N-29 acceptance check exists").toBeGreaterThanOrEqual(0);
  expect(end, "the following check bounds the N-29 test").toBeGreaterThan(start);
  const check = source.slice(start, end);
  expect(check).not.toContain("openEvaFixture(");
  expect(check).toContain("openFreshOps(");
  expect(check).toContain("sessionSnapshot(");
  expect(check).toContain("sessionLog(");
  expect(check).toContain('"TASK_UPDATED"');
});
