/**
 * T32.16: headless replay of a recorded command list, the command journal and the export (docs/specs/02 §D.17 "Headless
 * run", "Command list file"; 01 FR-51; NFR-06, NFR-14; 05 Command). One named test per rule; red before T32.17.
 * The real engine runs (no mock) on the fake scenario (F8): its reference plan with two stops, or its plan-less variant.
 *
 * Rules fixed here (decided by the orchestrator, 12 Nov 2026, BD-93, BD-121):
 * - A list is applied in list order, never sorted by `sim_time`. A command recorded at sim second `t` is applied when the
 *   clock reads `t`: after the tick that reached `t`, before the tick that leaves it (the same instant the live session
 *   applied it). A command whose `sim_time` the clock has already passed is applied at once.
 * - Without a list the old run stands: START_EVA, the first library event pressed at `series_start_utc`, 1-s steps to the end.
 *   It is the same run as the list of those two commands.
 * - After the last command the run goes on to ENDED or the plan's maximum EVA duration, or to `until_sim_time` when the list
 *   has one. A list that ends with RESET_SESSION ends the run there, and the hash is the one of the old log (its last line is
 *   SESSION_RESET): a list covers one session.
 * - A rejected command is logged as COMMAND_REJECTED and the run goes on. An unknown kind, role or scenario, a bad time, or
 *   a command that follows RESET_SESSION is a `ReplayInputError` before anything runs. A command the clock cannot reach
 *   (the session is not running and its time is earlier) is one too, at that command.
 * - `commands.jsonl` (one `CommandJournalLine` per evaluated command, accepted or rejected, in evaluation order) is written
 *   beside `session.jsonl`. A creating LOAD_SCENARIO is journaled in the new session at after_seq 0; a resent id and a load
 *   that found no scenario are not journaled. The journal is not in `log_hash`.
 * - Export: the journal becomes a `CommandList` carrying each command's `command_id` and `client_id`, the session id and the
 *   sim time of the session's last event, so replaying it gives the session's own `log_hash`. ROLE_TAKEN_OVER lines are not
 *   commands: a session that logged one exports and replays deterministically, but to a different hash.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { Command, CommandJournalLine, CommandList, LogEvent, RecordedCommand, Role } from "@marswalk/protocol";
import { exportCommandList, exportCommandLists, replayHeadless, ReplayInputError } from "../src/replay";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { loadSession, resumeSession, type SessionHandle } from "../src/session";

const here = dirname(fileURLToPath(import.meta.url));
const FAKE = join(here, "fixtures/fake-scenario");
const SITE = { site_id: "mock_site", data_version: "mock_site-fixture", dir: null };
const fake = readScenario(FAKE, SITE);
const T0 = fake.scenario.start_utc;
const at = (s: number): string => new Date(Date.parse(T0) + s * 1000).toISOString().replace(".000Z", "Z");

const dirs: string[] = [];
const tmp = (prefix: string): string => {
  const d = mkdtempSync(join(tmpdir(), `marswalk-${prefix}-`));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");
const linesOf = <T>(path: string): T[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);

const cmd = (sim_s: number, role: Role, kind: RecordedCommand["kind"], args: Record<string, unknown> = {}, ids: Partial<RecordedCommand> = {}): RecordedCommand => ({ sim_time: at(sim_s), role, kind, args, ...ids });
const listOf = (commands: RecordedCommand[], extra: Partial<CommandList> = {}): CommandList => ({ $comment: "test list", scenario_id: fake.scenario.scenario_id, seed: fake.scenario.seed, commands, ...extra });
const START_EVA = cmd(0, "ops", "START_EVA");
const inject = (s: number, message: string): RecordedCommand => cmd(s, "ops", "INJECT_EVENT", { level: "advisory", message });

/** Replay `list` in a fresh folder; the session's events are read back from its log on disk. */
async function run(list: CommandList | undefined, scenarioDir = FAKE, session_id = "s-0001"): Promise<{ hash: string; events: LogEvent[]; varDir: string }> {
  const varDir = tmp("replay-var");
  const hash = await replayHeadless(scenarioDir, undefined, { site: SITE, varDir, ...(list ? { commands: list } : {}) });
  const base = join(varDir, "replay");
  const sub = readdirSync(base)[0]!;
  return { hash, events: linesOf<LogEvent>(join(base, sub, "sessions", session_id, "session.jsonl")), varDir };
}
const kinds = (events: LogEvent[]): string[] => events.map((e) => e.kind);
const alertTexts = (events: LogEvent[]): string[] => events.filter((e) => e.kind === "ALERT_RAISED").map((e) => (e.data as { message: string }).message);

