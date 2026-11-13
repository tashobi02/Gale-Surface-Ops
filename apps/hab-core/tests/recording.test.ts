/**
 * T27.05 (server half): the recording of a headless run for the Pages replay (docs/plan/backend/01-contract.md §7;
 * 02 §E.6 messages; NFR-06, NFR-14). One named test per rule; red before `recording.ts` exists.
 *
 * Rules fixed here (decided by the orchestrator, 12 Nov 2026, BD-105, BD-121):
 * - The recording is the message stream a client would have seen: the first message is the SNAPSHOT of the loaded
 *   session, then EVENT and STATE_DELTA messages. COMMAND_RESULT, PING and LINK_STATE are not part of it.
 * - EVENT `seq` strictly increases and every logged event is in it exactly once: those the first SNAPSHOT already reflects
 *   (SESSION_LOADED, the seeded tasks) follow it at once, so the EVENTs are the whole log and hash to `log_hash` (N-81, BD-148). A STATE_DELTA carries the
 *   log's last `seq` at its sim second, as the live server sends it, so the stream never decreases in `seq` after the logged prefix and a
 *   delta never precedes an event of an earlier second (the contract's "seq strictly increases" is the EVENT rule).
 * - At most one STATE_DELTA per sim second, last value per path, no empty delta.
 * - The label is "replayed recording" (never "live"); the file is canonical JSON, so replaying the same list twice gives
 *   byte-identical bytes.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalJson, logHashOf, type CommandList, type EventMessage, type Recording, type RecordedCommand, type Snapshot, type StateDelta } from "@marswalk/protocol";
import { replayHeadless } from "../src/replay";
import { RecordingCollector, recordingJson } from "../src/recording";
import { readScenario } from "../src/scenario";

const here = dirname(fileURLToPath(import.meta.url));
const FAKE = join(here, "fixtures/fake-scenario");
const SITE = { site_id: "mock_site", data_version: "mock_site-fixture", dir: null };
const fake = readScenario(FAKE, SITE);
const T0 = fake.scenario.start_utc;
const at = (s: number): string => new Date(Date.parse(T0) + s * 1000).toISOString().replace(".000Z", "Z");

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const list: CommandList = {
  $comment: "recording test",
  scenario_id: fake.scenario.scenario_id,
  seed: fake.scenario.seed,
  commands: [
    { sim_time: at(0), role: "ops", kind: "START_EVA", args: {} },
    { sim_time: at(40), role: "ops", kind: "INJECT_EVENT", args: { level: "advisory", message: "Recording check" } },
    { sim_time: at(40), role: "ops", kind: "SET_CLOCK", args: { speed: 10 } },
  ] as RecordedCommand[],
};

async function record(periodS?: number): Promise<{ hash: string; recording: Recording }> {
  const varDir = mkdtempSync(join(tmpdir(), "marswalk-recording-"));
  dirs.push(varDir);
  const collector = new RecordingCollector(periodS);
  const hash = await replayHeadless(FAKE, undefined, { site: SITE, varDir, commands: list, record: collector });
  return { hash, recording: collector.finish() };
}

type Message = Recording["messages"][number];
const isEvent = (m: Message): m is EventMessage => m.type === "EVENT";
const isDelta = (m: Message): m is StateDelta => m.type === "STATE_DELTA";

describe("the recording of a headless run (BD-105)", () => {
  it("starts with the SNAPSHOT of the loaded session, with no clients", async () => {
    const { recording } = await record();
    const first = recording.messages[0] as Snapshot;
    expect(first.type).toBe("SNAPSHOT");
    expect(first.session.status).toBe("LOADED");
    expect(first.clients).toEqual([]);
    expect(recording.messages.filter((m) => m.type === "SNAPSHOT")).toHaveLength(1);
  });

  it("holds only SNAPSHOT, EVENT and STATE_DELTA messages", async () => {
    const { recording } = await record();
    expect(new Set(recording.messages.map((m) => m.type))).toEqual(new Set(["SNAPSHOT", "EVENT", "STATE_DELTA"]));
  });

  it("the EVENTs are the whole log, seq 1..n with no gap, each once: the ones before the SNAPSHOT's seq come right after it (N-81)", async () => {
    const { recording } = await record();
    const first = recording.messages[0] as Snapshot;
    const events = recording.messages.filter(isEvent);
    const seqs = events.map((m) => m.seq);
    expect(first.seq).toBeGreaterThan(0); // the loaded session already holds SESSION_LOADED and the seeded tasks
    expect(seqs.length).toBeGreaterThan(first.seq + 5);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
    expect(events[0]!.event.kind).toBe("SESSION_LOADED");
    for (const m of events) expect(m.event.seq).toBe(m.seq);
    // The messages before the first later-than-snapshot event are the SNAPSHOT and the log it already reflects.
    expect(recording.messages.slice(1, 1 + first.seq).every(isEvent)).toBe(true);
  });

  it("the recorded events alone hash to the recorded log_hash (what the Pages replay verifies; N-81)", async () => {
    const { recording } = await record();
    const events = recording.messages.filter(isEvent).map((m) => m.event);
    expect(logHashOf(events, (text) => createHash("sha256").update(text, "utf8").digest("hex"))).toBe(recording.log_hash);
  });

  it("the stream's seq never decreases: a STATE_DELTA carries the last event seq of its second", async () => {
    const { recording } = await record();
    const first = recording.messages[0] as Snapshot;
    // From the end of the logged prefix (the events the SNAPSHOT already reflects, N-81) on, the stream never goes back.
    const rest = recording.messages.slice(first.seq);
    const seqs = rest.map((m) => ("seq" in m ? m.seq : -1));
    expect(seqs[0]).toBe(first.seq);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i], `message ${first.seq + i}`).toBeGreaterThanOrEqual(seqs[i - 1]);
  });

  it("has at most one STATE_DELTA per sim second, never an empty one, and the last value per path", async () => {
    const { recording } = await record();
    const deltas = recording.messages.filter(isDelta);
    expect(deltas.length).toBeGreaterThan(10);
    const seconds = deltas.map((d) => d.sim_time);
    expect(new Set(seconds).size).toBe(seconds.length);
    for (const d of deltas) {
      expect(d.changes.length).toBeGreaterThan(0);
      const paths = d.changes.map((c) => c.path);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });

  it("deltas come in sim-time order and follow the events of their own second", async () => {
    const { recording } = await record();
    const times = recording.messages.slice(1).map((m) => Date.parse((m as EventMessage | StateDelta).sim_time));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
  });

  it("the deltas carry the crew's motion: the last crew/EV1/x_m is where the session left EV1", async () => {
    const { recording } = await record();
    const xs = recording.messages.filter(isDelta).flatMap((d) => d.changes.filter((c) => c.path === "crew/EV1/x_m").map((c) => c.value as number));
    expect(xs.length).toBeGreaterThan(10);
    expect(Math.max(...xs)).toBeGreaterThan(900); // the first stop of the fixture plan is 1000 m out
  });

  it("is labelled replayed recording and names the run: scenario, seed, data version, final log_hash", async () => {
    const { recording, hash } = await record();
    expect(recording).toMatchObject({ format: "marswalk-recording", version: 1, label: "replayed recording", scenario_id: fake.scenario.scenario_id, seed: fake.scenario.seed, data_version: fake.scenario.data_version, log_hash: hash });
  });

  it("replaying the same list twice gives byte-identical JSON (canonical key order)", async () => {
    const a = recordingJson((await record()).recording);
    const b = recordingJson((await record()).recording);
    expect(b).toBe(a);
    expect(a).toBe(`${canonicalJson(JSON.parse(a))}\n`);
  });

  it("recording does not change the run: the log_hash is that of the same list replayed without it", async () => {
    const varDir = mkdtempSync(join(tmpdir(), "marswalk-recording-"));
    dirs.push(varDir);
    const plain = await replayHeadless(FAKE, undefined, { site: SITE, varDir, commands: list });
    expect((await record()).hash).toBe(plain);
  });

  describe("a coarser delta period keeps the file small (BD-148)", () => {
    it("rejects a period that is not a whole number of seconds of at least 1", () => {
      expect(() => new RecordingCollector(0)).toThrow(/period/);
      expect(() => new RecordingCollector(2.5)).toThrow(/period/);
    });

    it("with 5 s there is at most one STATE_DELTA per 5-s window, fewer deltas than at 1 s, the same EVENTs and the same log_hash", async () => {
      const fine = await record();
      const coarse = await record(5);
      const t0 = Date.parse(T0);
      const windows = coarse.recording.messages.filter(isDelta).map((d) => Math.floor((Date.parse(d.sim_time) - t0) / 5000));
      expect(new Set(windows).size).toBe(windows.length);
      expect(coarse.recording.messages.filter(isDelta).length).toBeLessThan(fine.recording.messages.filter(isDelta).length / 2);
      expect(coarse.recording.messages.filter(isEvent)).toEqual(fine.recording.messages.filter(isEvent));
      expect(coarse.hash).toBe(fine.hash);
      expect(recordingJson(coarse.recording).length).toBeLessThan(recordingJson(fine.recording).length);
    });

    it("keeps the sim-time order, and the last value per path is where the run ended", async () => {
      const fine = await record();
      const coarse = await record(5);
      const times = coarse.recording.messages.slice(1).map((m) => Date.parse((m as EventMessage | StateDelta).sim_time));
      for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
      const last = (r: Recording, path: string): unknown => r.messages.filter(isDelta).flatMap((d) => d.changes.filter((c) => c.path === path)).pop()?.value;
      expect(last(coarse.recording, "crew/EV1/x_m")).toEqual(last(fine.recording, "crew/EV1/x_m"));
    });
  });
});
