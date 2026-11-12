/**
 * Hab Core command line (docs/specs/02 §F deployment, NFR-10, NFR-14; §D.17 headless run). T22.13, T32.17.
 *   npm run hab:start  -- --site gale_boxwork [--scenario storm-sol4190 | --scenario-dir <path>] [--port 8080] [--resume latest|s-0003] [--var-dir <path>]
 *   npm run hab:local  -- [--open] [--port 8080] [start options]   (single laptop, BD-02)
 *   npm run hab:replay -- scenarios/storm-sol4190 [--seed 4190] [--commands <file>] [--record <file> [--record-period <s>]] [--var-dir <path>]
 *   tsx src/cli.ts export-commands <sessionDir|sessionsDir> <outDir>
 * `--public-host <host>` is the host the join QR codes name (`GET /api/join-qr`, BD-82; default: the first non-internal IPv4 address).
 * `local` is `start` for the virtual event's one-laptop topology (T20.09, BD-02, BD-133): the scenario defaults to
 * `storm-sol4190`, it prints the four localhost windows (ops, presenter, EVA EV1, HUD EV1) and, with `--open`, opens them in the
 * default browser; nothing is opened without `--open`.
 * `start` serves apps/web/dist, data/sites and /ws on 0.0.0.0; with `--scenario` it loads `scenarios/<id>` into a new
 * session (or resumes one with `--resume`, NFR-10); `--scenario-dir` loads a scenario folder anywhere (same loader checks)
 * and takes the site from the scenario unless `--site` is given. `replay` runs the scenario headless at full speed and prints
 * the event-log hash: `--commands` applies a recorded command list (a `CommandList`, 02 §D.17) in list order, each command at
 * its sim second; `--record` writes the message stream of the run as the Pages recording (`Recording`, canonical JSON); `--record-period <s>` coalesces its STATE_DELTAs to one per `s` sim seconds (default 1, BD-148).
 * `export-commands` writes `<session_id>.commands.json` for the session folder, or for every session under a `sessions`
 * folder, from their `commands.jsonl`; the files replay to the sessions' own hashes. A list the replay cannot run exits 2.
 * `--var-dir` moves the folder sessions are written to (default apps/hab-core/var).
 *
 * Relative paths are resolved from the folder `npm` was started in (INIT_CWD), because the
 * workspace script runs inside apps/hab-core.
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { CommandList } from "@marswalk/protocol";
import { REPO_ROOT, ReplayInputError, exportCommandLists, loadForReplay, replayHeadless, siteRefFor } from "./replay";
import { localUrls, openWindows, parseLocalArgs, printWindows } from "./localMode";
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
  if (mode === "start" || mode === "local") {
    const local = mode === "local" ? parseLocalArgs(process.argv) : undefined;
    const scenarioDir = pathArg("scenario-dir");
    const scenario = arg("scenario", mode === "local" && scenarioDir === undefined ? "storm-sol4190" : undefined);
    const site = arg("site", scenarioDir === undefined ? "gale_boxwork" : undefined);
    const dir = scenarioDir ?? (scenario ? join(REPO_ROOT, "scenarios", scenario) : undefined);
    const opened = dir ? openSession(dir, site, arg("resume")) : undefined;
    const session = opened?.session;
    const publicHost = arg("public-host");
    const server = await startServer({
      site: opened?.site_id ?? site ?? "gale_boxwork",
      scenario,
      port: local?.port ?? Number(arg("port", "8080")),
      session,
      ...(publicHost === undefined ? {} : { publicHost }),
    });
    const snap = session?.snapshot([]).session;
    console.log(`Hab Core on ${server.url}${snap ? ` — session ${snap.session_id}, ${snap.scenario_id}, last_seq ${snap.last_seq}` : " — no session"}`);
    if (local) {
      const windows = localUrls(Number(new URL(server.url).port));
      printWindows(windows, (line) => console.log(line));
      if (local.open) {
        const run = promisify(execFile);
        const failed = await openWindows(windows, process.platform, ({ command, args }) => run(command, args, { timeout: 10_000 }));
        for (const f of failed) console.error(`could not open ${f.label} (${f.url}): ${f.reason}; open it by hand`);
      }
    }
  } else if (mode === "replay") {
    if (!positional) throw new Error("usage: replay <scenario-dir> [--seed n] [--commands <file>] [--record <file>]");
    const seed = arg("seed");
    const commandsFile = pathArg("commands");
    const recordFile = pathArg("record");
    const period = arg("record-period");
    const record = recordFile === undefined ? undefined : new RecordingCollector(period === undefined ? undefined : Number(period));
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
    console.error("usage: cli.ts start|local|replay|export-commands …");
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