/** The plan-less variant of the fake scenario as a folder of its own. */
function planlessDir(): string {
  const dir = tmp("planless");
  cpSync(FAKE, dir, { recursive: true });
  writeFileSync(join(dir, "scenario.json"), readFileSync(join(dir, "scenario.planless.json")));
  return dir;
}

describe("replayHeadless with a command list (T32.17; 02 §D.17)", () => {
  it("applies the commands in list order, not sorted by sim_time, each at its own sim second", async () => {
    const { events } = await run(listOf([START_EVA, inject(20, "First"), inject(10, "Second")]));
    expect(alertTexts(events)).toEqual(["First", "Second"]);
    const injected = events.filter((e) => e.kind === "ALERT_RAISED" && e.actor === "ops");
    // "First" waits for the clock to read 20 s; "Second" (recorded earlier) is applied at once after it, never before.
    expect(injected.map((e) => e.sim_time)).toEqual([at(20), at(20)]);
    expect(injected[0].seq).toBeLessThan(injected[1].seq);
    expect(injected.map((e) => e.command_ref)).toEqual([
      { client_id: "replay", command_id: "replay-2" },
      { client_id: "replay", command_id: "replay-3" },
    ]);
  });

  it("applies a command at sim second t after the tick that reached t and before the next tick", async () => {
    const base = await run(listOf([START_EVA]));
    const arrival = base.events.find((e) => e.kind === "ARRIVED_STOP")!;
    const t = (Date.parse(arrival.sim_time) - Date.parse(T0)) / 1000;
    const { events } = await run(listOf([START_EVA, inject(t, "At arrival"), inject(t - 1, "A second earlier")]));
    const iArrive = events.findIndex((e) => e.kind === "ARRIVED_STOP");
    const iAt = events.findIndex((e) => e.kind === "ALERT_RAISED" && (e.data as { message: string }).message === "At arrival");
    expect(events[iAt].sim_time).toBe(arrival.sim_time);
    expect(iAt).toBeGreaterThan(iArrive); // the tick of second t has run
    expect(events.slice(iAt + 1).every((e) => Date.parse(e.sim_time) >= Date.parse(arrival.sim_time))).toBe(true); // and no later tick before it
  });

  it("the same list, scenario and seed give the same log_hash twice (NFR-06, NFR-14)", async () => {
    const list = listOf([START_EVA, inject(30, "Check the suit"), cmd(45, "ops", "SET_CLOCK", { speed: 10 })]);
    const a = await run(list);
    const b = await run(list);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.hash).toBe(a.hash);
    expect(sha256(readFileSync(join(a.varDir, "replay", readdirSync(join(a.varDir, "replay"))[0]!, "sessions/s-0001/session.jsonl")))).toBe(a.hash);
  });

  it("a different list gives a different log_hash", async () => {
    const a = await run(listOf([START_EVA]));
    const b = await run(listOf([START_EVA, inject(30, "Extra")]));
    expect(b.hash).not.toBe(a.hash);
  });

  it("runs to the end of the EVA after the last command", async () => {
    const { events } = await run(listOf([START_EVA]));
    expect(kinds(events)).toContain("EVA_ENDED");
  });

  it("stops at until_sim_time when the list has one", async () => {
    const { events } = await run(listOf([START_EVA], { until_sim_time: at(100) }));
    expect(events[events.length - 1].sim_time <= at(100)).toBe(true);
    expect(kinds(events)).not.toContain("EVA_ENDED");
  });

  it("without a list the run is the old one: START_EVA, then the first library event at series_start_utc", async () => {
    const storm = fake.scenario.event_library![0];
    const lead_s = (Date.parse(storm.series_start_utc) - Date.parse(T0)) / 1000;
    const none = await run(undefined);
    const same = await run(
      listOf([
        cmd(0, "ops", "START_EVA", {}, { command_id: "replay-start", client_id: "replay" }),
        cmd(lead_s, "presenter", "START_EVENT", { event_id: storm.event_id }, { command_id: "replay-storm", client_id: "replay" }),
      ]),
    );
    expect(same.hash).toBe(none.hash);
    expect(kinds(none.events)).toContain("EVENT_STARTED");
  });

  it("a rejected command is logged as COMMAND_REJECTED and does not stop the run", async () => {
    const { events } = await run(listOf([cmd(0, "presenter", "JUMP_NEXT_STOP"), cmd(0, "eva:EV1", "ADD_STOP_TASK", { stop_id: "wp-1", text: "x" }), START_EVA]));
    const rejected = events.filter((e) => e.kind === "COMMAND_REJECTED");
    expect(rejected.map((e) => (e.data as { code: string }).code)).toEqual(["INVALID", "FORBIDDEN_ROLE"]);
    expect(rejected[0].command_ref).toEqual({ client_id: "replay", command_id: "replay-1" });
    expect(kinds(events)).toContain("EVA_STARTED");
    expect(kinds(events)).toContain("EVA_ENDED");
  });
});

