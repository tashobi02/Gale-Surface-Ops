/**
 * T22.13 and T32.17: the Hab Core command line (apps/hab-core/src/cli.ts; docs/specs/02 §F, NFR-10, NFR-14; CLAUDE.md §4
 * `make replay`, `make hab`). The CLI is run as a child process (tsx), on a copy of the fake scenario whose data_version and
 * plan_hash are re-stamped to the mock site's, so the loader's site checks run as they do for the real scenario.
 * The real `make replay` and `make hab` need `scenarios/storm-sol4190/scenario.json` (TASK-21, backend package 25).
 *
 * Rules fixed here (decided by the orchestrator, 12 Nov 2026, BD-93, BD-105, BD-121):
 * - `replay <scenarioDir>` prints one SHA-256 line, the same twice; `--commands <file>` applies a command list,
 *   `--record <file>` writes the recording (canonical JSON); a bad list exits 2 with the reason and no output.
 * - `export-commands <sessionDir|sessionsDir> <outDir>` writes `<session_id>.commands.json` per session and prints the paths.
 * - `start --scenario-dir <path>` loads a scenario folder outside `scenarios/` (same loader checks), takes the site from the
 *   scenario unless `--site` is given, and serves `GET /api/health` with the session id on the port asked for.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalJson, type CommandList, type Recording, type Scenario } from "@marswalk/protocol";
import { loadSession } from "../src/session";
import { readScenario } from "../src/scenario";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const HAB_CORE = join(here, "..");
const TSX = join(here, "../../../node_modules/.bin/tsx");
const SITE_VERSION = "mock_site-2026.11.05";

const dirs: string[] = [];
const tmp = (prefix: string): string => {
  const d = mkdtempSync(join(tmpdir(), `marswalk-${prefix}-`));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** The fake scenario for the mock site's data_version: the plan re-stamped and its plan_hash recomputed (05 PlanExport). */
function mockSiteScenario(): { dir: string; scenario: Scenario } {
  const dir = tmp("cli-scenario");
  cpSync(join(here, "fixtures/fake-scenario"), dir, { recursive: true });
  const scenario = JSON.parse(readFileSync(join(dir, "scenario.json"), "utf8")) as Scenario;
  scenario.data_version = SITE_VERSION;
  const plan = scenario.plan!;
  plan.data_version = SITE_VERSION;
  plan.plan_hash = sha256(canonicalJson({ data_version: plan.data_version, scenario: plan.scenario, waypoints: plan.waypoints })).slice(0, 12);
  writeFileSync(join(dir, "scenario.json"), `${JSON.stringify(scenario, null, 2)}\n`);
  return { dir, scenario };
}

async function cli(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await exec(TSX, ["src/cli.ts", ...args], { cwd: HAB_CORE, env: { ...process.env, ...env } });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout, stderr: e.stderr, code: e.code };
  }
}

const listFor = (scenario: Scenario): CommandList => ({
  $comment: "cli test list",
  scenario_id: scenario.scenario_id,
  seed: scenario.seed,
  commands: [
    { sim_time: scenario.start_utc, role: "ops", kind: "START_EVA", args: {} },
    { sim_time: new Date(Date.parse(scenario.start_utc) + 30_000).toISOString().replace(".000Z", "Z"), role: "ops", kind: "INJECT_EVENT", args: { level: "advisory", message: "CLI check" } },
  ],
});

