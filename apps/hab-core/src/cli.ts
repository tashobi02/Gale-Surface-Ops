/**
 * Hab Core command line (docs/specs/02 §F deployment, NFR-10, NFR-14; §D.17 headless run). T22.13, T32.17.
 *   npm run hab:start  -- --site gale_boxwork [--scenario storm-sol4190 | --scenario-dir <path>] [--port 8080] [--resume latest|s-0003] [--var-dir <path>]
 *   npm run hab:replay -- scenarios/storm-sol4190 [--seed 4190] [--commands <file>] [--record <file>] [--var-dir <path>]
 *   tsx src/cli.ts export-commands <sessionDir|sessionsDir> <outDir>
 * `start` serves apps/web/dist, data/sites and /ws on 0.0.0.0; with `--scenario` it loads `scenarios/<id>` into a new
 * session (or resumes one with `--resume`, NFR-10); `--scenario-dir` loads a scenario folder anywhere (same loader checks)
 * and takes the site from the scenario unless `--site` is given. `replay` runs the scenario headless at full speed and prints
 * the event-log hash: `--commands` applies a recorded command list (a `CommandList`, 02 §D.17) in list order, each command at
 * its sim second; `--record` writes the message stream of the run as the Pages recording (`Recording`, canonical JSON).
 * `export-commands` writes `<session_id>.commands.json` for the session folder, or for every session under a `sessions`
 * folder, from their `commands.jsonl`; the files replay to the sessions' own hashes. A list the replay cannot run exits 2.
 * `--var-dir` moves the folder sessions are written to (default apps/hab-core/var).
 *
 * Relative paths are resolved from the folder `npm` was started in (INIT_CWD), because the
 * workspace script runs inside apps/hab-core.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CommandList } from "@marswalk/protocol";
import { REPO_ROOT, ReplayInputError, exportCommandLists, loadForReplay, replayHeadless, siteRefFor } from "./replay";
import { RecordingCollector, recordingJson } from "./recording";
import { ScenarioCheckError } from "./scenario";
import { startServer } from "./server";
import { loadSession, resumeSession, type SessionHandle } from "./session";


function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const fromCwd = (p: string): string => resolve(process.env.INIT_CWD ?? process.cwd(), p);
const pathArg = (name: string): string | undefined => {
  const v = arg(name);
  return v === undefined ? undefined : fromCwd(v);
};
/** Where sessions are written: `--var-dir`, else apps/hab-core/var (git-ignored). */
const varDir = (): string => pathArg("var-dir") ?? join(REPO_ROOT, "apps/hab-core/var");

/** The newest `s-<n>` folder, or null when there is none. */
function latestSessionDir(): string | null {
  const dir = join(varDir(), "sessions");
  if (!existsSync(dir)) return null;
  const ids = readdirSync(dir).filter((d) => /^s-\d+$/.test(d)).sort();
  return ids.length ? join(dir, ids[ids.length - 1]) : null;
}

function openSession(scenarioDir: string, site: string | undefined, resume: string | undefined): { session: SessionHandle; site_id: string } {
  const loaded = loadForReplay(scenarioDir, site === undefined ? {} : { site: siteRefFor(site) });
  const site_id = loaded.scenario.site_id;
  if (!resume) return { session: loadSession(loaded, varDir()), site_id };
  const dir = resume === "latest" ? latestSessionDir() : join(varDir(), "sessions", resume);
  if (!dir || !existsSync(dir)) throw new Error(`--resume ${resume}: no such session under ${join(varDir(), "sessions")}`);
  return { session: resumeSession(dir, loaded), site_id };
}

/** The command list in `--commands <file>`; a missing or unreadable file is the caller's error (exit 2). */
function readCommandList(file: string): CommandList {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new ReplayInputError(`cannot read the command list ${file}`);
  }
  try {
    return JSON.parse(text) as CommandList;
  } catch {
    throw new ReplayInputError(`the command list ${file} is not JSON`);
  }
}

async function main(): Promise<void> {
  const [, , mode, positional, second] = process.argv;
  if (mode === "start") {
    const scenarioDir = pathArg("scenario-dir");
    const scenario = arg("scenario");
    const site = arg("site", scenarioDir === undefined ? "gale_boxwork" : undefined);
    const dir = scenarioDir ?? (scenario ? join(REPO_ROOT, "scenarios", scenario) : undefined);
    const opened = dir ? openSession(dir, site, arg("resume")) : undefined;
    const session = opened?.session;
    const server = await startServer({ site: opened?.site_id ?? site ?? "gale_boxwork", scenario, port: Number(arg("port", "8080")), session });
    const snap = session?.snapshot([]).session;
    console.log(`Hab Core on ${server.url}${snap ? ` — session ${snap.session_id}, ${snap.scenario_id}, last_seq ${snap.last_seq}` : " — no session"}`);
  } else if (mode === "replay") {
    if (!positional) throw new Error("usage: replay <scenario-dir> [--seed n] [--commands <file>] [--record <file>]");
    const seed = arg("seed");
    const commandsFile = pathArg("commands");
    const recordFile = pathArg("record");
    const record = recordFile === undefined ? undefined : new RecordingCollector();
    const hash = await replayHeadless(fromCwd(positional), seed === undefined ? undefined : Number(seed), {
      ...(pathArg("var-dir") === undefined ? {} : { varDir: pathArg("var-dir") }),
      ...(commandsFile === undefined ? {} : { commands: readCommandList(commandsFile) }),
      ...(record === undefined ? {} : { record }),
    });
    if (record !== undefined && recordFile !== undefined) writeFileSync(recordFile, recordingJson(record.finish()));
    console.log(hash);
  } else if (mode === "export-commands") {
    if (!positional || !second) throw new Error("usage: export-commands <sessionDir|sessionsDir> <outDir>");
    for (const file of exportCommandLists(fromCwd(positional), fromCwd(second))) console.log(file);
  } else {
    console.error("usage: cli.ts start|replay|export-commands …");
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