describe("a list that cannot be run is an error before the run (T32.17)", () => {
  const rejects = async (list: CommandList, pattern: RegExp, scenarioDir = FAKE): Promise<string[]> => {
    const varDir = tmp("replay-var");
    await expect(replayHeadless(scenarioDir, undefined, { site: SITE, varDir, commands: list })).rejects.toThrow(ReplayInputError);
    await expect(replayHeadless(scenarioDir, undefined, { site: SITE, varDir, commands: list })).rejects.toThrow(pattern);
    return existsSync(join(varDir, "replay")) ? readdirSync(join(varDir, "replay")) : [];
  };

  it("an unknown command kind, and nothing is created", async () => {
    expect(await rejects(listOf([START_EVA, { ...inject(5, "x"), kind: "FLY_TO_MARS" as never }]), /unknown command kind FLY_TO_MARS/)).toEqual([]);
  });

  it("an unknown role", async () => {
    expect(await rejects(listOf([{ ...START_EVA, role: "captain" as never }]), /unknown role captain/)).toEqual([]);
  });

  it("a sim_time that is not a UTC time", async () => {
    await rejects(listOf([{ ...START_EVA, sim_time: "noon" }]), /sim_time/);
  });

  it("a list for another scenario", async () => {
    await rejects(listOf([START_EVA], { scenario_id: "another-scenario" }), /another-scenario/);
  });

  it("a command after RESET_SESSION: a list covers one session", async () => {
    await rejects(listOf([cmd(0, "presenter", "RESET_SESSION"), START_EVA]), /RESET_SESSION/);
  });

  it("a command the clock cannot reach because the session is not running", async () => {
    await rejects(listOf([inject(100, "never")]), /LOADED/);
  });

  it("a scenario with no plan and no list still asks for a PUBLISH_PLAN", async () => {
    const varDir = tmp("replay-var");
    await expect(replayHeadless(planlessDir(), undefined, { site: SITE, varDir })).rejects.toThrow(ReplayInputError);
  });
});

