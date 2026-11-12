/**
 * T27.05 — recorded replay source (FR-34, FR-46; N-21). The expected hash is computed here with node:crypto over the
 * canonical log lines, never with the code under test. Session statuses use the protocol's real values (LOADED, ENDED).
 */
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalJson, PROTOCOL_VERSION, type LogEvent, type Recording, type Snapshot } from "@marswalk/protocol";
import connect from "../fixtures/ws/connect.json";
import { createReplaySource, replaySha256 } from "../../src/net/replaySource";

const nodeSha = (text: string): string => createHash("sha256").update(text).digest("hex");
/** session.jsonl bytes (05 Session): one canonical JSON line per event. Independent of logHashOf. */
const expectedHash = (events: LogEvent[]): string => nodeSha(events.map((e) => `${canonicalJson(e)}\n`).join(""));

const event = (seq: number, sim_time: string): LogEvent => ({ seq, sim_time, kind: "EVA_STARTED", actor: "ops", data: {}, provenance: {}, command_ref: null }) as LogEvent;

function snapshot(): Snapshot {
  const s = structuredClone((connect as unknown as Snapshot[])[0]!);
  s.seq = 0;
  s.sim_time = "2024-05-20T13:00:00Z";
  s.session.status = "LOADED";
  return s;
}

function recording(): Recording {
  const e1 = event(1, "2024-05-20T13:00:10Z");
  const e2 = event(2, "2024-05-20T13:01:00Z");
  return {
    format: "marswalk-recording", version: 1, scenario_id: "storm-sol4190", seed: 4190, data_version: "v1", label: "replayed recording",
    log_hash: expectedHash([e1, e2]),
    messages: [
      snapshot(),
      { v: PROTOCOL_VERSION, type: "EVENT", seq: 1, sim_time: e1.sim_time, event: e1 },
      { v: PROTOCOL_VERSION, type: "STATE_DELTA", seq: 1, sim_time: e1.sim_time, changes: [{ path: "session/status", value: "RUNNING" }] },
      { v: PROTOCOL_VERSION, type: "EVENT", seq: 2, sim_time: e2.sim_time, event: e2 },
      { v: PROTOCOL_VERSION, type: "STATE_DELTA", seq: 2, sim_time: e2.sim_time, changes: [{ path: "session/status", value: "ENDED" }] },
    ],
  } as Recording;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("recorded replay", () => {
  it("plays to end", async () => {
    const rec = recording();
    const source = await createReplaySource(rec, nodeSha);
    expect(source.state()?.session.status).toBe("LOADED");
    expect(source.position()).toEqual({ index: 1, total: 5, simTime: "2024-05-20T13:00:00Z" });
    for (let i = 0; i < 4; i++) source.step();
    expect(source.state()?.session.status).toBe("ENDED");
    expect(source.events().map((e) => e.seq)).toEqual([1, 2]);
    expect(source.playbackState()).toBe("ended");
    expect(source.position()).toEqual({ index: 5, total: 5, simTime: "2024-05-20T13:01:00Z" });
  });

  it("advances by sim time and notifies once per batch", async () => {
    const source = await createReplaySource(recording(), nodeSha);
    const listener = vi.fn();
    source.subscribe(listener);
    expect(source.advanceTo(Date.parse("2024-05-20T13:00:30Z"))).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(source.state()?.session.status).toBe("RUNNING");
    expect(source.nextSimTimeMs()).toBe(Date.parse("2024-05-20T13:01:00Z"));
    expect(source.advanceTo(Date.parse("2024-05-20T13:00:40Z"))).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    source.reset();
    expect(source.state()?.session.status).toBe("LOADED");
    expect(source.events()).toEqual([]);
  });

  it("hash matches: verified with recorded and computed", async () => {
    const rec = recording();
    const source = await createReplaySource(rec, nodeSha);
    expect(source.hashCheck()).toMatchObject({ status: "verified", recorded: rec.log_hash, computed: rec.log_hash });
  });

  it("an altered recorded hash is a mismatch that keeps both hashes", async () => {
    const rec = recording();
    const computed = rec.log_hash;
    const source = await createReplaySource({ ...rec, log_hash: "0".repeat(64) }, nodeSha);
    expect(source.hashCheck()).toMatchObject({ status: "mismatch", recorded: "0".repeat(64), computed });
  });

  it("a tampered event is a mismatch", async () => {
    const rec = recording();
    (rec.messages[1] as { event: LogEvent }).event.actor = "eva:EV2" as LogEvent["actor"];
    const check = (await createReplaySource(rec, nodeSha)).hashCheck();
    expect(check.status).toBe("mismatch");
    expect(check.computed).not.toBe(check.recorded);
  });

  it("an incomplete log (gap or events not starting at seq 1) is incomplete, not a mismatch", async () => {
    const rec = recording();
    const gap = await createReplaySource({ ...rec, messages: [rec.messages[0]!, rec.messages[3]!] }, nodeSha);
    expect(gap.hashCheck()).toMatchObject({ status: "incomplete", recorded: rec.log_hash, computed: null });
  });

  it("a recording without a log hash, or a hash function that fails, is unverifiable", async () => {
    const rec = recording();
    expect((await createReplaySource({ ...rec, log_hash: "" }, nodeSha)).hashCheck()).toMatchObject({ status: "unverifiable", recorded: null });
    const failing = await createReplaySource(rec, () => { throw new Error("no digest"); });
    expect(failing.hashCheck()).toMatchObject({ status: "unverifiable", computed: null });
    expect(failing.hashCheck().reason).toContain("no digest");
  });

  it("verifies without crypto.subtle (http:// LAN origin) using the pure-TS SHA-256", async () => {
    vi.stubGlobal("crypto", {});
    const rec = recording();
    expect(await replaySha256("abc")).toBe(nodeSha("abc"));
    expect((await createReplaySource(rec)).hashCheck().status).toBe("verified");
  });

  it("invalid recordings are rejected with one clear error", async () => {
    const rec = recording();
    for (const bad of [null, { ...rec, version: 2 }, { ...rec, messages: [] }, { ...rec, messages: [rec.messages[1]] }]) {
      await expect(createReplaySource(bad as unknown as Recording, nodeSha)).rejects.toThrow("Invalid recording");
    }
  });

  it("a STATE_DELTA without changes does not throw; an unresolvable path warns (shared delta applicator)", async () => {
    const rec = recording();
    rec.messages.splice(1, 0, { v: PROTOCOL_VERSION, type: "STATE_DELTA", seq: 0, sim_time: "2024-05-20T13:00:01Z" } as never);
    rec.messages.splice(2, 0, { v: PROTOCOL_VERSION, type: "STATE_DELTA", seq: 0, sim_time: "2024-05-20T13:00:02Z", changes: [{ path: "crew/EV9/x_m", value: 1 }] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const source = await createReplaySource(rec, nodeSha);
    const before = source.state();
    expect(() => source.step()).not.toThrow();
    source.step();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("EV9"));
    expect(source.state()?.crew).toEqual(before?.crew);
  });

  it("no network: playing a recording makes no request, and commands are refused as read-only", async () => {
    const fetchSpy = vi.fn(async () => new Response(""));
    vi.stubGlobal("fetch", fetchSpy);
    const source = await createReplaySource(recording(), nodeSha);
    while (source.playbackState() !== "ended") source.step();
    const result = await source.send({ kind: "START_EVA", args: {} } as never);
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN_ROLE", message: "Read-only replay" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
