import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Recording, LogEvent } from "@marswalk/protocol";
import { logHashOf } from "@marswalk/protocol";
import { createReplaySource } from "../../src/net/replaySource";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const event = { seq: 1, sim_time: "2026-01-01T00:00:01Z", kind: "EVA_STARTED", actor: "ops", data: {}, provenance: {} } as unknown as LogEvent;
const recording = { format: "marswalk-recording", version: 1, scenario_id: "test", seed: 1, data_version: "v1", label: "replayed recording", log_hash: logHashOf([event], sha), messages: [
  { type: "SNAPSHOT", seq: 0, sim_time: "2026-01-01T00:00:00Z", session: { session_id: "s", status: "loaded" }, crew: [], vehicles: [], alerts: [], options: [], tasks: [] },
  { type: "EVENT", seq: 1, sim_time: event.sim_time, event },
  { type: "STATE_DELTA", seq: 1, sim_time: event.sim_time, changes: [{ path: "session/status", value: "ended" }] },
] } as unknown as Recording;

describe("recorded replay", () => {
  it("plays to end", async () => {
    const source = await createReplaySource(recording, sha);
    expect(source.state()?.session.status).toBe("loaded");
    source.step(); source.step();
    expect(source.state()?.session.status).toBe("ended");
    expect(source.events()).toEqual([event]);
    expect(source.playbackState()).toBe("ended");
  });
  it("hash matches and rejects incomplete or altered logs", async () => {
    const source = await createReplaySource(recording, sha);
    expect(source.verifiedHash()).toBe(recording.log_hash);
    const altered = await createReplaySource({ ...recording, log_hash: "wrong" }, sha);
    expect(altered.verifiedHash()).toBeNull();
    const incomplete = await createReplaySource({ ...recording, messages: [recording.messages[0]] }, sha);
    expect(incomplete.verifiedHash()).toBeNull();
  });
  it("no network and commands are rejected", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const source = await createReplaySource(recording, sha);
    source.step();
    expect((await source.send({ kind: "START_EVA", args: {} } as never)).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