describe("a plan-less scenario replays when the list starts with PUBLISH_PLAN (T32.17)", () => {
  it("PUBLISH_PLAN, START_EVA, then the walk to the end", async () => {
    const plan = fake.scenario.plan!;
    const dir = planlessDir();
    const list = listOf([cmd(0, "planner", "PUBLISH_PLAN", { plan }), START_EVA], { scenario_id: "fake-planless" });
    const { events, hash } = await run(list, dir);
    expect(kinds(events).slice(0, 3)).toEqual(["SESSION_LOADED", "PLAN_REVISED", "EVA_STARTED"]);
    expect(kinds(events)).toContain("EVA_ENDED");
    expect((await run(list, dir)).hash).toBe(hash);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("the command journal, commands.jsonl (BD-93, BD-121)", () => {
  const live = (scenario: LoadedScenario = fake): { session: SessionHandle; varDir: string; dir: (id?: string) => string } => {
    const varDir = tmp("live-var");
    return { session: loadSession(scenario, varDir), varDir, dir: (id = "s-0001") => join(varDir, "sessions", id) };
  };
  let n = 0;
  const send = (s: SessionHandle, role: Role, kind: Command["kind"], args: Record<string, unknown> = {}, client = `c-${role}`, command_id = `k-${++n}`) => s.apply({ command_id, role, kind, args }, client);

  it("has one line per evaluated command, accepted or rejected, in evaluation order, with the ids it was sent with", () => {
    const { session, dir } = live();
    send(session, "ops", "SET_CLOCK", { speed: 10 }, "c-ops", "k-a");
    send(session, "eva:EV1", "ADD_STOP_TASK", { stop_id: "wp-1", text: "x" }, "c-ev1", "k-b"); // FORBIDDEN_ROLE
    send(session, "ops", "START_EVA", {}, "c-ops", "k-c");
    const lines = linesOf<CommandJournalLine>(join(dir(), "commands.jsonl"));
    expect(lines.map((l) => [l.kind, l.role, l.command_id, l.client_id])).toEqual([
      ["SET_CLOCK", "ops", "k-a", "c-ops"],
      ["ADD_STOP_TASK", "eva:EV1", "k-b", "c-ev1"],
      ["START_EVA", "ops", "k-c", "c-ops"],
    ]);
    expect(lines[0]).toMatchObject({ sim_time: T0, args: { speed: 10 } });
  });

  it("records the sim time and the seq the command came after (the log before it was evaluated)", () => {
    const { session, dir } = live();
    send(session, "ops", "START_EVA");
    session.advance(30);
    const lastSeq = session.snapshot([]).seq;
    send(session, "ops", "INJECT_EVENT", { level: "advisory", message: "Later" });
    const [first, second] = linesOf<CommandJournalLine>(join(dir(), "commands.jsonl"));
    expect(first.sim_time).toBe(T0);
    expect(second).toMatchObject({ sim_time: at(30), after_seq: lastSeq });
    expect(second.after_seq).toBeGreaterThan(first.after_seq);
  });

  it("is written after the log write and is not part of log_hash", () => {
    const { session, dir } = live();
    send(session, "ops", "START_EVA");
    const events = linesOf<LogEvent>(join(dir(), "session.jsonl"));
    expect(events.map((e) => e.kind)).toContain("EVA_STARTED");
    expect(session.snapshot([]).session.log_hash).toBe(sha256(readFileSync(join(dir(), "session.jsonl"))));
    expect(readFileSync(join(dir(), "commands.jsonl"), "utf8").split("\n").filter(Boolean)).toHaveLength(1);
  });

  it("does not journal a resent command id: it is answered from memory and logs nothing", () => {
    const { session, dir } = live();
    send(session, "ops", "START_EVA", {}, "c-ops", "k-same");
    send(session, "ops", "START_EVA", {}, "c-ops", "k-same");
    expect(linesOf(join(dir(), "commands.jsonl"))).toHaveLength(1);
  });

  it("journals a successful LOAD_SCENARIO in the new session, omits an unknown scenario and journals a rejected one", () => {
    const { session, dir } = live();
    const unknown = send(session, "ops", "LOAD_SCENARIO", { scenario_id: "nowhere" });
    expect(unknown.result.ok).toBe(false);
    const reload = send(session, "ops", "LOAD_SCENARIO", { scenario_id: fake.scenario.scenario_id });
    expect(reload.replaced).toBe(true);
    expect(linesOf(join(dir("s-0001"), "commands.jsonl"))).toHaveLength(0);
    send(session, "ops", "START_EVA"); // session 2 is LOADED; a load while the EVA runs is BUSY and is logged
    send(session, "ops", "LOAD_SCENARIO", { scenario_id: fake.scenario.scenario_id });
    expect(linesOf<CommandJournalLine>(join(dir("s-0002"), "commands.jsonl")).map((l) => l.kind)).toEqual(["LOAD_SCENARIO", "START_EVA", "LOAD_SCENARIO"]);
  });

  it("journals RESET_SESSION in the old session's file and starts an empty one for the new session", () => {
    const { session, dir } = live();
    send(session, "ops", "START_EVA");
    send(session, "presenter", "RESET_SESSION");
    expect(linesOf<CommandJournalLine>(join(dir("s-0001"), "commands.jsonl")).map((l) => l.kind)).toEqual(["START_EVA", "RESET_SESSION"]);
    expect(readFileSync(join(dir("s-0002"), "commands.jsonl"), "utf8")).toBe("");
  });

  it("goes on after a restart: a resumed session appends to the same file", () => {
    const { session, dir, varDir } = live();
    send(session, "ops", "START_EVA");
    session.advance(10);
    const resumed = resumeSession(dir(), fake);
    send(resumed, "ops", "INJECT_EVENT", { level: "advisory", message: "After restart" });
    expect(linesOf<CommandJournalLine>(join(varDir, "sessions/s-0001/commands.jsonl")).map((l) => l.kind)).toEqual(["START_EVA", "INJECT_EVENT"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("export from a live session replays to the session's own log_hash (T32.16 step 6; BD-93, BD-121)", () => {
  let n = 0;
  const send = (s: SessionHandle, role: Role, kind: Command["kind"], args: Record<string, unknown> = {}, client = `c-${role}`, command_id = `k-${++n}`) => s.apply({ command_id, role, kind, args }, client);

  /** Two sessions driven through session.ts by fake clients: mixed accepted and rejected commands, one RESET_SESSION. */
  function drive(): { varDir: string; session: SessionHandle } {
    const varDir = tmp("live-var");
    const session = loadSession(fake, varDir);
    send(session, "ops", "SET_CLOCK", { speed: 10 });
    send(session, "planner", "PUBLISH_PLAN", { plan: fake.scenario.plan }); // accepted: the plan is published again in LOADED
    send(session, "eva:EV1", "ADD_STOP_TASK", { stop_id: "wp-1", text: "Not mine" }); // FORBIDDEN_ROLE
    send(session, "ops", "START_EVA");
    session.advance(300);
    send(session, "ops", "INJECT_EVENT", { level: "advisory", message: "Check suit" }, "c-ops", "k-inj");
    send(session, "ops", "INJECT_EVENT", { level: "advisory", message: "Check suit" }, "c-ops", "k-inj"); // resent: not applied twice
    send(session, "ops", "START_EVA"); // BUSY
    session.advance(120);
    send(session, "presenter", "JUMP_NEXT_STOP");
    session.advance(45);
    send(session, "ops", "SET_CLOCK", { paused: true });
    send(session, "ops", "SET_CLOCK", { paused: false });
    send(session, "planner", "PUBLISH_PLAN", { plan: fake.scenario.plan }); // BUSY
    session.advance(10);
    send(session, "presenter", "RESET_SESSION");
    // Session 2
    send(session, "ops", "START_EVA");
    session.advance(200);
    send(session, "ops", "INJECT_EVENT", { level: "caution", message: "Second session" });
    session.advance(50);
    send(session, "presenter", "JUMP_NEXT_EVENT");
    session.advance(15);
    return { varDir, session };
  }

  it("exports one list per session, split at the reset, each replaying to the hash of its own session log", async () => {
    const { varDir, session } = drive();
    const list1 = exportCommandList(join(varDir, "sessions/s-0001"));
    const list2 = exportCommandList(join(varDir, "sessions/s-0002"));
    expect(list1).toMatchObject({ scenario_id: fake.scenario.scenario_id, seed: fake.scenario.seed, session_id: "s-0001" });
    expect(list2).toMatchObject({ session_id: "s-0002" });
    expect(list1.commands.map((c) => c.kind)).toEqual(["SET_CLOCK", "PUBLISH_PLAN", "ADD_STOP_TASK", "START_EVA", "INJECT_EVENT", "START_EVA", "JUMP_NEXT_STOP", "SET_CLOCK", "SET_CLOCK", "PUBLISH_PLAN", "RESET_SESSION"]);
    expect(list2.commands.map((c) => c.kind)).toEqual(["START_EVA", "INJECT_EVENT", "JUMP_NEXT_EVENT"]);
    expect(list1.commands[4]).toMatchObject({ command_id: "k-inj", client_id: "c-ops", role: "ops" });

    const hash1 = sha256(readFileSync(join(varDir, "sessions/s-0001/session.jsonl")));
    const hash2 = session.snapshot([]).session.log_hash;
    expect(hash2).not.toBe(hash1);
    expect((await run(list1)).hash).toBe(hash1);
    expect((await run(list2, FAKE, "s-0002")).hash).toBe(hash2);
  });

  it("the exported list is canonical JSON-safe: it survives a write and a read, and replays to the same hash", async () => {
    const { varDir } = drive();
    const out = tmp("export-out");
    const files = exportCommandLists(join(varDir, "sessions"), out);
    expect(files.map((f) => f.replace(out + "/", ""))).toEqual(["s-0001.commands.json", "s-0002.commands.json"]);
    const reread = JSON.parse(readFileSync(join(out, "s-0001.commands.json"), "utf8")) as CommandList;
    expect((await run(reread)).hash).toBe(sha256(readFileSync(join(varDir, "sessions/s-0001/session.jsonl"))));
  });

  it("the same journal exports to the same bytes twice", () => {
    const { varDir } = drive();
    const a = JSON.stringify(exportCommandList(join(varDir, "sessions/s-0002")));
    expect(JSON.stringify(exportCommandList(join(varDir, "sessions/s-0002")))).toBe(a);
  });

  it("a session with no command exports an empty list that replays to its hash, and a folder with no journal is an error", async () => {
    const varDir = tmp("live-var");
    const session = loadSession(fake, varDir);
    const list = exportCommandList(join(varDir, "sessions/s-0001"));
    expect(list.commands).toEqual([]);
    expect((await run(list)).hash).toBe(session.snapshot([]).session.log_hash);
    expect(() => exportCommandList(tmp("nothing"))).toThrow(/commands\.jsonl/);
  });
});
