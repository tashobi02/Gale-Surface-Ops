/**
 * Hab Core command line (docs/specs/02 §F deployment, NFR-14).
 *   npm run hab:start  -- --site gale_boxwork --scenario storm-sol4190 [--port 8080]
 *   npm run hab:replay -- scenarios/storm-sol4190 [--seed 4190]
 * `start` serves apps/web/dist, data/sites and /ws on 0.0.0.0. `replay` runs the scenario headless
 * at full speed and prints the event-log hash. TASK-20 (start), TASK-22 (replay).
 */
import { startServer } from "./server";
import { replayHeadless } from "./replay";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const [, , mode, positional] = process.argv;

if (mode === "start") {
  await startServer({
    site: arg("site", "gale_boxwork")!,
    scenario: arg("scenario"),
    port: Number(arg("port", "8080")),
  });
} else if (mode === "replay") {
  if (!positional) throw new Error("usage: replay <scenario-dir> [--seed n]");
  const hash = await replayHeadless(positional, arg("seed") ? Number(arg("seed")) : undefined);
  console.log(hash);
} else {
  console.error("usage: cli.ts start|replay …");
  process.exitCode = 2;
}
