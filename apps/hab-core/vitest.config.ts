import { defineConfig } from "vitest/config";

// The headless replays run thousands of ticks; on a loaded machine (several agents, CI) the heaviest take over 5 s. The
// longer limit only stops that false timeout; it does not hide a hang, which still fails at 30 s.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000 },
});
