import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("server undo coverage is referenced rather than left as a stale frontend todo", () => {
  const frontend = readFileSync(new URL("./evaSession.test.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../../../hab-core/tests/stopTasks.test.ts", import.meta.url), "utf8");
  expect(frontend).not.toContain('it.todo("server side (T31.04)');
  expect(frontend).toContain("apps/hab-core/tests/stopTasks.test.ts");
  expect(server).toContain('describe("UPDATE_STOP_TASK undo (FR-50, spec change #202)"');
  expect(server).toContain("an undo after a PLAN_REVISED");
  expect(server).toContain("the other EVA role may not undo");
});
