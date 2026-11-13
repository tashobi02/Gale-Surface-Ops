import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("N-29 acceptance uses an authoritative live session and log", () => {
  const source = readFileSync(new URL("../../e2e/checks/targets.spec.ts", import.meta.url), "utf8");
  const check = source.slice(source.indexOf('test.fixme("needs N-29:'), source.indexOf('test("targets: stop task editor'));
  expect(check).not.toContain("openEvaFixture(");
  expect(check).toContain("openFreshOps(");
  expect(check).toContain("sessionSnapshot(");
  expect(check).toContain("sessionLog(");
  expect(check).toContain('"TASK_UPDATED"');
});
