import { defineConfig } from "vitest/config";

// The headless replays run thousands of ticks; on a loaded machine (several agents, CI) the heaviest take over 5 s. The
// longer limit only stops that false timeout; it does not hide a hang, which still fails at 30 s.
//
// Two projects (backend package 27, BD-149). The real-scenario files run the real storm-sol4190 session on the real gale_boxwork
// bundle: they use several processes each and two of them measure time (the fan-out latency, the CPU share at 60x). They run
// after the unit files, one file at a time (`groupOrder` 2, `fileParallelism` off), so no other test shares the cores while a
// timing is taken. Without the bundle they skip at once.
const REAL = ["tests/referenceCommands.test.ts", "tests/killerDemo.test.ts", "tests/liveSession.test.ts", "tests/realLinks.test.ts", "tests/latency.test.ts", "tests/resume.test.ts"];

// Test hygiene (backend package 30): `tests/helpers/guardOpenHandles.ts` runs after every file and fails it when a server
// or a child process the file started is still open (a setup file of both projects); `globalLeakCheck.ts` fails the run when a
// Hab Core CLI process it started outlives it (a global setup of both projects).
const GUARD = ["tests/helpers/guardOpenHandles.ts"];
const RUN_GUARD = ["tests/helpers/globalLeakCheck.ts"];

export default defineConfig({
  test: {
    testTimeout: 30_000,
    projects: [
      { test: { name: "unit", include: ["tests/**/*.test.ts"], exclude: REAL, testTimeout: 30_000, sequence: { groupOrder: 1 }, setupFiles: GUARD, globalSetup: RUN_GUARD } },
      { test: { name: "real", include: REAL, testTimeout: 30_000, fileParallelism: false, sequence: { groupOrder: 2 }, setupFiles: GUARD, globalSetup: RUN_GUARD } },
    ],
  },
});
