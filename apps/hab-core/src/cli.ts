/**
 * Hab Core command line (docs/specs/02 §F deployment, NFR-10, NFR-14). T22.13.
 *   npm run hab:start  -- --site gale_boxwork [--scenario storm-sol4190] [--port 8080] [--resume latest|s-0003]
 *   npm run hab:replay -- scenarios/storm-sol4190 [--seed 4190]
 * `start` serves apps/web/dist, data/sites and /ws on 0.0.0.0; with `--scenario` it loads
 * `scenarios/<id>` into a new session (or resumes one with `--resume`, NFR-10). `replay` runs the
 * scenario headless at full speed and prints the event-log hash.
 *
 * Relative paths are resolved from the folder `npm` was started in (INIT_CWD), because the
 * workspace script runs inside apps/hab-core.
 */
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { REPO_ROOT, ReplayInputError, loadForReplay, replayHeadless, siteRefFor } from "./replay";
import { ScenarioCheckError } from "./scenario";
import { startServer } from "./server";
import { loadSession, resumeSession, type SessionHandle } from "./session";

const VAR_DIR = join(REPO_ROOT, "apps/hab-core/var");

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const fromCwd = (p: string): string => resolve(process.env.INIT_CWD ?? process.cwd(), p);

/** The newest `s-<n>` folder, or null when there is none. */
function latestSessionDir(): string | null {
  const dir = join(VAR_DIR, "sessions");
  if (!existsSync(dir)) return null;
  const ids = readdirSync(dir).filter((d) => /^s-\d+$/.test(d)).sort();
  return ids.length ? join(dir, ids[ids.length - 1]) : null;
}

function openSession(site: string, scenarioId: string, resume: string | undefined): SessionHandle {
  const loaded = loadForReplay(join(REPO_ROOT, "scenarios", scenarioId), { site: siteRefFor(site) });
  if (!resume) return loadSession(loaded, VAR_DIR);
  const dir = resume === "latest" ? latestSessionDir() : join(VAR_DIR, "sessions", resume);
  if (!dir || !existsSync(dir)) throw new Error(`--resume ${resume}: no such session under ${join(VAR_DIR, "sessions")}`);
  return resumeSession(dir, loaded);
}

async function main(): Promise<void> {
  const [, , mode, positional] = process.argv;
  if (mode === "start") {
    const site = arg("site", "gale_boxwork")!;
    const scenario = arg("scenario");
    const session = scenario ? openSession(site, scenario, arg("resume")) : undefined;
    const server = await startServer({ site, scenario, port: Number(arg("port", "8080")), session });
    const snap = session?.snapshot([]).session;
    console.log(`Hab Core on ${server.url}${snap ? ` — session ${snap.session_id}, ${snap.scenario_id}, last_seq ${snap.last_seq}` : " — no session"}`);
  } else if (mode === "replay") {
    if (!positional) throw new Error("usage: replay <scenario-dir> [--seed n]");
    const seed = arg("seed");
    console.log(await replayHeadless(fromCwd(positional), seed === undefined ? undefined : Number(seed)));
  } else {
    console.error("usage: cli.ts start|replay …");
    process.exitCode = 2;
  }
}

main().catch((err: unknown) => {
  if (err instanceof ReplayInputError) {
    console.error(err.message);
    process.exitCode = 2;
    return;
  }
  if (err instanceof ScenarioCheckError) console.error(`scenario check "${err.check}" failed: ${err.message}`);
  else console.error(err);
  process.exitCode = 1;
});
