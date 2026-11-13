/**
 * Loaded for every test file (`setupFiles` in vitest.config.ts). After the file's last test and its own `afterAll` hooks
 * (hooks run in reverse order, so this one registered first runs last), it fails the file when a server or a child process
 * is still open. The message names the count; the culprit is the test that starts one without an `afterEach`/`afterAll` close.
 */
import { afterAll } from "vitest";
import { settleHandles } from "./noOpenHandles";

afterAll(async () => {
  const left = await settleHandles();
  if (left.length > 0) {
    throw new Error(`test hygiene: ${left.length} handle(s) still open after the last test (${[...new Set(left)].join(", ")}). Close every server in afterEach/afterAll and kill every child process.`);
  }
});
