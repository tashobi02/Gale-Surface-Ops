/** BUG-002: command dedupe survives a real scenario load, reconnect and restart (05 Command; 02 §E.6). */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Command, CommandJournalLine, LogEvent } from "@marswalk/protocol";
import { AcceptedCommands } from "../src/commands";
import { exportCommandList, replayHeadless } from "../src/replay";
import { readScenario } from "../src/scenario";
import { loadSession, resumeSession } from "../src/session";

const fixture = join(import.meta.dirname, "fixtures/fake-scenario");
const site = { site_id: "mock_site", data_version: "mock_site-fixture", dir: null };
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(process.cwd(), ".bug002-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const scenario = () => readScenario(fixture, site);
const command = (scenario_id: string): Command => ({ command_id: "load-once", role: "ops", kind: "LOAD_SCENARIO", args: { scenario_id } });
const lines = <T>(path: string): T[] => readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);

describe("LOAD_SCENARIO dedupe (BUG-002)", () => {
  it("returns the first result without replacing the session again and journals the load once", () => {
    const loaded = scenario();
    const dir = tmp();
    const session = loadSession(loaded, dir);
    const load = command(loaded.scenario.scenario_id);
    const first = session.apply(load, "client-a");
    const id = session.snapshot([]).session.session_id;
    const events = session.eventsAfter(0);
    const second = session.apply(load, "client-a");
    expect(first.result.ok).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(second.replaced).toBeUndefined();
    expect(session.snapshot([]).session.session_id).toBe(id);
    expect(session.eventsAfter(0)).toEqual(events);
    expect(readdirSync(join(dir, "sessions"))).toHaveLength(2);
    const journal = lines<CommandJournalLine>(join(dir, "sessions", id, "commands.jsonl"));
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ kind: "LOAD_SCENARIO", client_id: "client-a", command_id: "load-once", after_seq: 0 });
  });

  it("reconstructs the accepted load from the real seeded event log after restart", () => {
    const loaded = scenario();
    const dir = tmp();
    const session = loadSession(loaded, dir);
    const load = command(loaded.scenario.scenario_id);
    const first = session.apply(load, "client-a");
    const id = session.snapshot([]).session.session_id;
    const events = session.eventsAfter(0);
    expect(events[0]).toMatchObject({ kind: "SESSION_LOADED", actor: "ops", command_ref: { client_id: "client-a", command_id: "load-once" } });
    expect(events.some((e) => e.kind === "TASK_ADDED")).toBe(true);
    expect(events.filter((e) => e.kind === "TASK_ADDED").every((e) => e.actor === "system" && e.command_ref === null)).toBe(true);
    expect(AcceptedCommands.fromLog(events).get("client-a", "load-once")).toEqual(first.result);
    const resumed = resumeSession(join(dir, "sessions", id), loaded);
    expect(resumed.apply(load, "client-a").result).toEqual(first.result);
    expect(resumed.snapshot([]).session.session_id).toBe(id);
    expect(resumed.eventsAfter(0)).toEqual(events);
  });

  it("exports a loaded session that replays to its original deterministic hash", async () => {
    const loaded = scenario();
    const dir = tmp();
    const session = loadSession(loaded, dir);
    const load = command(loaded.scenario.scenario_id);
    session.apply(load, "client-a");
    session.apply({ command_id: "clock-after-load", role: "ops", kind: "SET_CLOCK", args: { speed: 10 } }, "client-a");
    const snap = session.snapshot([]);
    const list = exportCommandList(join(dir, "sessions", snap.session.session_id));
    expect.soft(list.initial_load).toMatchObject({ command_id: load.command_id, client_id: "client-a", role: load.role, kind: load.kind, args: load.args });
    const replayDir = tmp();
    const hash = await replayHeadless(fixture, undefined, { site, varDir: replayDir, commands: list });
    const [replayFolder] = readdirSync(join(replayDir, "replay"));
    const replayed = lines<LogEvent>(join(replayDir, "replay", replayFolder, "sessions", snap.session.session_id, "session.jsonl"));
    expect.soft(replayed[0]).toMatchObject({ kind: "SESSION_LOADED", actor: "ops", command_ref: { client_id: "client-a", command_id: "load-once" } });
    expect(hash).toBe(snap.session.log_hash);
    expect(await replayHeadless(fixture, undefined, { site, varDir: tmp(), commands: list })).toBe(hash);
  });

  it("clears accepted loads on RESET_SESSION, including after restart", () => {
    const loaded = scenario();
    const dir = tmp();
    const session = loadSession(loaded, dir);
    const load = command(loaded.scenario.scenario_id);
    session.apply(load, "client-a");
    session.apply({ command_id: "reset", role: "presenter", kind: "RESET_SESSION", args: {} }, "presenter");
    const id = session.snapshot([]).session.session_id;
    const resumed = resumeSession(join(dir, "sessions", id), loaded);
    expect(resumed.apply(load, "client-a").replaced).toBe(true);
    expect(resumed.snapshot([]).session.session_id).not.toBe(id);
  });

  it("does not carry unrelated accepted commands across a load and keeps client ids separate", () => {
    const loaded = scenario();
    const session = loadSession(loaded, tmp());
    const clock: Command = { command_id: "clock", role: "ops", kind: "SET_CLOCK", args: { speed: 10 } };
    expect(session.apply(clock, "client-a").events).toHaveLength(1);
    const load = command(loaded.scenario.scenario_id);
    session.apply(load, "client-a");
    expect(session.apply(clock, "client-a").events).toHaveLength(1);
    expect(session.apply(load, "client-b").replaced).toBe(true);
  });
});