describe("replay (T22.13, T32.17)", () => {
  it("prints one SHA-256 log_hash, the same on a second run (make replay)", async () => {
    const { dir } = mockSiteScenario();
    const a = await cli(["replay", dir]);
    const b = await cli(["replay", dir]);
    expect(a.code).toBe(0);
    expect(a.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    expect(b.stdout).toBe(a.stdout);
  }, 60_000);

  it("--commands applies a command list, and the same list prints the same hash twice", async () => {
    const { dir, scenario } = mockSiteScenario();
    const file = join(tmp("cli-list"), "list.json");
    writeFileSync(file, JSON.stringify(listFor(scenario)));
    const plain = await cli(["replay", dir]);
    const a = await cli(["replay", dir, "--commands", file]);
    const b = await cli(["replay", dir, "--commands", file]);
    expect(a.code).toBe(0);
    expect(a.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    expect(b.stdout).toBe(a.stdout);
    expect(a.stdout).not.toBe(plain.stdout);
  }, 60_000);

  it("--record writes the recording as canonical JSON, identical on a second run", async () => {
    const { dir, scenario } = mockSiteScenario();
    const out = tmp("cli-rec");
    const file = join(out, "list.json");
    writeFileSync(file, JSON.stringify(listFor(scenario)));
    const hash = (await cli(["replay", dir, "--commands", file, "--record", join(out, "a.json")])).stdout.trim();
    await cli(["replay", dir, "--commands", file, "--record", join(out, "b.json")]);
    const a = readFileSync(join(out, "a.json"), "utf8");
    expect(readFileSync(join(out, "b.json"), "utf8")).toBe(a);
    const recording = JSON.parse(a) as Recording;
    expect(recording).toMatchObject({ format: "marswalk-recording", label: "replayed recording", log_hash: hash, scenario_id: scenario.scenario_id });
    expect(recording.messages[0].type).toBe("SNAPSHOT");
    expect(a).toBe(`${canonicalJson(recording)}\n`);
  }, 60_000);

  it("--record without --commands records the old no-list run", async () => {
    const { dir } = mockSiteScenario();
    const file = join(tmp("cli-rec"), "plain.json");
    const hash = (await cli(["replay", dir, "--record", file])).stdout.trim();
    expect((JSON.parse(readFileSync(file, "utf8")) as Recording).log_hash).toBe(hash);
  }, 60_000);

  it("a bad list exits 2 with the reason and prints no hash", async () => {
    const { dir, scenario } = mockSiteScenario();
    const file = join(tmp("cli-list"), "bad.json");
    writeFileSync(file, JSON.stringify({ ...listFor(scenario), commands: [{ sim_time: scenario.start_utc, role: "ops", kind: "FLY_TO_MARS", args: {} }] }));
    const r = await cli(["replay", dir, "--commands", file]);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/unknown command kind FLY_TO_MARS/);
    const missing = await cli(["replay", dir, "--commands", join(dirname(file), "nope.json")]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toMatch(/nope\.json/);
  }, 60_000);

  it("--commands relative paths are read from the folder npm was started in (INIT_CWD)", async () => {
    const { dir, scenario } = mockSiteScenario();
    const cwd = tmp("cli-cwd");
    writeFileSync(join(cwd, "list.json"), JSON.stringify(listFor(scenario)));
    const r = await cli(["replay", dir, "--commands", "list.json"], { INIT_CWD: cwd });
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
  }, 60_000);

  it("an unknown mode exits 2 and the usage names replay, export-commands and start", async () => {
    const r = await cli(["fly"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/start/);
    expect(r.stderr).toMatch(/replay/);
    expect(r.stderr).toMatch(/export-commands/);
  }, 30_000);
});

describe("export-commands (T32.17)", () => {
  it("writes one <session_id>.commands.json per session of a sessions folder and prints the paths; the list replays to the session's hash", async () => {
    const { dir } = mockSiteScenario();
    const varDir = tmp("cli-var");
    const scenario = readScenario(dir, { site_id: "mock_site", data_version: SITE_VERSION, dir: null });
    const session = loadSession(scenario, varDir);
    session.apply({ command_id: "k-1", role: "ops", kind: "START_EVA", args: {} }, "c-ops");
    session.advance(60);
    session.apply({ command_id: "k-2", role: "presenter", kind: "RESET_SESSION", args: {} }, "c-pres");
    const out = tmp("cli-export");
    const r = await cli(["export-commands", join(varDir, "sessions"), out]);
    expect(r.code).toBe(0);
    expect(r.stdout.trim().split("\n").map((p) => p.replace(out + "/", ""))).toEqual(["s-0001.commands.json", "s-0002.commands.json"]);
    expect(readdirSync(out).sort()).toEqual(["s-0001.commands.json", "s-0002.commands.json"]);
    const first = JSON.parse(readFileSync(join(out, "s-0001.commands.json"), "utf8")) as CommandList;
    expect(first.commands.map((c) => c.kind)).toEqual(["START_EVA", "RESET_SESSION"]);
    const replayed = await cli(["replay", dir, "--commands", join(out, "s-0001.commands.json")]);
    expect(replayed.stdout.trim()).toBe(sha256(readFileSync(join(varDir, "sessions/s-0001/session.jsonl"), "utf8")));
    expect(existsSync(join(varDir, "sessions/s-0002/commands.jsonl"))).toBe(true);
  }, 60_000);

  it("takes a single session folder as well", async () => {
    const { dir } = mockSiteScenario();
    const varDir = tmp("cli-var");
    const session = loadSession(readScenario(dir, { site_id: "mock_site", data_version: SITE_VERSION, dir: null }), varDir);
    session.apply({ command_id: "k-1", role: "ops", kind: "START_EVA", args: {} }, "c-ops");
    const out = tmp("cli-export");
    const r = await cli(["export-commands", join(varDir, "sessions/s-0001"), out]);
    expect(r.code).toBe(0);
    expect(readdirSync(out)).toEqual(["s-0001.commands.json"]);
  }, 30_000);

  it("a folder with no command journal exits 1 with the reason", async () => {
    const r = await cli(["export-commands", tmp("cli-none"), tmp("cli-export")]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/commands\.jsonl/);
  }, 30_000);
});

describe("start --scenario-dir (N-01; T22.13 make hab smoke)", () => {
  it("serves /api/health with the session id for a scenario folder outside scenarios/, on the requested host and port", async () => {
    const { dir } = mockSiteScenario();
    const child = execFile(TSX, ["src/cli.ts", "start", "--scenario-dir", dir, "--port", "0"], { cwd: HAB_CORE });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let out = "";
        child.stdout!.on("data", (d: Buffer) => {
          out += d.toString();
          const m = /Hab Core on (http:\/\/\S+)/.exec(out);
          if (m) resolve(m[1]);
        });
        child.once("exit", (code) => reject(new Error(`cli exited ${code}: ${out}`)));
        setTimeout(() => reject(new Error(`no start line: ${out}`)), 20_000);
      });
      const res = await fetch(`${url}/api/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; session_id: string };
      expect(body.status).toBe("ok");
      expect(body.session_id).toMatch(/^s-\d{4}$/);
    } finally {
      child.kill();
    }
  }, 40_000);

  it("a scenario folder the loader refuses exits 1 with the check that failed", async () => {
    const { dir } = mockSiteScenario();
    writeFileSync(join(dir, "scenario.json"), "{}");
    const r = await cli(["start", "--scenario-dir", dir, "--port", "0", "--site", "mock_site"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/scenario check/);
  }, 30_000);
});
